## Antigravity Auto Accept v1.0.9

### Included assets

- `antigravity-auto-accept-1.0.9.vsix`
- `antigravity-auto-accept-1.0.9.vsix.sha256`

### What changed

- Added a real executable-path override for non-default Antigravity installs.
- Added control panel buttons to choose or clear the IDE executable path.
- Launcher generation now uses the selected executable path instead of assuming only default install locations.
- The control panel now shows whether launch is using auto-detect or a manual override.

### Install

1. Download `antigravity-auto-accept-1.0.9.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. If Antigravity is not in a default install location, open `Auto Accept Panel` and click `Choose IDE Path...`.
