# Changelog

All notable changes to the **Antigravity Auto Accept** extension are documented here.

## [1.0.8] - 2026-03-06

### Changed
- Made the control panel entry point the first thing explained in the public docs and packaged README.
- Added explicit `v1.0.8` download links to the packaged README.
- Added the free-build note plus Open VSX rating and GitHub feedback request to the top of the packaged README.

### Fixed
- Corrected the packaged README mismatch that left `1.0.7` users with stale extension-page content.

## [1.0.7] - 2026-03-06

### Changed
- Added the control panel screenshot and refreshed the GitHub/Open VSX-facing docs.
- Centered the user flow on the control panel, configurable CDP port, and save-anywhere launcher flow.
- Updated install, manual, release, and publishing docs for the `1.0.7` release.

### Fixed
- Validated the current Windows launcher path against the working Antigravity shortcut format.
- Improved Windows CDP runtime status handling by accepting Antigravity's live DevTools marker when it matches the selected port.

## [1.0.6] - 2026-03-03

### Changed
- Bumped extension version to `1.0.6` for marketplace/Open VSX republish.
- Added a control panel for CDP state, launcher management, and runtime controls.
- Replaced launcher/setup noise with a save-anywhere launcher workflow.
- Added configurable CDP port handling.
- Updated README, install guide, and user manual to reflect the current workflow.

### Fixed
- Removed repeated setup-loop behavior in the user-facing flow.
- Fixed Windows launcher generation to follow the working shortcut format.
- Improved runtime status reporting for expected ports, active ports, and connections.

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
