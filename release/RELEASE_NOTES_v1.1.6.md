## Antigravity Auto Accept v1.1.6

### Included assets

- `antigravity-auto-accept-1.1.6.vsix`
- `antigravity-auto-accept-1.1.6.vsix.sha256`
- `control-panel.png`

### What changed

- Added a read-only recent-activity section to the control panel.
- Surfaced last action, approvals, permissions, terminal commands, file edits, and blocked counts using the existing runtime stats.
- Kept the change isolated to support visibility so approval and launcher behavior stay unchanged.

### Install

1. Download `antigravity-auto-accept-1.1.6.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. Open `Auto Accept Panel`.
5. Check the recent-activity section to confirm what the extension has been approving in the current session.
