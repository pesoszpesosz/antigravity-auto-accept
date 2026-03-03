# Changelog

All notable changes to the **Antigravity Auto Accept** extension are documented here.

## [1.3.4] - 2026-02-28

### Fixed
- Kept the stable 1.3.2 behavior and added a narrow matcher for compact command labels like `RunAlt+⏎`
- Updated run-prompt detection for compact text variants (`RejectRun`, `RunAlt+...`) without widening global button clicks

## [1.3.3] - 2026-02-28

### Fixed
- Added explicit support for compact Antigravity run labels like `RunAlt+⏎` (no whitespace), which were previously skipped by the run-button matcher
- Improved step-input detection for compact prompt text forms such as `RejectRun...` / `RunAlt...`
- Removed duplicate `dependencies` block in `package.json` to avoid packaging/install inconsistencies

## [1.3.2] - 2026-02-28

### Fixed
- Replaced CDP handler and injected auto-click script with the previously verified working implementation
- Restored proven run/allow/continue prompt click behavior from known-good build

## [1.3.1] - 2026-02-28

### Fixed
- Added missing runtime dependency `ws` required by CDP transport so the extension activates correctly

## [1.3.0] - 2026-02-28

### Added
- CDP-based UI automation fallback that clicks `Run`, `Allow`, and `Continue` prompt buttons directly
- New command: `Antigravity Auto Accept: Setup CDP for UI Automation`
- New settings: `antigravityAutoAccept.enableCDP`, `antigravityAutoAccept.cdpPort`, `antigravityAutoAccept.cdpScanRange`
- Runtime CDP stats logging in extension output

### Changed
- Auto setup now seeds CDP settings by default
- Startup/runtime now keeps CDP injection refreshed while extension is enabled

## [1.2.1] - 2026-02-28

### Fixed
- Improved prompt hit rate by executing multiple command candidates per tick instead of only one
- Expanded default Antigravity run/allow/continue command candidates for elevated command approval flows
- Added runtime failure logging for command execution errors to simplify troubleshooting

### Added
- New setting: `antigravityAutoAccept.commandsPerTick`
- Added discovery logs for top-ranked active command candidates

## [1.2.0] - 2026-02-28

### Added
- Dynamic safe command discovery so new Antigravity command IDs work without manual edits
- Startup health-check and recovery loop to auto-heal command discovery on first run
- New diagnostics command: `Antigravity Auto Accept: Run Diagnostics`
- Optional persistence of discovered safe commands (`antigravityAutoAccept.autoPersistDiscoveredCommands`)
- Optional startup health warnings (`antigravityAutoAccept.showHealthNotifications`)

### Changed
- Hardened command safety filtering to avoid non-approval actions
- Improved runtime stability with per-command cooldowns after failures
- Expanded default candidate list with current Antigravity accept commands

## [1.1.2] - 2026-02-27

### Fixed
- Reduced command spam by sending one candidate per tick (round-robin) instead of executing all candidates each cycle
- Added automatic backoff when Antigravity reports channel-pressure errors (for example, `channel is full`)
- Migrated default polling interval to 900ms on setup/migration to improve stability under load

## [1.1.1] - 2026-02-27

### Fixed
- Added current Antigravity command IDs (`antigravity.command.accept`, `antigravity.terminalCommand.accept`, `antigravity.terminalCommand.run`) to default auto-accept candidates
- Added automatic settings migration so existing installs receive updated command candidates without manual reset

## [1.1.0] - 2026-02-27

### Added
- First-run auto-setup that applies default extension settings automatically
- New command: `Antigravity Auto Accept: Run Auto Setup`
- Configurable command discovery via `antigravityAutoAccept.commandCandidates`
- Build scripts for one-command VSIX packaging (`npm run build:vsix`)

### Changed
- Reworked runtime loop to avoid overlapping executions
- Improved status bar states (`ON`, `waiting`, `OFF`)
- Persistent enable/disable state across restarts

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
