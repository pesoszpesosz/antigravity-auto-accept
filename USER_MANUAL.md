# Antigravity Auto Accept - Complete User Manual (v1.0.4)

## 1) What this extension does

- Auto-accepts Antigravity agent approval prompts.
- Supports setup with CDP on port `9000` for stronger prompt interaction.
- Adds one-click setup command: `Antigravity Auto Accept: Setup CDP`.

## 2) Quick install (recommended)

1. Download the release VSIX:
   `antigravity-auto-accept-1.0.4.vsix`
2. Open Antigravity.
3. Run `Extensions: Install from VSIX...`.
4. Select the VSIX.
5. Reload Antigravity if prompted.

## 3) First launch behavior

If CDP is not active on `127.0.0.1:9000`, the extension shows a setup prompt.

Choose:

- `Set Up Now` to auto-create desktop launchers and restart.

Setup creates:

- `Start Antigravity (CDP 9000).cmd`
- `Start Antigravity (CDP 9000).lnk`

## 4) If auto-setup does not reopen correctly

1. Close all Antigravity windows.
2. Start from desktop shortcut: `Start Antigravity (CDP 9000).lnk`.
3. Run command `Antigravity Auto Accept: Setup CDP`.
4. Restart once more.

Notes:

- Some machines require `2-3` restarts on first setup.
- This is expected when process/profile state is stale.

## 5) Symptom-based troubleshooting

### A) Prompt hangs at `Run` and is not auto-clicked

1. Ensure extension status shows `Auto Accept: ON`.
2. Ensure CDP is reachable:
   `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9000/json/version`
3. If not `200`, relaunch with desktop shortcut and test again.

### B) Background mode says CDP required

Run:

- `Antigravity Auto Accept: Setup CDP`

Then restart Antigravity.

### C) Setup prompt never appears

1. Confirm you are in Antigravity (not another editor profile).
2. Open command palette and run `Antigravity Auto Accept: Setup CDP`.
3. Restart Antigravity and retest.

### D) Random IDE clicking behavior

1. Disable extension.
2. Reload window.
3. Re-enable extension.
4. Keep only this extension active for testing if needed.

### E) Extension installed but not active

1. Reload window.
2. Disable/enable extension.
3. Check for conflicting auto-accept extensions and remove them.

## 6) Manual fallback commands

### Windows PowerShell

```powershell
$exe = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Stop-Process -Name Antigravity -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process $exe -ArgumentList '--remote-debugging-port=9000'
```

### macOS

```bash
pkill Antigravity 2>/dev/null
sleep 2
open -n -a Antigravity --args --remote-debugging-port=9000
```

### Linux

```bash
pkill antigravity 2>/dev/null
sleep 2
antigravity --remote-debugging-port=9000 &
```

## 7) Verification checklist

1. Extension installed and enabled.
2. Status bar shows `Auto Accept: ON`.
3. CDP endpoint returns HTTP `200`.
4. Test prompt appears and is auto-handled.

## 8) Open VSX upload (maintainer)

Use this exact VSIX file:

- `release/antigravity-auto-accept-1.0.4.vsix`

Command:

```bash
npx ovsx publish release/antigravity-auto-accept-1.0.4.vsix -p <OVSX_PAT>
```

## 9) Official links

- Release page:
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases/tag/v1.0.4
- VSIX download:
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.4/antigravity-auto-accept-1.0.4.vsix
- SHA256:
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.4/antigravity-auto-accept-1.0.4.vsix.sha256
