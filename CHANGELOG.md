# Changelog

All notable changes to the **Antigravity Auto Accept** extension are documented here.

## [1.0.5] - 2026-03-03

### Changed
- Bumped extension version to `1.0.5` for a new publishable release.
- Updated release/docs/install references from `1.0.4` to `1.0.5`.

### Fixed
- Restored extension icon to the exact artwork used in `1.0.3`.

## [1.0.4] - 2026-03-03

### Changed
- Rebased this build to the original extension identity:
  - `name`: `antigravity-auto-accept`
  - `displayName`: `Antigravity Auto Accept`
  - repository: `pesoszpesosz/antigravity-auto-accept`
- Standardized runtime/user-facing text to English.

### Added
- First-run setup prompt for CDP (`127.0.0.1:9000`) when missing.
- Automatic Windows setup flow that can:
  - create a desktop CDP launcher (`.cmd`)
  - create a desktop shortcut (`.lnk`)
  - relaunch the editor with CDP enabled

### Fixed
- Setup flow now preserves launch context on restart (`--user-data-dir`, `--extensions-dir`, `--profile`) when available.
- Added explicit manual-restart fallback prompt if auto-restart does not reopen the correct instance.
- Added guidance that first-time setup may require `2-3` restarts in some environments.

## [1.0.3] - 2025-12-10

### Fixed
- Improved status bar item visibility and positioning

## [1.0.2] - 2025-12-10

### Added
- Status bar toggle with visual indicators (Green ON / Red OFF)
- Keyboard shortcut `Ctrl+Alt+Shift+U` to toggle auto-accept

### Changed
- Optimized polling interval for better performance

## [1.0.1] - 2025-12-10

### Added
- Terminal command acceptance (`antigravity.terminal.accept`)

## [1.0.0] - 2025-12-10

### Added
- Initial release
- Automatic acceptance of Antigravity agent steps
- Background polling every 500ms
- Zero-interference operation (works when minimized/unfocused)
