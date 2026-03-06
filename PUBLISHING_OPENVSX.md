# Publish to Open VSX

Antigravity commonly consumes extensions from Open VSX.

## Prerequisites
1. Create/Open your namespace at https://open-vsx.org
2. Ensure `package.json.publisher` matches your namespace
3. Bump `package.json.version` before publishing

## Package + Publish
```bash
npm ci
npm run build:vsix
npx ovsx publish -p <OVSX_PAT>
```

### Exact VSIX path prepared for upload

- `release/antigravity-auto-accept-1.0.7.vsix`

Recommended command:

```bash
npx ovsx publish release/antigravity-auto-accept-1.0.7.vsix -p <OVSX_PAT>
```

## CI Publishing (recommended)
Use `.github/workflows/release.yml` with secret:
- `OVSX_PAT`

The workflow can publish to VS Marketplace and Open VSX from the same tagged release.



