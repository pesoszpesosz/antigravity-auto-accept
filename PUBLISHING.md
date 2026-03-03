# Publish to VS Marketplace

## Prerequisites
1. Create a Marketplace publisher that matches `package.json.publisher`.
2. Create an Azure DevOps PAT with Marketplace publish scope.
3. Bump `package.json.version` before each release.

## Package Locally
```bash
npm ci
npm run build:vsix
```

This creates `antigravity-auto-accept-<version>.vsix` in the repo root.

## Publish via CLI
```bash
npx vsce publish -p <VSCE_PAT>
```

## Publish via Web Upload
1. Go to https://marketplace.visualstudio.com/manage
2. Select your publisher
3. Upload the generated `.vsix`

## CI Publishing (recommended)
Use `.github/workflows/release.yml` and set repository secrets:
- `VSCE_PAT`
- `OVSX_PAT` (optional if also publishing to Open VSX)
