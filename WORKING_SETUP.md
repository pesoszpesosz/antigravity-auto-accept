# Working Build + Run Guide

## 1) What Is Saved Here

This repo contains the same working code currently used in your installed extension:

- `extension.js`
- `dist/extension.js`
- `main_scripts/auto-accept.js`
- `main_scripts/cdp-handler.js`

The runtime behavior is designed to:

- auto-accept prompt actions (`Run`, `Allow`, `Continue`)
- avoid random IDE UI clicking
- use CDP on port `9000` for reliable prompt interaction

## 2) Build Your Own VSIX

From repo root:

```bash
npm install
npm run compile
npm run package
```

Output will be a `.vsix` file in the repo root.

## 3) Install In Antigravity

1. Open Antigravity.
2. Open Command Palette.
3. Run `Extensions: Install from VSIX...`.
4. Select the generated `.vsix`.
5. Reload/restart Antigravity.

## 4) Start Antigravity With CDP (Required)

Use the provided script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-antigravity-cdp.ps1
```

What it does:

- clears `ELECTRON_RUN_AS_NODE` from current shell
- kills existing Antigravity processes
- starts Antigravity with `--remote-debugging-port=9000`
- verifies CDP endpoint

## 5) Verify Runtime Is Correct

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9000/json/version
```

Expected: HTTP `200`.

Check process command line:

```powershell
Get-CimInstance Win32_Process -Filter "name='Antigravity.exe'" | Select-Object ProcessId,CommandLine
```

Expected main process contains:

- `--remote-debugging-port=9000`

## 6) Extension Commands

- `Auto Accept FREE: Toggle ON/OFF`
- `Auto Accept FREE: Toggle Background Mode`
- `Auto Accept FREE: Setup CDP`

## 7) Create A Full Snapshot (State Backup)

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\save-working-state.ps1 -ZipSnapshot
```

Snapshot includes:

- installed extension folder copy
- workspace source/build files
- Antigravity config files (`argv.json`, `settings.json` if present)
- currently running Antigravity process command lines
- installed extension list
- shortcut target/args report
- latest Auto Accept log and main log

## 8) Common Failure Causes

1. Antigravity started without CDP flag:
- run `scripts/start-antigravity-cdp.ps1` again.

2. Started from shell where `ELECTRON_RUN_AS_NODE=1`:
- use the script above; it clears the variable before launch.

3. Old VSIX still active:
- uninstall old extension, install the new built VSIX, restart Antigravity.

4. Prompt still hanging:
- keep prompt open and collect latest Auto Accept log from:
  - `%APPDATA%\Antigravity\logs\...\2-Auto Accept FREE.log`
