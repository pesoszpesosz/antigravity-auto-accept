param(
    [int]$CdpPort = 9000,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Get-AntigravityCliPath {
    $cli = Join-Path $env:LOCALAPPDATA "Programs\Antigravity\bin\antigravity.cmd"
    if (-not (Test-Path $cli)) {
        throw "Antigravity CLI not found at: $cli"
    }
    return $cli
}

function Wait-Http200 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -eq 200) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

function Wait-ExtensionActivationLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UserDataDir,
        [Parameter(Mandatory = $true)]
        [string]$ExtensionId,
        [int]$TimeoutSeconds = 25
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $logRoot = Join-Path $UserDataDir "logs"
        if (Test-Path $logRoot) {
            $latestLogDir = Get-ChildItem $logRoot -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                Select-Object -First 1

            if ($latestLogDir) {
                $extHostLog = Get-ChildItem (Join-Path $latestLogDir.FullName "window1\exthost") -Recurse -File -Filter "exthost.log" -ErrorAction SilentlyContinue |
                    Select-Object -First 1
                if ($extHostLog) {
                    $content = Get-Content $extHostLog.FullName -Raw -ErrorAction SilentlyContinue
                    if ($content -match [regex]::Escape($ExtensionId)) {
                        return $extHostLog.FullName
                    }
                }
            }
        }
        Start-Sleep -Milliseconds 700
    }
    return $null
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$packageJsonPath = Join-Path $repoRoot "package.json"
if (-not (Test-Path $packageJsonPath)) {
    throw "package.json not found: $packageJsonPath"
}

$pkg = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$extensionId = "$($pkg.publisher).$($pkg.name)"
$expectedVersion = "$($pkg.version)"
$expectedInstalledLine = "$extensionId@$expectedVersion"
$vsixPath = Join-Path $repoRoot "$($pkg.name)-$($pkg.version).vsix"

if (-not $SkipBuild) {
    Write-Host "Building VSIX..."
    npm run build:vsix | Out-Host
}

if (-not (Test-Path $vsixPath)) {
    throw "VSIX not found: $vsixPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$cleanRoot = Join-Path $repoRoot "state\clean-ide-$timestamp"
$userDataDir = Join-Path $cleanRoot "user-data"
$extensionsDir = Join-Path $cleanRoot "extensions"
New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
New-Item -ItemType Directory -Path $extensionsDir -Force | Out-Null
Set-Content -Path (Join-Path $repoRoot "state\LATEST_CLEAN_IDE.txt") -Value $cleanRoot

$cliPath = Get-AntigravityCliPath

Write-Host "Installing extension into clean profile..."
& $cliPath --user-data-dir "$userDataDir" --extensions-dir "$extensionsDir" --install-extension "$vsixPath" | Out-Host

Write-Host "Verifying installed extensions..."
$listOutput = & $cliPath --user-data-dir "$userDataDir" --extensions-dir "$extensionsDir" --list-extensions --show-versions
$listOutput | Out-Host
if (-not ($listOutput -contains $expectedInstalledLine)) {
    throw "Expected extension missing from clean profile: $expectedInstalledLine"
}

Write-Host "Restarting Antigravity on clean profile with CDP port $CdpPort..."
Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $cliPath -ArgumentList @("--user-data-dir", $userDataDir, "--extensions-dir", $extensionsDir, "--remote-debugging-port=$CdpPort")

$cdpOk = Wait-Http200 -Url "http://127.0.0.1:$CdpPort/json/version" -TimeoutSeconds 25
if (-not $cdpOk) {
    throw "CDP endpoint did not return HTTP 200 on port $CdpPort"
}

$activationLog = Wait-ExtensionActivationLog -UserDataDir $userDataDir -ExtensionId $extensionId -TimeoutSeconds 30
if (-not $activationLog) {
    throw "Extension activation log entry not found for $extensionId"
}

Write-Host ""
Write-Host "Clean IDE smoke test passed."
Write-Host "Profile root: $cleanRoot"
Write-Host "CDP endpoint: http://127.0.0.1:$CdpPort/json/version (HTTP 200)"
Write-Host "Activation log: $activationLog"
