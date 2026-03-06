# Antigravity Auto Accept - Install Guide

## 1) Install

Choose one:

- Open VSX:
  https://open-vsx.org/extension/pesosz/antigravity-auto-accept/
- GitHub Releases:
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases

If you are installing from a VSIX:

1. Open Antigravity.
2. Press `Ctrl+Shift+P`.
3. Run `Extensions: Install from VSIX...`.
4. Select the downloaded `.vsix`.
5. Reload the window if prompted.

## 2) Open The Control Panel

Use one of these:

- click the bottom-right status item `Auto Accept Panel`
- run `Antigravity Auto Accept: Open Control Panel`

Where to look:

- bottom-right side of the IDE
- beneath the chat area
- tools icon plus the label `Auto Accept Panel`

## 3) Configure CDP

1. Choose the CDP port you want.
2. Click `Save Port`.
3. Click `Save IDE Launcher...`.
4. Save the launcher anywhere you want.

Generated launcher type:

- Windows: `.lnk`
- macOS: `.command`
- Linux: `.sh`

## 4) Start Antigravity Correctly

Open Antigravity through the launcher file you saved.

The panel also shows:

- the saved launcher path
- exact step-by-step open instructions
- a manual fallback command

This is the intended workflow now. Users should start from the control panel first, not from an old popup flow.

## 5) Turn It On

Use either:

- `Toggle Auto Accept` inside the control panel
- `Antigravity Auto Accept: Toggle ON/OFF`

If CDP is connected, you can also enable Background Mode.

## 6) Manual Fallback

### Windows

```powershell
$exeCandidates = @(
  "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe",
  "$env:ProgramFiles\Antigravity\Antigravity.exe",
  "$env:ProgramFiles(x86)\Antigravity\Antigravity.exe"
)
$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Host 'Antigravity executable not found'; exit 1 }
Start-Process $exe -ArgumentList '--remote-debugging-port=9000'
```

### macOS

```bash
open -n -a Antigravity --args --remote-debugging-port=9000
```

### Linux

```bash
antigravity --remote-debugging-port=9000 >/dev/null 2>&1 &
```

## 7) Verification

Control panel success signals:

- expected CDP port matches the port you chose
- active CDP ports includes that port
- CDP connections is greater than `0`

If you need a direct check:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9000/json/version
```



