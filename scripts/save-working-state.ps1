param(
    [string]$SnapshotRoot = "",
    [switch]$ZipSnapshot
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($SnapshotRoot)) {
    $SnapshotRoot = Join-Path $repoRoot "state\snapshots"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshotDir = Join-Path $SnapshotRoot ("snapshot-" + $timestamp)
$stateRoot = Join-Path $repoRoot "state"

$dirs = @(
    $snapshotDir,
    (Join-Path $snapshotDir "installed-extension"),
    (Join-Path $snapshotDir "workspace"),
    (Join-Path $snapshotDir "config"),
    (Join-Path $snapshotDir "runtime"),
    (Join-Path $snapshotDir "logs")
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

$installedExtension = Get-ChildItem "$env:USERPROFILE\.antigravity\extensions" -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "znork.auto-accept-agent-free-*" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($installedExtension) {
    Copy-Item $installedExtension.FullName (Join-Path $snapshotDir "installed-extension") -Recurse -Force
}

$workspaceItems = @(
    "extension.js",
    "dist",
    "main_scripts",
    "media",
    "package.json",
    "README.md",
    "WORKING_SETUP.md",
    "scripts"
)
foreach ($item in $workspaceItems) {
    $src = Join-Path $repoRoot $item
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $snapshotDir "workspace") -Recurse -Force
    }
}

$configMap = @{
    "$env:USERPROFILE\.antigravity\argv.json" = "argv.userhome.json";
    "$env:APPDATA\Antigravity\argv.json" = "argv.appdata.json";
    "$env:APPDATA\Antigravity\User\settings.json" = "settings.user.json";
}
foreach ($cfg in $configMap.Keys) {
    if (Test-Path $cfg) {
        Copy-Item $cfg (Join-Path $snapshotDir ("config\" + $configMap[$cfg])) -Force
    }
}

$autoAcceptLog = Get-ChildItem "$env:APPDATA\Antigravity\logs" -Recurse -Filter "*Auto Accept FREE*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if ($autoAcceptLog) {
    Copy-Item $autoAcceptLog.FullName (Join-Path $snapshotDir "logs\latest-auto-accept.log") -Force
}

$mainLog = Get-ChildItem "$env:APPDATA\Antigravity\logs" -Recurse -Filter "main.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if ($mainLog) {
    Copy-Item $mainLog.FullName (Join-Path $snapshotDir "logs\latest-main.log") -Force
}

try {
    antigravity.cmd --list-extensions --show-versions | Set-Content (Join-Path $snapshotDir "runtime\extensions.txt") -Encoding UTF8
} catch {
    "Failed to run: antigravity.cmd --list-extensions --show-versions`n$($_.Exception.Message)" |
        Set-Content (Join-Path $snapshotDir "runtime\extensions.txt") -Encoding UTF8
}

Get-CimInstance Win32_Process -Filter "name='Antigravity.exe'" |
    Select-Object ProcessId, CommandLine |
    Format-List |
    Set-Content (Join-Path $snapshotDir "runtime\antigravity-processes.txt") -Encoding UTF8

$cdpStatus = "down"
try {
    $code = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:9000/json/version" -TimeoutSec 6).StatusCode
    $cdpStatus = "up (HTTP $code)"
} catch {
    $cdpStatus = "down ($($_.Exception.Message))"
}
"CDP status: $cdpStatus" | Set-Content (Join-Path $snapshotDir "runtime\cdp-status.txt") -Encoding UTF8

$shortcutReport = Join-Path $snapshotDir "runtime\shortcuts.txt"
$shell = New-Object -ComObject WScript.Shell
$links = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Antigravity\Antigravity.lnk",
    "$env:USERPROFILE\Desktop\Antigravity (CDP).lnk"
)
$lines = @()
foreach ($lnk in $links) {
    if (Test-Path $lnk) {
        $sc = $shell.CreateShortcut($lnk)
        $lines += "LNK: $lnk"
        $lines += "TARGET: $($sc.TargetPath)"
        $lines += "ARGS: $($sc.Arguments)"
        $lines += ""
    } else {
        $lines += "LNK: $lnk"
        $lines += "MISSING"
        $lines += ""
    }
}
$lines | Set-Content $shortcutReport -Encoding UTF8

$reportLines = @(
    "# Working State Snapshot",
    "",
    "- Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")",
    "- Snapshot Dir: $snapshotDir",
    "- Installed Extension: $($installedExtension.FullName)",
    "- CDP Status: $cdpStatus",
    "",
    "## Included",
    "",
    "- Installed extension folder copy",
    "- Workspace source/build files",
    "- Antigravity config files (argv + settings when present)",
    "- Current Antigravity process command lines",
    "- Installed extension list",
    "- Shortcut targets/arguments",
    "- Latest Auto Accept and main logs"
)
$reportLines | Set-Content (Join-Path $snapshotDir "STATE_REPORT.md") -Encoding UTF8

if ($ZipSnapshot) {
    $zipPath = "$snapshotDir.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    Compress-Archive -Path "$snapshotDir\*" -DestinationPath $zipPath -Force
    Write-Host "Snapshot zipped: $zipPath"
    Set-Content (Join-Path $stateRoot "LATEST_SNAPSHOT_ZIP.txt") -Value $zipPath -Encoding UTF8
}

Set-Content (Join-Path $stateRoot "LATEST_SNAPSHOT.txt") -Value $snapshotDir -Encoding UTF8
Write-Host "Snapshot saved: $snapshotDir"
