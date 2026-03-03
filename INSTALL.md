# Antigravity Auto Accept - User Install Guide (v1.0.6)

## 1) Download

Choose one:

- Release page:
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases/tag/v1.0.6
- Release asset (recommended):
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.6/antigravity-auto-accept-1.0.6.vsix
- GitHub file page:
  https://github.com/pesoszpesosz/antigravity-auto-accept/blob/master/release/antigravity-auto-accept-1.0.6.vsix
- Direct VSIX download:
  https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.0.6.vsix

Optional integrity check:

- SHA256 release asset:
  https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.6/antigravity-auto-accept-1.0.6.vsix.sha256
- SHA256 file:
  https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.0.6.vsix.sha256

## 2) Install VSIX In Antigravity

1. Open Antigravity.
2. Press `Ctrl+Shift+P`.
3. Run `Extensions: Install from VSIX...`.
4. Select `antigravity-auto-accept-1.0.6.vsix`.
5. Click `Reload` if prompted.

## 3) First-Run Setup Prompt

If CDP on port `9000` is not active, extension shows a setup popup.

Click:

- `Set Up Now`

This creates:

- Desktop launcher script: `Start Antigravity (CDP 9000).cmd`
- Desktop shortcut: `Start Antigravity (CDP 9000).lnk`

Then Antigravity is restarted with:

- `--remote-debugging-port=9000`

## 4) If Auto Setup Does Not Work Immediately

Do this:

1. Close all Antigravity windows.
2. Double-click desktop shortcut `Start Antigravity (CDP 9000).lnk`.
3. If still needed, run command `Antigravity Auto Accept: Setup CDP`.
4. Restart Antigravity once more.

Important:

- In some environments, initial setup may require `2-3` restarts.

## 5) Manual Fallback (Windows PowerShell)

```powershell
$exe = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Stop-Process -Name Antigravity -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process $exe -ArgumentList '--remote-debugging-port=9000'
```

## 6) Verify Setup

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9000/json/version
```

Expected:

- HTTP `200`

If status is not `200`, restart using the desktop shortcut again.



