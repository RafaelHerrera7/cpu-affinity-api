@echo off
taskkill /F /IM goapi.exe 2>nul
for /f "tokens=*" %%i in ('git rev-parse --short HEAD') do set GIT_HASH=%%i
go build -ldflags "-H windowsgui -X goapi/api.Version=%GIT_HASH%" -o goapi.exe . && start goapi.exe
