package main

import (
	"io/fs"
	"log"
	"net/http"

	"goapi/api"
)

func startServer() {
	mux := http.NewServeMux()

	staticFS, _ := fs.Sub(static, "static")
	mux.Handle("GET /", http.FileServerFS(staticFS))
	mux.HandleFunc("GET /health", api.HealthHandler)
	mux.HandleFunc("GET /system", api.SystemHandler)
	mux.HandleFunc("GET /processes", api.ProcessesHandler)
	mux.HandleFunc("GET /processes/{pid}/affinity", api.GetAffinityHandler)
	mux.HandleFunc("PUT /processes/{pid}/affinity", api.SetAffinityHandler)
	mux.HandleFunc("GET /assignments", api.GetAssignmentsHandler)
	mux.HandleFunc("POST /assignments", api.SaveAssignmentHandler)
	mux.HandleFunc("GET /profiles", api.GetProfilesHandler)
	mux.HandleFunc("POST /profiles", api.SaveProfileHandler)
	mux.HandleFunc("DELETE /profiles/{name}", api.DeleteProfileHandler)
	mux.HandleFunc("GET /version", api.VersionHandler)
	mux.HandleFunc("GET /ws", api.WSHandler)
	mux.HandleFunc("GET /ws/processes", api.ProcessesWSHandler)
	

	api.StartWatcher()

	log.Println("server listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
