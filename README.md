# Antigravity Auto Accept

Hands-free approvals for Antigravity agent workflows, with guided CDP setup on port `9000`.

## Start Here (Store Install)

If you installed from Open VSX / Marketplace, do this now:

1. Click the status bar item `Auto Accept: OFF` (or run `Antigravity Auto Accept: Toggle ON/OFF`) until it shows `Auto Accept: ON`.
2. If prompted about CDP setup, click `Set Up Now`.
3. Wait for restart. If the IDE does not reopen correctly, use desktop shortcut:
   `Start Antigravity (CDP 9000).lnk`
4. Optional: enable background mode from status bar (`Background: OFF` -> `Background: ON`).

## What You Should See

- Status bar shows `Auto Accept: ON`
- Command prompts (Run / Allow / Continue) are handled automatically
- If CDP is active, background handling is more reliable across chats/tabs

## Fast Fixes

If prompts are still hanging:

1. Run `Antigravity Auto Accept: Setup CDP`
2. Restart Antigravity
3. If needed, restart `2-3` times on first setup
4. Verify CDP endpoint:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9000/json/version
```

Expected: HTTP `200`.

If setup popup does not appear:

1. Run `Antigravity Auto Accept: Setup CDP` manually
2. Restart Antigravity

If the wrong window/profile opens after setup:

1. Close all Antigravity windows
2. Launch `Start Antigravity (CDP 9000).lnk`

## Commands

- `Antigravity Auto Accept: Toggle ON/OFF`
- `Antigravity Auto Accept: Toggle Background Mode`
- `Antigravity Auto Accept: Setup CDP`

## Manual CDP Start (Windows)

```powershell
$exe = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Stop-Process -Name Antigravity -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process $exe -ArgumentList '--remote-debugging-port=9000'
```

## Install Methods

- Store/Open VSX: install directly from extension marketplace, then follow `Start Here (Store Install)` above.
- Manual VSIX: `Extensions: Install from VSIX...` and choose `antigravity-auto-accept-1.0.5.vsix`.

## Developer Build

```bash
npm install
npm run build:vsix
```

Output:
- `antigravity-auto-accept-1.0.5.vsix`

## More Docs

- Full runbook: [WORKING_SETUP.md](./WORKING_SETUP.md)
- End-user install guide: [INSTALL.md](./INSTALL.md)
- Complete user manual (all common scenarios): [USER_MANUAL.md](./USER_MANUAL.md)
- Publishing guide: [PUBLISH_GITHUB.md](./PUBLISH_GITHUB.md)

## Download v1.0.5

- Release page: https://github.com/pesoszpesosz/antigravity-auto-accept/releases/tag/v1.0.5
- VSIX (release asset): https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.5/antigravity-auto-accept-1.0.5.vsix
- SHA256 (release asset): https://github.com/pesoszpesosz/antigravity-auto-accept/releases/download/v1.0.5/antigravity-auto-accept-1.0.5.vsix.sha256
- VSIX (GitHub page): https://github.com/pesoszpesosz/antigravity-auto-accept/blob/master/release/antigravity-auto-accept-1.0.5.vsix
- VSIX (direct download): https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.0.5.vsix
- SHA256: https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.0.5.vsix.sha256

