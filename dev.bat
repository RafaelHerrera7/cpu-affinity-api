@echo off
taskkill /F /IM goapi.exe 2>nul
for /f "tokens=*" %%i in ('git describe --tags --always') do set GIT_VERSION=%%i
go build -ldflags "-H windowsgui -X goapi/api.Version=%GIT_VERSION%" -o goapi.exe . && start goapi.exe
