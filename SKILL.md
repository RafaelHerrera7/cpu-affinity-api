# SKILL — GoAPI CPU Affinity Manager

Local HTTP API running on `http://localhost:8080`. Use `curl` to interact with it.
The app must be running (`goapi.exe`) before any call. Requires Administrator privileges to modify process affinity.

## Build & run

```bat
go build -ldflags "-H windowsgui" -o goapi.exe .
goapi.exe
```

Or with the dev script (kills previous instance, rebuilds, launches):

```bat
dev.bat
```

---

## Data types

**Process**
```json
{
  "PID": 1234,
  "PPID": 800,
  "Name": "chrome.exe",
  "Restricted": false,
  "CPU": 3.14
}
```
`Restricted: true` means the process cannot be opened (system/protected). Affinity cannot be set on those.

**Profile**
```json
{ "name": "games", "mask": 15 }
```
`mask` is a bitmask of allowed CPU cores. Core 0 = bit 0, core 1 = bit 1, etc.
Examples: `15` = cores 0-3, `240` = cores 4-7, `255` = all 8 cores.

**Assignment** — maps a process name to a profile name. The watcher auto-applies the profile whenever that process starts.
```json
{ "chrome.exe": "games", "notepad.exe": "background" }
```

---

## Endpoints

### Health check
```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

### CPU core count
```bash
curl http://localhost:8080/system
# {"cores":8}
```

### List all processes
```bash
curl http://localhost:8080/processes
# [{"PID":4,"PPID":0,"Name":"System","Restricted":true,"CPU":0}, ...]
```

### Get affinity mask for a process
```bash
curl http://localhost:8080/processes/1234/affinity
# {"mask":255}
```

### Set affinity mask for a process
```bash
curl -X PUT http://localhost:8080/processes/1234/affinity \
  -H "Content-Type: application/json" \
  -d "{\"mask\": 15}"
# 204 No Content
```

### List profiles
```bash
curl http://localhost:8080/profiles
# [{"name":"games","mask":15},{"name":"background","mask":240}]
```

### Create or update a profile
```bash
curl -X POST http://localhost:8080/profiles \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"games\", \"mask\": 15}"
# 204 No Content
```
If a profile with that name already exists, it is overwritten.

### Delete a profile
```bash
curl -X DELETE http://localhost:8080/profiles/games
# 204 No Content
```

### List assignments (process name → profile name)
```bash
curl http://localhost:8080/assignments
# {"chrome.exe":"games","notepad.exe":"background"}
```

### Save an assignment
```bash
curl -X POST http://localhost:8080/assignments \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"chrome.exe\", \"profile\": \"games\"}"
# 204 No Content
```
Send `"profile": ""` to remove the assignment for that process name.

---

## Watcher behavior

The watcher runs every second. When a process with a saved assignment starts for the first time in its lifetime, the watcher automatically applies the corresponding profile mask. It does not re-apply on subsequent ticks to avoid thrashing.

---

## Mask calculation

**Always query `/system` first** to get the actual core count of the target machine before computing masks.

```bash
curl http://localhost:8080/system
# {"cores": 16}   ← use this number to determine valid masks
```

Formula: `mask = sum of 2^core for each core you want to allow`

Core numbering starts at 0. The mask is a `uint64`, so up to 64 logical cores are supported.

**All-cores mask for any machine:**
```
all_cores_mask = (2^N) - 1   where N = number of logical cores
```

Examples for common counts:

| Logical cores (N) | All-cores mask | Formula |
|---|---|---|
| 4 | 15 | (2^4)−1 |
| 8 | 255 | (2^8)−1 |
| 12 | 4095 | (2^12)−1 |
| 16 | 65535 | (2^16)−1 |
| 24 | 16777215 | (2^24)−1 |
| 32 | 4294967295 | (2^32)−1 |

**Specific core ranges:**

```
# Allow only cores 0–3 (first 4 cores)
mask = 15       # binary: 0000...00001111

# Allow only cores 4–7
mask = 240      # binary: 0000...11110000

# Allow only even cores (0,2,4,6,...)
mask = 5555...  # binary: 0101 0101 ...
# For 16 logical cores: 21845 (0x5555)

# Allow only odd cores (1,3,5,7,...)
# For 16 logical cores: 43690 (0xAAAA)
```

**Quick bash snippet to compute a mask from a list of cores:**
```bash
python -c "cores=[0,1,2,3]; print(sum(2**c for c in cores))"
# 15
```
