param(
    [Parameter(Mandatory = $true)]
    [string]$GithubUser,

    [Parameter(Mandatory = $true)]
    [string]$RepoName,

    [Parameter(Mandatory = $true)]
    [string]$Publisher,

    [string]$DisplayName = "Antigravity Auto Accept",
    [string]$Description = "Hands-free AI agent approvals for Antigravity, Cursor, and VS Code.",
    [switch]$UpdateGitRemote
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packagePath = Join-Path $repoRoot "package.json"

if (-not (Test-Path $packagePath)) {
    throw "package.json not found: $packagePath"
}

$pkg = Get-Content $packagePath -Raw | ConvertFrom-Json

$safeRepo = ($RepoName.Trim() -replace "[^a-zA-Z0-9._-]", "-").ToLower()
$safePublisher = ($Publisher.Trim() -replace "[^a-zA-Z0-9._-]", "-")

$pkg.name = $safeRepo
$pkg.displayName = $DisplayName
$pkg.description = $Description
$pkg.publisher = $safePublisher
$pkg.repository = @{
    type = "git"
    url = "https://github.com/$GithubUser/$safeRepo"
}

($pkg | ConvertTo-Json -Depth 20) | Set-Content $packagePath -Encoding UTF8

if ($UpdateGitRemote) {
    Push-Location $repoRoot
    try {
        $newRemote = "https://github.com/$GithubUser/$safeRepo.git"
        $hasOrigin = $false
        try {
            git remote get-url origin | Out-Null
            $hasOrigin = $true
        } catch {
            $hasOrigin = $false
        }

        if ($hasOrigin) {
            git remote set-url origin $newRemote
        } else {
            git remote add origin $newRemote
        }
    } finally {
        Pop-Location
    }
}

Write-Host "Updated package.json"
Write-Host "  name: $($pkg.name)"
Write-Host "  publisher: $($pkg.publisher)"
Write-Host "  repository: $($pkg.repository.url)"
if ($UpdateGitRemote) {
    Write-Host "Updated git remote origin"
}
