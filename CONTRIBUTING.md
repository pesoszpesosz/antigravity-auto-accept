# Contributing

Thank you for your interest in contributing to **Antigravity Auto Accept**!

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/pesoszpesosz/antigravity-auto-accept/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Antigravity IDE version

### Suggesting Features

Open an issue with the `enhancement` label describing your idea.

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test in Antigravity IDE
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

```bash
# Clone the repo
git clone https://github.com/pesoszpesosz/antigravity-auto-accept.git

# Install vsce for packaging
npm install -g @vscode/vsce

# Package the extension
vsce package

# Install in Antigravity IDE
# Extensions → ... → Install from VSIX
```

## Code Style

- Use clear, descriptive variable names
- Add comments for non-obvious logic
- Keep functions small and focused
