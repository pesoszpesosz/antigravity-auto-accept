# Publish To Your Own GitHub + Extension Listing

## 1) Make This Repo Yours

From this folder run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\make-own-repo.ps1 `
  -GithubUser YOUR_GITHUB_USERNAME `
  -RepoName YOUR_REPO_NAME `
  -Publisher YOUR_EXTENSION_PUBLISHER `
  -UpdateGitRemote
```

This updates:

- `package.json` extension id metadata (`name`, `publisher`, `repository`)
- optional git `origin` remote

## 2) Create GitHub Repository

Create an empty repo in GitHub UI with the same name (`YOUR_REPO_NAME`), then push:

```bash
git add .
git commit -m "Initial working plugin source"
git branch -M main
git push -u origin main
```

If git asks for auth, use a GitHub Personal Access Token.

## 3) Build VSIX Locally

```bash
npm install
npm run build:vsix
```

VSIX output appears in repo root.

## 4) Publish VSIX File In GitHub Repo

Copy the built VSIX into `release/` (tracked by git in this project):

```powershell
New-Item -ItemType Directory -Force .\release | Out-Null
Copy-Item .\antigravity-auto-accept-1.1.8.vsix .\release\antigravity-auto-accept-1.1.8.vsix -Force
$h = Get-FileHash .\release\antigravity-auto-accept-1.1.8.vsix -Algorithm SHA256
"$($h.Hash.ToLower())  antigravity-auto-accept-1.1.8.vsix" | Set-Content .\release\antigravity-auto-accept-1.1.8.vsix.sha256
```

After push, share these links:

- https://github.com/pesoszpesosz/antigravity-auto-accept/blob/master/release/antigravity-auto-accept-1.1.8.vsix
- https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.1.8.vsix
- https://raw.githubusercontent.com/pesoszpesosz/antigravity-auto-accept/master/release/antigravity-auto-accept-1.1.8.vsix.sha256

## 5) Install/Verify In Antigravity

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-antigravity-cdp.ps1
```

Then in Antigravity:

1. Command Palette -> `Extensions: Install from VSIX...`
2. Select your built `.vsix`
3. Reload window

## 6) Publish To VS Marketplace / Open VSX

This repo includes CI workflow:

- `.github/workflows/release.yml`

Set repository secrets in GitHub:

- `VSCE_PAT` (VS Marketplace token)
- `OVSX_PAT` (Open VSX token)

Then push a tag:

```bash
git tag v1.1.8
git push origin v1.1.8
```

Workflow will package and publish.

## 7) Save Working Runtime State Before Releases

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\save-working-state.ps1 -ZipSnapshot
```

Latest snapshot pointers:

- `state/LATEST_SNAPSHOT.txt`
- `state/LATEST_SNAPSHOT_ZIP.txt`



