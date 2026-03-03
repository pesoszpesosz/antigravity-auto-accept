# Antigravity Auto Accept

Auto-accept extension for Antigravity agent approval prompts, with optional CDP-assisted setup on port `9000`.

## Install In 60 Seconds (Users)

1. Download `antigravity-auto-accept-1.0.4.vsix`.
2. Open Antigravity.
3. Open Command Palette and run `Extensions: Install from VSIX...`.
4. Select the VSIX file.
5. Reload the IDE when prompted.
6. On first run, if CDP is not enabled, accept `Set Up Now`.

If setup succeeds, a desktop shortcut is created:
- `Start Antigravity (CDP 9000).lnk`

## If Auto Setup Does Not Reopen The Correct Window

1. Close all Antigravity windows.
2. Start Antigravity from the desktop shortcut:
   `Start Antigravity (CDP 9000).lnk`.
3. If needed, run command:
   `Antigravity Auto Accept: Setup CDP`.
4. Restart Antigravity again.
5. In some environments, first-time setup can require `2-3` restarts.

Manual fallback (Windows PowerShell):

```powershell
$exe = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Stop-Process -Name Antigravity -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process $exe -ArgumentList '--remote-debugging-port=9000'
```

Verify CDP:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9000/json/version
```

Expected: HTTP `200`.

## Developer Build

```bash
npm install
npm run build:vsix
```

Output:
- `antigravity-auto-accept-1.0.4.vsix`

## More Docs

- Full runbook: [WORKING_SETUP.md](./WORKING_SETUP.md)
- End-user install guide: [INSTALL.md](./INSTALL.md)
- Complete user manual (all common scenarios): [USER_MANUAL.md](./USER_MANUAL.md)
- Publishing guide: [PUBLISH_GITHUB.md](./PUBLISH_GITHUB.md)

## Download v1.0.4

- Release page: https://github.com/pesoszpesosz/antigravity-auto-accept/releases/tag/v1.0.4
- VSIX (release asset): https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.4/antigravity-auto-accept-1.0.4.vsix
- SHA256 (release asset): https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.4/antigravity-auto-accept-1.0.4.vsix.sha256
- VSIX (GitHub page): https://github.com/pesoszpesosz/antigravity-auto-accept/blob/master/release/antigravity-auto-accept-1.0.4.vsix
- VSIX (direct download): https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.0.4.vsix
- SHA256: https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.0.4.vsix.sha256
