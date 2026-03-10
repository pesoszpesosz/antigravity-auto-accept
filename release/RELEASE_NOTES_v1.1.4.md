## Antigravity Auto Accept v1.1.4

### Included assets

- `antigravity-auto-accept-1.1.4.vsix`
- `antigravity-auto-accept-1.1.4.vsix.sha256`
- `control-panel.png`

### What changed

- Added a read-only `Open Output Log` command that opens the extension output channel directly.
- Added an `Open Output Log` button in the control panel.
- Added an explicit extension version field in the control panel so support checks can confirm the running build faster.

### Install

1. Download `antigravity-auto-accept-1.1.4.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. Open `Auto Accept Panel`.
5. Use `Open Output Log` or `Copy Diagnostics` when you need a quick support snapshot without changing runtime behavior.
