## Antigravity Auto Accept v1.0.5

### Included assets

- `antigravity-auto-accept-1.0.5.vsix`
- `antigravity-auto-accept-1.0.5.vsix.sha256`

### What changed

- Improved first-run setup reliability for CDP (`127.0.0.1:9000`).
- Setup flow now preserves launch context when possible (`--user-data-dir`, `--extensions-dir`, `--profile`).
- Added stronger fallback UX when auto-restart does not reopen the expected instance.
- Added clear guidance that some environments may require `2-3` restarts on first setup.

### Install

1. Download `antigravity-auto-accept-1.0.5.vsix` from this release.
2. In Antigravity, run: `Extensions: Install from VSIX...`
3. Select the VSIX and reload.
4. If prompted for setup, click `Set Up Now`.

Detailed install/fallback guide: `INSTALL.md`.

