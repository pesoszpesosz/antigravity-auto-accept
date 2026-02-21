# Changelog

All notable changes to the **Antigravity Auto Accept** extension will be documented in this file.

## [1.0.4] - 2026-2-21
- Added support for the `antigravity.prioritized.agentAcceptFocusedHunk` and `antigravity.terminal.accept` commands to automatically accept focused change blocks in the new Antigravity version.
- Switched from `setInterval` to a recursive `setTimeout` loop combined with `async/await`. This ensures commands are only dispatched after the previous command has completed, preventing UI crashes or command queue overflows.
- Compressed the `icon.png` file from approximately 330KB to approximately 15KB (a reduction of over 95%), significantly reducing the size of the final `.vsix` file.

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
