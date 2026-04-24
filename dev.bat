@echo off
taskkill /F /IM goapi.exe 2>nul
go build -ldflags "-H windowsgui" -o goapi.exe . && start goapi.exe
