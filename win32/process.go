package win32

import (
	"fmt"
	"runtime"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type Process struct {
	PID        uint32
	PPID       uint32
	Name       string
	Restricted bool
	CPU        float64
}

type cpuSample struct {
	kernel     uint64
	user       uint64
	sampleTime time.Time
}

var (
	cpuMu       sync.Mutex
	prevSamples = map[uint32]cpuSample{}
)

func filetimeToUint64(ft windows.Filetime) uint64 {
	return uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime)
}

func ListProcesses() ([]Process, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("CreateToolhelp32Snapshot: %w", err)
	}
	defer windows.CloseHandle(snapshot)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	if err := windows.Process32First(snapshot, &entry); err != nil {
		return nil, fmt.Errorf("Process32First: %w", err)
	}

	now := time.Now()
	numCPU := float64(runtime.NumCPU())

	cpuMu.Lock()
	defer cpuMu.Unlock()

	seenPIDs := map[uint32]bool{}
	var procs []Process

	for {
		proc := Process{
			PID:  entry.ProcessID,
			PPID: entry.ParentProcessID,
			Name: windows.UTF16ToString(entry.ExeFile[:]),
		}
		seenPIDs[entry.ProcessID] = true

		h, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_SET_INFORMATION, false, entry.ProcessID)
		if err != nil {
			proc.Restricted = true
		} else {
			var creation, exit, kernel, user windows.Filetime
			if err := windows.GetProcessTimes(h, &creation, &exit, &kernel, &user); err == nil {
				kt := filetimeToUint64(kernel)
				ut := filetimeToUint64(user)
				if prev, ok := prevSamples[entry.ProcessID]; ok {
					elapsed := now.Sub(prev.sampleTime).Seconds()
					if elapsed > 0 {
						delta := float64((kt - prev.kernel) + (ut - prev.user))
						// FILETIME units are 100ns intervals; divide by 1e7 to get seconds
						cpu := (delta / 1e7) / (elapsed * numCPU) * 100
						if cpu > 100 {
							cpu = 100
						}
						proc.CPU = cpu
					}
				}
				prevSamples[entry.ProcessID] = cpuSample{kt, ut, now}
			}
			windows.CloseHandle(h)
		}

		procs = append(procs, proc)

		if err := windows.Process32Next(snapshot, &entry); err != nil {
			if err == windows.ERROR_NO_MORE_FILES {
				break
			}
			return nil, fmt.Errorf("Process32Next: %w", err)
		}
	}

	// Clean up samples for processes that no longer exist
	for pid := range prevSamples {
		if !seenPIDs[pid] {
			delete(prevSamples, pid)
		}
	}

	return procs, nil
}

func GetProcessByPID(pid uint32) (Process, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return Process{}, fmt.Errorf("CreateToolhelp32Snapshot: %w", err)
	}
	defer windows.CloseHandle(snapshot)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	if err := windows.Process32First(snapshot, &entry); err != nil {
		return Process{}, fmt.Errorf("Process32First: %w", err)
	}

	for {
		if entry.ProcessID == pid {
			return Process{
				PID:  entry.ProcessID,
				PPID: entry.ParentProcessID,
				Name: windows.UTF16ToString(entry.ExeFile[:]),
			}, nil
		}
		if err := windows.Process32Next(snapshot, &entry); err != nil {
			if err == windows.ERROR_NO_MORE_FILES {
				break
			}
			return Process{}, fmt.Errorf("Process32Next: %w", err)
		}
	}

	return Process{}, fmt.Errorf("process with PID %d not found", pid)
}
