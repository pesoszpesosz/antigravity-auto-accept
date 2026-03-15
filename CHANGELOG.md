# Changelog

All notable changes to the **Antigravity Auto Accept** extension are documented here.

## [1.1.9] - 2026-03-15

### Added
- Added a read-only `Support Health` checklist card to the control panel.
- Surfaced yes/no checks for launcher saved state, expected port activity, CDP connectivity, executable-path validity, and background readiness.

## [1.1.8] - 2026-03-14

### Added
- Added a read-only `Support Guidance` card to the control panel with a recommended next step based on launcher, CDP, and executable-path state.
- Added an exact `Last refresh` timestamp so users can see when the current panel snapshot was generated.

## [1.1.7] - 2026-03-13

### Added
- Added a read-only `Copy Full Support Bundle` command and control-panel button.
- Combined diagnostics, launcher steps, manual launch command, and support command shortcuts into one clipboard-ready report for bug reports and setup help.

## [1.1.6] - 2026-03-12

### Added
- Added a read-only recent-activity section to the control panel using the existing runtime stats.
- Surfaced last action, approvals, permissions, terminal commands, file edits, and blocked counts directly in the UI.

## [1.1.5] - 2026-03-12

### Added
- Added a read-only `Copy Launcher Steps` command and control-panel button.
- Added a read-only `Copy Manual Launch Command` command and control-panel button.

## [1.1.4] - 2026-03-10

### Added
- Added a read-only `Open Output Log` command to open the extension output channel directly from the command palette.
- Added an `Open Output Log` button and an explicit extension version field in the control panel.

## [1.1.3] - 2026-03-09

### Added
- Added a read-only `Copy Diagnostics` command that copies version, runtime mode, CDP state, launcher state, and support stats to the clipboard.
- Added a `Copy Diagnostics` button to the control panel for faster bug-report workflow.

## [1.1.2] - 2026-03-09

### Changed
- Refined the extension description, keywords, and marketplace links so the listing is clearer and easier to discover.
- Reworked the README opening section around approval prompts, terminal approvals, CDP setup, and supported IDE environments.
- Added a small activation summary log line with version, host kind, remote mode, and workspace count to make support checks easier.
- Updated the CDP handler to scan around the selected base port instead of a fixed hard-coded range and to expose richer runtime action stats.

### Fixed
- Removed version-pinned README download links so future marketplace and GitHub release updates are less likely to ship stale listing text.

## [1.1.1] - 2026-03-08

### Changed
- Added targeted code comments around the recent launcher and prompt-dedupe fixes to make those paths easier to maintain.
- Added Ko-fi support text to the install and user-manual docs.

### Fixed
- Kept the Windows launcher/context and prompt-dedupe behavior from `1.1.0` intact in the packaged `1.1.1` build.

## [1.1.0] - 2026-03-06

### Fixed
- The control panel no longer overwrites an unsaved custom CDP port while it refreshes.
- Windows saved launchers now preserve the current Antigravity relaunch context instead of dropping workspace/profile arguments.
- Run-prompt approvals now use prompt-signature dedupe so the same command prompt is not re-approved repeatedly after rerenders.

### Changed
- Added terminal approval stats/state tracking so repeated run approvals are easier to diagnose from runtime logs.

## [1.0.9] - 2026-03-06

### Added
- A persisted manual executable path override for Antigravity and Cursor.
- Control panel actions to choose or clear the IDE executable path.

### Fixed
- Launcher generation now supports non-default install locations instead of only standard paths.
- Windows manual executable overrides now win over stale desktop shortcut templates.
- The control panel now exposes the executable path state so users can see whether launch is using auto-detect or a manual override.

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
