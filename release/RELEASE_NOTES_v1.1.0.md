## Antigravity Auto Accept v1.1.0

### Included assets

- `antigravity-auto-accept-1.1.0.vsix`
- `antigravity-auto-accept-1.1.0.vsix.sha256`
- `control-panel.png`

### What changed

- Fixed the control panel so an unsaved custom CDP port is no longer overwritten by the automatic refresh loop.
- Fixed Windows saved launchers to preserve the current Antigravity relaunch context when generating a shortcut.
- Added run-prompt dedupe so the same command prompt is not auto-approved repeatedly after UI rerenders.
- Added terminal approval stats/state tracking to make repeated run behavior easier to diagnose.

### Install

1. Download `antigravity-auto-accept-1.1.0.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. Open `Auto Accept Panel`.
5. Set the CDP port you want, save it, and then click `Save IDE Launcher...`.
6. Start Antigravity through the saved launcher when you want that CDP port active.
