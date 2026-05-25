package api

import (
	"encoding/json"
	"net/http"
	"runtime"
	"strconv"

	"goapi/win32"
)

var Version = "dev"

func VersionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"version": Version})
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func SystemHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"cores": runtime.NumCPU()})
}

func ProcessesHandler(w http.ResponseWriter, r *http.Request) {
	procs, err := win32.ListProcesses()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(procs)
}

func GetAffinityHandler(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.ParseUint(r.PathValue("pid"), 10, 32)
	if err != nil {
		http.Error(w, "invalid pid", http.StatusBadRequest)
		return
	}
	mask, err := win32.GetProcessAffinity(uint32(pid))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]uint64{"mask": mask})
}

func SetAffinityHandler(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.ParseUint(r.PathValue("pid"), 10, 32)
	if err != nil {
		http.Error(w, "invalid pid", http.StatusBadRequest)
		return
	}
	var body struct {
		Mask uint64 `json:"mask"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := win32.SetProcessAffinity(uint32(pid), body.Mask); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
