## Antigravity Auto Accept v1.1.1

### Included assets

- `antigravity-auto-accept-1.1.1.vsix`
- `antigravity-auto-accept-1.1.1.vsix.sha256`
- `control-panel.png`

### What changed

- Kept the `1.1.0` launcher-context and prompt-dedupe fixes in the packaged build.
- Added targeted comments around those code paths to make the current behavior easier to maintain.
- Added Ko-fi support text to the install and user-manual docs.

### Install

1. Download `antigravity-auto-accept-1.1.1.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. Open `Auto Accept Panel`.
5. Set the CDP port you want, save it, and then click `Save IDE Launcher...`.
6. Start Antigravity through the saved launcher when you want that CDP port active.
