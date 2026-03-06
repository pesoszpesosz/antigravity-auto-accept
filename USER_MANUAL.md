# Antigravity Auto Accept - User Manual

## 1) What This Extension Does

- Auto-accepts repetitive Antigravity approval prompts.
- Exposes a control panel for CDP state and launcher setup.
- Lets users choose the CDP port they want to work with.
- Saves a launcher file anywhere on the machine.
- Supports Background Mode when CDP is connected.

## 2) Recommended Workflow

1. Install the extension.
2. Open the `Auto Accept Panel` status item in the bottom-right corner of the IDE.
3. Set the CDP port you want.
4. If Antigravity is not installed in a default location, click `Choose IDE Path...` and select the real executable.
5. Click `Save IDE Launcher...`.
6. Save the launcher file where you want it.
7. Open Antigravity through that saved launcher.
8. Turn on `Auto Accept`.

Where users should look:

- right side of the bottom status area
- below the chat area
- tools icon with the label `Auto Accept Panel`

## 3) What The Control Panel Shows

- IDE
- platform
- remote context
- extension host
- expected CDP port
- active CDP ports
- CDP connections
- saved launcher path
- exact manual open steps
- manual fallback command

## 4) Launcher Behavior

The launcher is platform-specific:

- Windows: `.lnk`
- macOS: `.command`
- Linux: `.sh`

The important rule is simple:

- if you want the selected CDP port, open Antigravity through the saved launcher

## 5) Auto Accept And Background Mode

### Auto Accept

Use:

- `Toggle Auto Accept` in the control panel
- or `Antigravity Auto Accept: Toggle ON/OFF`

### Background Mode

Background Mode is available when CDP is active and connected.

Use:

- `Toggle Background Mode` in the control panel
- or `Antigravity Auto Accept: Toggle Background Mode`

## 6) Manual Fallback Commands

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

## 7) Troubleshooting

### Auto Accept is ON, but behavior is not correct

Check the control panel:

- expected CDP port
- active CDP ports
- CDP connections

If the selected port is not active, reopen the IDE through the saved launcher.

### Background Mode is not available

That usually means CDP is not active or not connected yet. Start the IDE through the saved launcher, then refresh the panel.

### I saved the launcher, but I do not know how to use it

The panel already prints:

- saved launcher path
- exact open steps

Follow those steps exactly.

### Antigravity is installed in a custom folder

Use the control panel button:

- `Choose IDE Path...`

Then select the real Antigravity executable and save the launcher again.

## 8) Open VSX

Extension page:

https://open-vsx.org/extension/pesosz/antigravity-auto-accept/

Feedback is also useful on GitHub issues:

https://github.com/pesoszpesosz/antigravity-auto-accept/issues



