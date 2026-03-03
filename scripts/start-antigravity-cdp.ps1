param(
    [int]$Port = 9000,
    [switch]$NoKill,
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

$exe = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
if (-not (Test-Path $exe)) {
    throw "Antigravity.exe not found at: $exe"
}

# Prevent Electron from being forced into Node mode by parent shells.
if (Test-Path Env:ELECTRON_RUN_AS_NODE) {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

if (-not $NoKill) {
    Stop-Process -Name Antigravity -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

if (-not $VerifyOnly) {
    Start-Process $exe -ArgumentList "--remote-debugging-port=$Port" | Out-Null
    Start-Sleep -Seconds 4
}

$cdpUrl = "http://127.0.0.1:$Port/json/version"
try {
    $status = (Invoke-WebRequest -UseBasicParsing $cdpUrl -TimeoutSec 8).StatusCode
    Write-Host "CDP OK on port $Port (HTTP $status)"
} catch {
    Write-Error "CDP check failed at $cdpUrl`n$($_.Exception.Message)"
    exit 1
}

Get-CimInstance Win32_Process -Filter "name='Antigravity.exe'" |
    Select-Object ProcessId, CommandLine |
    Format-List
