## Antigravity Auto Accept v1.1.3

### Included assets

- `antigravity-auto-accept-1.1.3.vsix`
- `antigravity-auto-accept-1.1.3.vsix.sha256`
- `control-panel.png`

### What changed

- Added a read-only `Copy Diagnostics` command that copies version, runtime mode, CDP state, launcher state, and support stats to the clipboard.
- Added a `Copy Diagnostics` button inside the control panel.
- Kept the diagnostics path isolated from auto-accept logic, launcher generation, and approval behavior.

### Install

1. Download `antigravity-auto-accept-1.1.3.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. Open `Auto Accept Panel`.
5. Use `Copy Diagnostics` whenever you need a support snapshot without changing runtime behavior.
