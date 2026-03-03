# Auto Accept Agent FREE (Working State)

This repo is pinned to the currently working state of your extension setup:

- CDP-enabled prompt automation on port `9000`
- Safe `Run command?` handling (including `RunAlt+...` labels)
- Disabled random background tab/action-bar clicking
- Reproducible build/install flow

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Build extension bundle:
```bash
npm run compile
```

3. Package VSIX:
```bash
npm run package
```

4. Install VSIX in Antigravity:
- Command Palette -> `Extensions: Install from VSIX...`

5. Start Antigravity with CDP:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-antigravity-cdp.ps1
```

## Save/Backup Current Working State

Create a full snapshot (installed extension + runtime config + logs + workspace files):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\save-working-state.ps1 -ZipSnapshot
```

Snapshot output goes to:

- `state/snapshots/snapshot-YYYYMMDD-HHMMSS`
- optional zip: `state/snapshots/snapshot-YYYYMMDD-HHMMSS.zip`

## Full Instructions

See [WORKING_SETUP.md](./WORKING_SETUP.md) for detailed build, run, verification, and troubleshooting steps.
