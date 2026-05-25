package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

type Profile struct {
	Name string `json:"name"`
	Mask uint64 `json:"mask"`
}

var (
	profilesMu   sync.RWMutex
	profilesPath string
)

func init() {
	exe, err := os.Executable()
	if err != nil {
		profilesPath = "profiles.json"
		return
	}
	profilesPath = filepath.Join(filepath.Dir(exe), "profiles.json")
}

// helpers de disco sin locks — el llamador debe tener el lock adecuado

func readProfilesFromDisk() ([]Profile, error) {
	data, err := os.ReadFile(profilesPath)
	if os.IsNotExist(err) {
		return []Profile{}, nil
	}
	if err != nil {
		return nil, err
	}
	var profiles []Profile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}
	return profiles, nil
}

func writeProfilesToDisk(profiles []Profile) error {
	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(profilesPath, data, 0644)
}

// readProfilesFile es para lecturas puras (watcher, GET handler).
func readProfilesFile() ([]Profile, error) {
	profilesMu.RLock()
	defer profilesMu.RUnlock()
	return readProfilesFromDisk()
}

// modifyProfiles ejecuta fn bajo write lock, garantizando que lectura y escritura son atómicas.
func modifyProfiles(fn func([]Profile) ([]Profile, error)) error {
	profilesMu.Lock()
	defer profilesMu.Unlock()
	profiles, err := readProfilesFromDisk()
	if err != nil {
		return err
	}
	updated, err := fn(profiles)
	if err != nil {
		return err
	}
	return writeProfilesToDisk(updated)
}

func GetProfilesHandler(w http.ResponseWriter, r *http.Request) {
	profiles, err := readProfilesFile()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profiles)
}

func SaveProfileHandler(w http.ResponseWriter, r *http.Request) {
	var p Profile
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if p.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	err := modifyProfiles(func(profiles []Profile) ([]Profile, error) {
		for i, existing := range profiles {
			if existing.Name == p.Name {
				profiles[i] = p
				return profiles, nil
			}
		}
		return append(profiles, p), nil
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func DeleteProfileHandler(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	err := modifyProfiles(func(profiles []Profile) ([]Profile, error) {
		filtered := profiles[:0]
		for _, p := range profiles {
			if p.Name != name {
				filtered = append(filtered, p)
			}
		}
		return filtered, nil
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
