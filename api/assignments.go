package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

var (
	assignmentsMu   sync.RWMutex
	assignmentsPath string
)

func init() {
	exe, err := os.Executable()
	if err != nil {
		assignmentsPath = "assignments.json"
		return
	}
	assignmentsPath = filepath.Join(filepath.Dir(exe), "assignments.json")
}

// helpers de disco sin locks — el llamador debe tener el lock adecuado

func readAssignmentsFromDisk() (map[string]string, error) {
	data, err := os.ReadFile(assignmentsPath)
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	var a map[string]string
	if err := json.Unmarshal(data, &a); err != nil {
		return nil, err
	}
	return a, nil
}

func writeAssignmentsToDisk(a map[string]string) error {
	data, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(assignmentsPath, data, 0644)
}

// readAssignments es para lecturas puras (watcher, GET handler).
func readAssignments() (map[string]string, error) {
	assignmentsMu.RLock()
	defer assignmentsMu.RUnlock()
	return readAssignmentsFromDisk()
}

// modifyAssignments ejecuta fn bajo write lock, garantizando que lectura y escritura son atómicas.
func modifyAssignments(fn func(map[string]string) error) error {
	assignmentsMu.Lock()
	defer assignmentsMu.Unlock()
	a, err := readAssignmentsFromDisk()
	if err != nil {
		return err
	}
	if err := fn(a); err != nil {
		return err
	}
	return writeAssignmentsToDisk(a)
}

func GetAssignmentsHandler(w http.ResponseWriter, r *http.Request) {
	a, err := readAssignments()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a)
}

func SaveAssignmentHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string `json:"name"`
		Profile string `json:"profile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	err := modifyAssignments(func(a map[string]string) error {
		if body.Profile == "" {
			delete(a, body.Name)
		} else {
			a[body.Name] = body.Profile
		}
		return nil
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
