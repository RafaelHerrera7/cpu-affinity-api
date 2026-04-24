package win32

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	kernel32                  = windows.NewLazySystemDLL("kernel32.dll")
	procSetProcessAffinityMask = kernel32.NewProc("SetProcessAffinityMask")
	procGetProcessAffinityMask = kernel32.NewProc("GetProcessAffinityMask")
)

// SetProcessAffinity asigna la máscara de afinidad de CPU a un proceso.
// mask es un bitmask donde cada bit representa un núcleo: 0b0011 = núcleos 0 y 1.
func SetProcessAffinity(pid uint32, mask uint64) error {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_SET_INFORMATION, false, pid)
	if err != nil {
		return fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(handle)

	ret, _, err := procSetProcessAffinityMask.Call(uintptr(handle), uintptr(mask))
	if ret == 0 {
		return fmt.Errorf("SetProcessAffinityMask: %w", err)
	}

	return nil
}

// GetProcessAffinity devuelve la máscara de afinidad actual de un proceso.
func GetProcessAffinity(pid uint32) (uint64, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION, false, pid)
	if err != nil {
		return 0, fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(handle)

	var procMask, sysMask uintptr
	ret, _, err := procGetProcessAffinityMask.Call(uintptr(handle), uintptr(unsafe.Pointer(&procMask)), uintptr(unsafe.Pointer(&sysMask)))
	if ret == 0 {
		return 0, fmt.Errorf("GetProcessAffinityMask: %w", err)
	}

	return uint64(procMask), nil
}
