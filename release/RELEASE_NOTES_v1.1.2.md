## Antigravity Auto Accept v1.1.2

### Included assets

- `antigravity-auto-accept-1.1.2.vsix`
- `antigravity-auto-accept-1.1.2.vsix.sha256`
- `control-panel.png`

### What changed

- Refined the marketplace description and keywords around approval prompts, terminal approvals, CDP setup, and agent actions.
- Reworked the README opening section so the extension page explains the supported workflow earlier and more clearly.
- Added a lightweight activation summary log line so support checks can confirm version, host kind, remote mode, and workspace count faster.
- Updated the CDP handler to scan around the selected base port and report richer runtime action stats from active sessions.
- Replaced version-pinned README download links with stable release-page links to reduce stale marketplace text on future publishes.

### Install

1. Download `antigravity-auto-accept-1.1.2.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. Open `Auto Accept Panel`.
5. Set the CDP port you want, save it, and then click `Save IDE Launcher...`.
6. Start Antigravity through the saved launcher when you want that CDP port active.
