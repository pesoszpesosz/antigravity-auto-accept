const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

// State
let isEnabled = false;
let backgroundModeEnabled = false;
let pollTimer;
let statusBarItem;
let statusBackgroundItem;
let outputChannel;
let currentIDE = 'unknown';
let globalContext;
let cdpHandler;
let runtimeSafeCommands = [];
let runtimeCommandRefreshTimer;
let lastBackgroundToggleTs = 0;
let cdpRefreshTimer;
let lastAntigravityCommandRun = 0;
let lastNativeFallbackLogTs = 0;
let lastStatsLogTs = 0;
let lastAntigravityDiscoveryLogTs = 0;
let setupPromptShownThisSession = false;
let antigravityDiscoveredCommands = [];
const lastCommandErrorLogTs = new Map();
const CDP_PORT = 9000;
const FIRST_RUN_SETUP_DONE_KEY = 'auto-accept-free-first-run-setup-done-v2';

// Settings
let pollFrequency = 500; // Conservative default to reduce UI interference
let bannedCommands = [];

// Native accept commands per IDE
const ACCEPT_COMMANDS_VSCODE = [
    'workbench.action.chat.acceptAllFiles',
    'workbench.action.chat.acceptFile',
    'workbench.action.chat.insertCodeBlock',
    'workbench.action.chat.runInTerminal',
    'workbench.action.terminal.runSelectedText'
];

const ACCEPT_COMMANDS_CURSOR = [
    'cursorai.action.acceptAndRunGenerateInTerminal',
    'cursorai.action.acceptGenerateInTerminal',
    'cursorai.action.applyCodeBlock'
];

const ACCEPT_COMMANDS_ANTIGRAVITY = [
    'antigravity.command.accept',
    'antigravity.agent.acceptAgentStep',
    'antigravity.interactiveCascade.acceptSuggestedAction',
    'antigravity.terminalCommand.accept',
    'antigravity.terminalCommand.run',
    'antigravity.executeCascadeAction',
    'antigravity.command.continue',
    'antigravity.agent.continue',
    'antigravity.command.continueGenerating',
    'antigravity.continueGenerating',
    'antigravity.command.alwaysAllow',
    'antigravity.agent.alwaysAllow',
    'antigravity.permission.alwaysAllow',
    'antigravity.browser.alwaysAllow',
    'antigravity.command.allowOnce',
    'antigravity.permission.allowOnce',
    'antigravity.agent.allowOnce'
];

const ANTIGRAVITY_NATIVE_FALLBACK_COMMANDS = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.command.accept',
    'antigravity.terminalCommand.accept',
    'antigravity.terminalCommand.run',
    'antigravity.command.allowOnce',
    'antigravity.command.alwaysAllow',
    'antigravity.command.continueGenerating',
    'antigravity.continueGenerating'
];

const BLOCKED_DYNAMIC_COMMAND_PARTS = [
    'open',
    'show',
    'allowlist',
    'browser',
    'setting',
    'settings',
    'manage',
    'documentation',
    'docs',
    'login',
    'import',
    'toggle',
    'debug',
    'profile',
    'reloadwindow',
    'issue',
    'quicksettings',
    'onboarding',
    'customize',
    'marketplace',
    'sendchat',
    'create',
    'delete',
    'download',
    'upload'
];

const ALLOWED_DYNAMIC_COMMAND_PARTS = [
    'accept',
    'continue',
    'retry',
    'proceed',
    'allowonce',
    'alwaysallow',
    'permission.allow',
    'executecascadeaction',
    'tabjumpaccept',
    'supercompleteaccept',
    'acceptsuggestedaction',
    'terminalcommand.run',
    'terminalcommand.accept',
    'acknowledgement',
    'agentaccept'
];

function isSafeAntigravityDynamicCommand(cmd) {
    const c = (cmd || '').toLowerCase();
    if (!c.startsWith('antigravity.')) return false;
    if (BLOCKED_DYNAMIC_COMMAND_PARTS.some(part => c.includes(part))) return false;
    if (ALLOWED_DYNAMIC_COMMAND_PARTS.some(part => c.includes(part))) return true;
    if (c.includes('acceptagentstep')) return true;
    if (c.includes('submitcodeacknowledgement')) return true;
    if (c.includes('run') && (c.includes('terminalcommand') || c.includes('agent') || c.includes('cascade'))) return true;
    return false;
}

async function refreshAntigravityDiscoveredCommands() {
    const ide = (currentIDE || '').toLowerCase();
    if (ide !== 'antigravity') {
        antigravityDiscoveredCommands = [];
        return;
    }

    try {
        const allCommands = await vscode.commands.getCommands(true);
        antigravityDiscoveredCommands = allCommands.filter(isSafeAntigravityDynamicCommand);
        const now = Date.now();
        if (now - lastAntigravityDiscoveryLogTs > 10000) {
            lastAntigravityDiscoveryLogTs = now;
            log(`[AutoCmd] Discovered antigravity commands: ${antigravityDiscoveredCommands.length}`);
            if (antigravityDiscoveredCommands.length > 0) {
                log(`[AutoCmd] Sample: ${antigravityDiscoveredCommands.slice(0, 12).join(', ')}`);
            }
        }
    } catch (err) {
        log(`[AutoCmd] Failed to discover antigravity commands: ${err.message}`);
    }
}

function getAcceptCommandsForIDE() {
    const ide = (currentIDE || '').toLowerCase();
    if (ide === 'cursor') return ACCEPT_COMMANDS_CURSOR;
    if (ide === 'antigravity') return ACCEPT_COMMANDS_ANTIGRAVITY;
    return ACCEPT_COMMANDS_VSCODE;
}

async function executeAcceptCommandsForIDE() {
    const ide = (currentIDE || '').toLowerCase();
    if (ide === 'antigravity') {
        // Safety hardening: do not execute global Antigravity commands from poll loop.
        // Approvals should happen only via prompt-scoped CDP DOM handling.
        return;
    }

    const commands = [...new Set([...getAcceptCommandsForIDE(), ...runtimeSafeCommands])];
    if (commands.length === 0) return;
    await Promise.allSettled(commands.map(cmd => vscode.commands.executeCommand(cmd)));
}

async function refreshRuntimeSafeCommands() {
    const ide = (currentIDE || '').toLowerCase();
    if (ide === 'antigravity') {
        runtimeSafeCommands = [];
        await refreshAntigravityDiscoveredCommands();
        return;
    }

    try {
        const allCommands = await vscode.commands.getCommands(true);
        runtimeSafeCommands = allCommands.filter(cmd => {
            const c = (cmd || '').toLowerCase();
            if (ide === 'cursor') {
                return c.startsWith('cursorai.') && c.includes('accept');
            }
            return c.startsWith('workbench.action.chat.') && c.includes('accept');
        });

        log(`[AutoCmd] Runtime safe commands: ${runtimeSafeCommands.length}`);
    } catch (err) {
        log(`[AutoCmd] Failed to enumerate runtime commands: ${err.message}`);
    }
}

function log(message) {
    try {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const logLine = `[${timestamp}] ${message}`;
        console.log(logLine);
        if (outputChannel) {
            outputChannel.appendLine(logLine);
        }
    } catch (e) {
        console.error('Logging failed:', e);
    }
}

function detectIDE() {
    const appName = vscode.env.appName || '';
    if (appName.toLowerCase().includes('antigravity')) return 'Antigravity';
    if (appName.toLowerCase().includes('cursor')) return 'Cursor';
    return 'VS Code';
}

function resolveEditorExecutable(ideName) {
    const ide = String(ideName || '').toLowerCase();
    if (ide === 'antigravity') {
        return {
            ide: 'antigravity',
            appName: 'Antigravity',
            exePath: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Antigravity', 'Antigravity.exe'),
            processName: 'Antigravity.exe'
        };
    }

    if (ide === 'cursor') {
        return {
            ide: 'cursor',
            appName: 'Cursor',
            exePath: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'cursor', 'Cursor.exe'),
            processName: 'Cursor.exe'
        };
    }

    return null;
}

function getDesktopDir() {
    const profileDesktop = path.join(os.homedir(), 'Desktop');
    if (fs.existsSync(profileDesktop)) {
        return profileDesktop;
    }
    return process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : profileDesktop;
}

function escapePowerShellSingleQuoted(input) {
    return String(input || '').replace(/'/g, "''");
}

function quoteCmdArg(arg) {
    const text = String(arg ?? '');
    if (text.length === 0) {
        return '""';
    }
    if (/[\s"&()^<>|]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function getWindowsMainProcessCommandLine(exeInfo) {
    if (process.platform !== 'win32' || !exeInfo?.processName) {
        return '';
    }

    const procName = escapePowerShellSingleQuoted(exeInfo.processName);
    const psScript = [
        `$proc = Get-CimInstance Win32_Process -Filter "Name='${procName}'" |`,
        " Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '--type=' } |",
        ' Select-Object -First 1 -ExpandProperty CommandLine;',
        'if ($proc) { Write-Output $proc }'
    ].join('');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true
    });

    if (result.status !== 0) {
        return '';
    }
    return result.stdout ? result.stdout.toString().trim() : '';
}

function extractCliOptionValue(commandLine, optionName) {
    if (!commandLine || !optionName) {
        return '';
    }

    const escaped = optionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const eqPattern = new RegExp(`${escaped}=("([^"]+)"|'([^']+)'|([^\\s]+))`, 'i');
    const spacedPattern = new RegExp(`${escaped}\\s+("([^"]+)"|'([^']+)'|([^\\s]+))`, 'i');

    const eqMatch = commandLine.match(eqPattern);
    if (eqMatch) {
        return eqMatch[2] || eqMatch[3] || eqMatch[4] || '';
    }

    const spacedMatch = commandLine.match(spacedPattern);
    if (spacedMatch) {
        return spacedMatch[2] || spacedMatch[3] || spacedMatch[4] || '';
    }

    return '';
}

function getWindowsRelaunchArgs(exeInfo) {
    const commandLine = getWindowsMainProcessCommandLine(exeInfo);
    if (!commandLine) {
        return [];
    }

    const args = [];
    const options = ['--user-data-dir', '--extensions-dir', '--profile'];
    for (const optionName of options) {
        const optionValue = extractCliOptionValue(commandLine, optionName);
        if (optionValue) {
            args.push(optionName, optionValue);
        }
    }

    return args;
}

function buildManualRestartNote(exeInfo, shortcutPath, port = CDP_PORT) {
    const appName = exeInfo?.appName || 'the IDE';
    return [
        `${appName} will be relaunched with CDP on port ${port}.`,
        'If it does not reopen in the correct window/profile, close the IDE and open this desktop shortcut manually:',
        shortcutPath,
        'In some environments, first-time setup may require 2-3 restarts.'
    ].join('\n');
}

function writeWindowsCdpLauncher(exeInfo, port = CDP_PORT, relaunchArgs = []) {
    const desktopDir = getDesktopDir();
    if (!fs.existsSync(desktopDir)) {
        fs.mkdirSync(desktopDir, { recursive: true });
    }

    const launcherName = `Start ${exeInfo.appName} (CDP ${port}).cmd`;
    const launcherPath = path.join(desktopDir, launcherName);
    const launchArgs = [`--remote-debugging-port=${port}`, ...relaunchArgs];
    const launchArgString = launchArgs.map(quoteCmdArg).join(' ');
    const launcherContent = [
        '@echo off',
        'setlocal',
        'set "ELECTRON_RUN_AS_NODE="',
        `taskkill /IM "${exeInfo.processName}" /F >nul 2>&1`,
        'timeout /t 1 /nobreak >nul',
        `if exist "${exeInfo.exePath}" (`,
        `  start "" "${exeInfo.exePath}" ${launchArgString}`,
        '  exit /b 0',
        ')',
        `echo Unable to find executable: ${exeInfo.exePath}`,
        'exit /b 1'
    ].join('\r\n');

    fs.writeFileSync(launcherPath, launcherContent, 'ascii');
    return launcherPath;
}

function writeWindowsDesktopShortcut(targetCmdPath, exeInfo, port = CDP_PORT) {
    const desktopDir = getDesktopDir();
    const shortcutPath = path.join(desktopDir, `Start ${exeInfo.appName} (CDP ${port}).lnk`);
    const targetEsc = escapePowerShellSingleQuoted(targetCmdPath);
    const workDirEsc = escapePowerShellSingleQuoted(path.dirname(exeInfo.exePath));
    const iconEsc = escapePowerShellSingleQuoted(exeInfo.exePath);
    const lnkEsc = escapePowerShellSingleQuoted(shortcutPath);
    const psScript = [
        '$WScriptShell = New-Object -ComObject WScript.Shell',
        `$Shortcut = $WScriptShell.CreateShortcut('${lnkEsc}')`,
        `$Shortcut.TargetPath = '${targetEsc}'`,
        `$Shortcut.WorkingDirectory = '${workDirEsc}'`,
        `$Shortcut.IconLocation = '${iconEsc},0'`,
        '$Shortcut.Save()'
    ].join(';');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true
    });

    if (result.status !== 0) {
        const stderr = result.stderr ? result.stderr.toString().trim() : '';
        throw new Error(`Failed to create desktop shortcut: ${stderr || 'unknown error'}`);
    }

    return shortcutPath;
}

function runWindowsLauncherDetached(launcherPath) {
    const launchCommand = `start "" "${launcherPath}"`;
    const child = spawn('cmd.exe', ['/d', '/s', '/c', launchCommand], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();
}

async function isCDPPortReady(port = CDP_PORT, timeoutMs = 1200) {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: '127.0.0.1',
            port,
            path: '/json/version',
            timeout: timeoutMs
        }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function createAndRunAutomaticCdpSetup() {
    const exeInfo = resolveEditorExecutable(currentIDE);
    if (!exeInfo) {
        return { ok: false, error: `Automatic setup is not available for ${currentIDE}.` };
    }

    if (!fs.existsSync(exeInfo.exePath)) {
        return { ok: false, error: `${exeInfo.appName} executable not found at ${exeInfo.exePath}` };
    }

    if (process.platform !== 'win32') {
        return { ok: false, error: 'Automatic desktop shortcut setup is currently supported on Windows only.' };
    }

    try {
        const relaunchArgs = getWindowsRelaunchArgs(exeInfo);
        if (relaunchArgs.length > 0) {
            log(`[Setup] Preserving launch args: ${relaunchArgs.join(' ')}`);
        }

        const launcherPath = writeWindowsCdpLauncher(exeInfo, CDP_PORT, relaunchArgs);
        const shortcutPath = writeWindowsDesktopShortcut(launcherPath, exeInfo, CDP_PORT);

        const alreadyReady = await isCDPPortReady(CDP_PORT, 1200);
        let restarted = false;
        if (!alreadyReady) {
            const restartChoice = await vscode.window.showWarningMessage(
                buildManualRestartNote(exeInfo, shortcutPath, CDP_PORT),
                { modal: true },
                'Restart Now',
                'I Will Restart Manually'
            );

            if (restartChoice !== 'I Will Restart Manually') {
                runWindowsLauncherDetached(launcherPath);
                restarted = true;
            }
        }

        return {
            ok: true,
            launcherPath,
            shortcutPath,
            alreadyReady,
            restarted
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

async function maybePromptFirstRunSetup(context) {
    const ide = (currentIDE || '').toLowerCase();
    if (ide !== 'antigravity') {
        return;
    }

    const setupDone = !!context.globalState.get(FIRST_RUN_SETUP_DONE_KEY, false);
    const cdpReady = await isCDPPortReady(CDP_PORT, 1200);
    log(`[Setup] CDP check: ready=${cdpReady} setupDone=${setupDone}`);

    if (cdpReady) {
        if (!setupDone) {
            await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
            log('[Setup] CDP detected; marking setup done');
        }
        return;
    }

    if (setupDone) {
        await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, false);
        log('[Setup] CDP missing while setupDone was true; resetting setupDone=false');
    }

    if (setupPromptShownThisSession) {
        return;
    }
    setupPromptShownThisSession = true;

    const choice = await vscode.window.showWarningMessage(
        `CDP is not enabled on port ${CDP_PORT}. Antigravity Auto Accept can configure this automatically, create a desktop shortcut, and restart Antigravity now. Set it up now?`,
        { modal: true },
        'Set Up Now',
        'Later'
    );
    log(`[Setup] Prompt choice: ${choice || 'dismissed'}`);

    if (choice !== 'Set Up Now') {
        return;
    }

    const result = await createAndRunAutomaticCdpSetup();
    if (!result.ok) {
        vscode.window.showErrorMessage(`Auto setup failed: ${result.error}`);
        return;
    }

    if (result.alreadyReady || result.restarted) {
        await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
        log('[Setup] Automatic setup finished successfully');
    } else {
        log('[Setup] Setup files created; waiting for user manual restart');
        vscode.window.showWarningMessage(
            buildManualRestartNote(resolveEditorExecutable(currentIDE), result.shortcutPath, CDP_PORT),
            { modal: true },
            'OK'
        );
    }
}

async function activate(context) {
    globalContext = context;
    console.log('Antigravity Auto Accept: Activating...');

    try {
        // Create status bar items first
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'auto-accept-free.toggle';
        statusBarItem.text = '$(sync~spin) Auto Accept: Loading...';
        statusBarItem.tooltip = 'Antigravity Auto Accept is initializing...';
        context.subscriptions.push(statusBarItem);
        statusBarItem.show();

        statusBackgroundItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        statusBackgroundItem.command = 'auto-accept-free.toggleBackground';
        statusBackgroundItem.text = '$(globe) Background: OFF';
        statusBackgroundItem.tooltip = 'Background mode works across all agent chats';
        context.subscriptions.push(statusBackgroundItem);

        // Load settings
        const config = vscode.workspace.getConfiguration('autoAcceptFree');
        pollFrequency = config.get('pollInterval', 500);
        bannedCommands = config.get('bannedCommands', [
            'rm -rf /',
            'rm -rf ~',
            'rm -rf *',
            'format c:',
            'del /f /s /q',
            'rmdir /s /q',
            ':(){:|:&};:',
            'dd if=',
            'mkfs.',
            '> /dev/sda',
            'chmod -R 777 /'
        ]);

        // Load persisted state
        const savedEnabled = context.globalState.get('auto-accept-free-enabled', false);
        isEnabled = !!savedEnabled;
        backgroundModeEnabled = context.globalState.get('auto-accept-free-background', false);

        currentIDE = detectIDE();

        // Create output channel
        outputChannel = vscode.window.createOutputChannel('Antigravity Auto Accept');
        context.subscriptions.push(outputChannel);

        log(`Antigravity Auto Accept: Detected ${currentIDE}`);
        log(`Poll interval: ${pollFrequency}ms`);
        log(`Blocked command patterns: ${bannedCommands.length}`);

        await refreshRuntimeSafeCommands();
        if (runtimeCommandRefreshTimer) {
            clearInterval(runtimeCommandRefreshTimer);
            runtimeCommandRefreshTimer = null;
        }
        runtimeCommandRefreshTimer = setInterval(() => {
            refreshRuntimeSafeCommands();
        }, 15000);
        context.subscriptions.push({
            dispose: () => {
                if (runtimeCommandRefreshTimer) {
                    clearInterval(runtimeCommandRefreshTimer);
                    runtimeCommandRefreshTimer = null;
                }
            }
        });

        // Initialize CDP handler
        try {
            const { CDPHandler } = require('./main_scripts/cdp-handler');
            cdpHandler = new CDPHandler(log);
            log('CDP handler initialized');
        } catch (err) {
            log(`Failed to initialize CDP handler: ${err.message}`);
        }

        // Refresh status bar
        updateStatusBar();

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand('auto-accept-free.toggle', () => handleToggle(context)),
            vscode.commands.registerCommand('auto-accept-free.toggleBackground', () => handleBackgroundToggle(context)),
            vscode.commands.registerCommand('auto-accept-free.setupCDP', () => handleSetupCDP())
        );

        // Observe settings changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('autoAcceptFree')) {
                    const newConfig = vscode.workspace.getConfiguration('autoAcceptFree');
                    pollFrequency = newConfig.get('pollInterval', 500);
                    bannedCommands = newConfig.get('bannedCommands', []);
                    log(`Settings updated: ${pollFrequency}ms`);
                    refreshRuntimeSafeCommands();
                    if (isEnabled) {
                        restartPolling();
                    }
                }
            })
        );

        // Start if previously enabled
        if (isEnabled) {
            await startPolling();
        }

        // Prompt after startup UI settles so users reliably see setup dialog on manual install.
        setTimeout(() => {
            maybePromptFirstRunSetup(context).catch(err => {
                log(`[Setup] Prompt failed: ${err.message}`);
            });
        }, 1500);

        log('Antigravity Auto Accept: Activation complete');

    } catch (error) {
        console.error('CRITICAL ACTIVATION ERROR:', error);
        log(`CRITICAL ERROR: ${error.message}`);
        vscode.window.showErrorMessage(`Antigravity Auto Accept failed to activate: ${error.message}`);
    }
}

async function handleToggle(context) {
    log('=== Toggle triggered ===');
    log(`Previous state: ${isEnabled}`);

    try {
        isEnabled = !isEnabled;
        log(`New state: ${isEnabled}`);

        await context.globalState.update('auto-accept-free-enabled', isEnabled);
        updateStatusBar();

        if (isEnabled) {
            log('Auto Accept: ENABLED');
            vscode.window.showInformationMessage('Antigravity Auto Accept is enabled.');
            await startPolling();
        } else {
            log('Auto Accept: DISABLED');
            await stopPolling();
        }

        log('=== Toggle completed ===');
    } catch (e) {
        log(`Toggle failed: ${e.message}`);
    }
}

async function handleBackgroundToggle(context) {
    const now = Date.now();
    if (now - lastBackgroundToggleTs < 1200) {
        return;
    }
    lastBackgroundToggleTs = now;

    log('Background toggle clicked');

    const cdpAvailable = cdpHandler ? await cdpHandler.isCDPAvailable() : false;

    if (!backgroundModeEnabled && !cdpAvailable) {
        vscode.window.showWarningMessage(`Background mode requires CDP on port ${CDP_PORT}. Run: Antigravity Auto Accept: Setup CDP`);
        return;
    }

    backgroundModeEnabled = !backgroundModeEnabled;
    await context.globalState.update('auto-accept-free-background', backgroundModeEnabled);
    log(`Background mode: ${backgroundModeEnabled}`);

    if (isEnabled) {
        await restartPolling();
    }

    updateStatusBar();
}

async function handleSetupCDP() {
    const autoResult = await createAndRunAutomaticCdpSetup();
    if (autoResult.ok) {
        if (autoResult.alreadyReady || autoResult.restarted) {
            await globalContext.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
            vscode.window.showInformationMessage(`CDP setup completed. Desktop shortcut: ${autoResult.shortcutPath}`);
        } else {
            vscode.window.showWarningMessage(
                buildManualRestartNote(resolveEditorExecutable(currentIDE), autoResult.shortcutPath, CDP_PORT),
                { modal: true },
                'OK'
            );
        }
        return;
    }

    const ide = (currentIDE || '').toLowerCase();
    let script = '';

    if (process.platform === 'win32') {
        script = ide === 'antigravity'
            ? `$exe = \"$env:LOCALAPPDATA\\Programs\\Antigravity\\Antigravity.exe\"; Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; Stop-Process -Name Antigravity -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; if (Test-Path $exe) { Start-Process $exe -ArgumentList '--remote-debugging-port=${CDP_PORT}' } else { Write-Host 'Antigravity executable not found:' $exe }`
            : `$exe = \"$env:LOCALAPPDATA\\Programs\\cursor\\Cursor.exe\"; Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; Stop-Process -Name Cursor -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; if (Test-Path $exe) { Start-Process $exe -ArgumentList '--remote-debugging-port=${CDP_PORT}' } else { Write-Host 'Cursor executable not found:' $exe }`;
    } else if (process.platform === 'darwin') {
        script = ide === 'antigravity'
            ? `pkill Antigravity 2>/dev/null; sleep 2; open -n -a Antigravity --args --remote-debugging-port=${CDP_PORT}`
            : `pkill Cursor 2>/dev/null; sleep 2; open -n -a Cursor --args --remote-debugging-port=${CDP_PORT}`;
    } else {
        script = ide === 'antigravity'
            ? `pkill antigravity 2>/dev/null; sleep 2; antigravity --remote-debugging-port=${CDP_PORT} &`
            : `pkill cursor 2>/dev/null; sleep 2; cursor --remote-debugging-port=${CDP_PORT} &`;
    }

    await vscode.env.clipboard.writeText(script);
    vscode.window.showWarningMessage(`Automatic setup failed: ${autoResult.error}. A manual setup command was copied to your clipboard.`);
}

async function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    log('Auto Accept: Starting polling...');

    await refreshRuntimeSafeCommands();
    await refreshAntigravityDiscoveredCommands();

    const getCdpConfig = (quiet = false) => ({
        isBackgroundMode: backgroundModeEnabled,
        ide: currentIDE,
        bannedCommands: bannedCommands,
        pollInterval: pollFrequency,
        quiet
    });

    // Connect CDP if available
    if (cdpHandler) {
        try {
            await cdpHandler.start(getCdpConfig(false));

            if (cdpRefreshTimer) {
                clearInterval(cdpRefreshTimer);
                cdpRefreshTimer = null;
            }

            // Re-scan targets periodically (new webviews / reloads)
            cdpRefreshTimer = setInterval(() => {
                if (!isEnabled) return;
                cdpHandler.start(getCdpConfig(true)).catch(() => {});
            }, 1000);
        } catch (e) {
            log(`CDP unavailable: ${e.message}`);
        }
    }

    if ((currentIDE || '').toLowerCase() === 'antigravity') {
        const cdpConnected = !!(cdpHandler && cdpHandler.getConnectionCount() > 0);
        if (!cdpConnected) {
            log('CDP not connected. Using native command fallback (accept/run/allow/continue).');
        }
    }

    // Execute native accept commands
    await executeAcceptCommandsForIDE();

    // Start polling loop
    pollTimer = setInterval(async () => {
        if (!isEnabled) return;
        
        try {
            await refreshAntigravityDiscoveredCommands();
            await executeAcceptCommandsForIDE();
            const now = Date.now();
            if (cdpHandler && now - lastStatsLogTs > 5000) {
                lastStatsLogTs = now;
                try {
                    const stats = await cdpHandler.getStats();
                    log(`[CDP] Stats clicks=${stats.clicks || 0} blocked=${stats.blocked || 0} files=${stats.fileEdits || 0} terminals=${stats.terminalCommands || 0}`);
                } catch (e) { }
            }
            
            // Validate blocked command patterns
            if (bannedCommands.length > 0) {
                // Dangerous command validation can be expanded here
                // via CDP when available.
            }
        } catch (e) {
            // Intentionally silent
        }
    }, pollFrequency);

    log(`Polling started: ${pollFrequency}ms`);
}

async function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    if (cdpRefreshTimer) {
        clearInterval(cdpRefreshTimer);
        cdpRefreshTimer = null;
    }

    if (cdpHandler) {
        await cdpHandler.stop();
    }
    log('Auto Accept: Polling stopped');
}

async function restartPolling() {
    await stopPolling();
    await startPolling();
}

function updateStatusBar() {
    if (!statusBarItem) return;

    if (statusBackgroundItem) {
        statusBackgroundItem.backgroundColor = undefined;
        statusBackgroundItem.color = undefined;
    }

    if (isEnabled) {
        let statusText = 'ON';
        let icon = '$(check)';
        let tooltip = `Antigravity Auto Accept is active (${pollFrequency}ms)`;

        const cdpConnected = cdpHandler && cdpHandler.getConnectionCount() > 0;
        if (cdpConnected) {
            tooltip += ' | CDP connected';
        } else if ((currentIDE || '').toLowerCase() === 'antigravity') {
            tooltip += ' | CDP disconnected';
        }

        statusBarItem.text = `${icon} Auto Accept: ${statusText}`;
        statusBarItem.tooltip = tooltip;
        statusBarItem.backgroundColor = undefined;

        // Show background toggle
        if (statusBackgroundItem) {
            if (backgroundModeEnabled) {
                statusBackgroundItem.text = '$(sync~spin) Background: ON';
                statusBackgroundItem.tooltip = 'Background mode is active';
            } else {
                statusBackgroundItem.text = '$(globe) Background: OFF';
                statusBackgroundItem.tooltip = 'Click to enable background mode';
            }
            statusBackgroundItem.show();
        }

    } else {
        statusBarItem.text = '$(circle-slash) Auto Accept: OFF';
        statusBarItem.tooltip = 'Click to enable Antigravity Auto Accept';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        // Hide background toggle
        if (statusBackgroundItem) {
            statusBackgroundItem.hide();
        }
    }
}

function deactivate() {
    if (runtimeCommandRefreshTimer) {
        clearInterval(runtimeCommandRefreshTimer);
        runtimeCommandRefreshTimer = null;
    }
    stopPolling();
    if (cdpHandler) {
        cdpHandler.stop();
    }
}

module.exports = { activate, deactivate };


