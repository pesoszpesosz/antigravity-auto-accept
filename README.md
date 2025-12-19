# Antigravity Auto Accept

[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)](https://github.com/pesoszpesosz/antigravity-auto-accept)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Finally, true hands-free automation for your Antigravity Agent.**

This extension automatically accepts **ALL** pending steps from the Antigravity Agent, including:

- ✅ **Run Command** requests (Terminal)
- ✅ **Save File** requests  
- ✅ **Code Edits**

It bypasses the limitations of external scripts by running directly inside the IDE process, ensuring 100% reliability even when the window is minimized or unfocused.

---

## 🚀 Installation

### Option 1: Install from VSIX (Recommended)

1. Download the latest `.vsix` file from [Releases](https://github.com/pesoszpesosz/antigravity-auto-accept/releases)
2. Open Antigravity IDE
3. Go to **Extensions** → Click `...` menu → **Install from VSIX...**
4. Select the downloaded `.vsix` file
5. Restart the IDE

### Option 2: Build from Source

```bash
git clone https://github.com/pesoszpesosz/antigravity-auto-accept.git
cd antigravity-auto-accept
npm install -g @vscode/vsce
vsce package
```

Then install the generated `.vsix` file as described above.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Zero-Interference** | Runs silently in the background |
| **Toggle Control** | Click status bar or use keyboard shortcut |
| **Visual Status** | Green (ON) / Red (OFF) indicators |
| **Deep Integration** | Calls internal Antigravity commands directly |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+Shift+U` | Toggle Auto-Accept ON/OFF |
| `Cmd+Alt+Shift+U` (Mac) | Toggle Auto-Accept ON/OFF |

---

## 📖 Usage

1. Install the extension
2. Restart Antigravity IDE
3. The extension activates automatically (`✅ Auto-Accept: ON`)
4. Launch an Agent task and sit back!

The status bar shows the current state:
- `✅ Auto-Accept: ON` - All agent steps are being auto-accepted
- `🛑 Auto-Accept: OFF` - Manual approval required

---

## 🔧 Requirements

- Antigravity IDE (VS Code based)

---

## ❓ FAQ

**Q: Is this safe to use?**  
A: The extension only accepts steps that Antigravity Agent proposes. Review agent behavior periodically.

**Q: Can I pause it temporarily?**  
A: Yes! Click the status bar item or press `Ctrl+Alt+Shift+U`.

**Q: Does it work when the window is minimized?**  
A: Yes, that's the main advantage over external automation scripts.

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📜 License

MIT - See [LICENSE](LICENSE) for details.

---

## ⭐ Support

If you find this useful, consider giving it a star on GitHub!
