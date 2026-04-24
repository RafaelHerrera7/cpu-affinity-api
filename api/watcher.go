package api

import (
	"log"
	"time"

	"goapi/win32"
)

func StartWatcher() {
	go func() {
		seen := map[uint32]bool{}
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()

		for range ticker.C {
			assignments, err := readAssignments()
			if err != nil || len(assignments) == 0 {
				continue
			}

			profiles, err := readProfilesFile()
			if err != nil || len(profiles) == 0 {
				continue
			}

			profileIndex := map[string]uint64{}
			for _, p := range profiles {
				profileIndex[p.Name] = p.Mask
			}

			procs, err := win32.ListProcesses()
			if err != nil {
				continue
			}

			current := map[uint32]bool{}
			for _, p := range procs {
				current[p.PID] = true
			}

			for pid := range seen {
				if !current[pid] {
					delete(seen, pid)
				}
			}

			for _, p := range procs {
				if p.Restricted || seen[p.PID] {
					continue
				}
				profileName, ok := assignments[p.Name]
				if !ok {
					continue
				}
				mask, ok := profileIndex[profileName]
				if !ok {
					continue
				}
				if err := win32.SetProcessAffinity(p.PID, mask); err != nil {
					log.Printf("watcher: %s (%d) -> %s: %v", p.Name, p.PID, profileName, err)
					continue
				}
				log.Printf("watcher: %s (%d) -> %s (mask %d)", p.Name, p.PID, profileName, mask)
				seen[p.PID] = true
			}
		}
	}()
}
