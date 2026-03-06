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
let statusControlPanelItem;
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
let controlPanel = null;
let cdpPort = 9000;
let savedLauncherPath = '';
let savedLauncherPort = 0;
let pauseOnCdpMismatch = true;
let antigravityExecutablePath = '';
let cursorExecutablePath = '';
let lastCdpMismatchNotificationTs = 0;
let lastControlPanelStatePushTs = 0;
let cdpRuntimeStatus = {
    state: 'unknown',
    message: '',
    expectedPort: 9000,
    activePorts: [],
    connected: false,
    mcp: null
};
let lastMcpDiscovery = {
    checkedAt: 0,
    found: false,
    url: '',
    port: 0,
    reachable: false
};
const lastCommandErrorLogTs = new Map();
const DEFAULT_CDP_PORT = 9000;
const CDP_SCAN_RANGE = 3;
const FIRST_RUN_SETUP_DONE_KEY = 'auto-accept-free-first-run-setup-done-v2';
const SETUP_PROMPT_SNOOZE_UNTIL_KEY = 'auto-accept-free-setup-prompt-snooze-until-v1';
const SAVED_LAUNCHER_PATH_KEY = 'auto-accept-free-saved-launcher-path-v1';
const SAVED_LAUNCHER_PORT_KEY = 'auto-accept-free-saved-launcher-port-v1';
const ANTIGRAVITY_EXECUTABLE_PATH_KEY = 'antigravityExecutablePath';
const CURSOR_EXECUTABLE_PATH_KEY = 'cursorExecutablePath';
const CDP_MISMATCH_NOTIFY_COOLDOWN_MS = 30000;
const LAUNCH_VERIFY_TIMEOUT_MS = 15000;
const SETUP_PROMPT_SNOOZE_MS = 6 * 60 * 60 * 1000;
const SETUP_RETRY_SNOOZE_MS = 10 * 60 * 1000;
const MCP_DISCOVERY_CACHE_MS = 5000;
const DEVTOOLS_MARKER_MAX_AGE_MS = 10 * 60 * 1000;

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

function getExtensionHostKind(context = globalContext) {
    try {
        const ext = context?.extension || vscode.extensions.getExtension('pesosz.antigravity-auto-accept');
        if (!ext) return 'unknown';
        if (ext.extensionKind === vscode.ExtensionKind.UI) return 'ui';
        if (ext.extensionKind === vscode.ExtensionKind.Workspace) return 'workspace';
    } catch (err) {
        log(`[Runtime] Failed to detect extension host kind: ${err.message}`);
    }
    return 'unknown';
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAntigravityLogsRoot() {
    const appData = process.env.APPDATA || '';
    return appData ? path.join(appData, 'Antigravity', 'logs') : '';
}

function findLatestAntigravityMcpUrlFromLogs() {
    const logsRoot = getAntigravityLogsRoot();
    if (!logsRoot || !fs.existsSync(logsRoot)) {
        return { found: false, url: '', port: 0 };
    }

    let newestLogPath = '';
    let newestMtime = 0;
    const stack = [logsRoot];
    while (stack.length > 0) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (err) {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!entry.isFile()) continue;
            if (entry.name !== 'Antigravity.log') continue;
            if (!full.includes(`${path.sep}google.antigravity${path.sep}`)) continue;
            try {
                const stat = fs.statSync(full);
                if (stat.mtimeMs > newestMtime) {
                    newestMtime = stat.mtimeMs;
                    newestLogPath = full;
                }
            } catch (err) {
                // ignore
            }
        }
    }

    if (!newestLogPath) {
        return { found: false, url: '', port: 0 };
    }

    let content = '';
    try {
        content = fs.readFileSync(newestLogPath, 'utf8');
    } catch (err) {
        return { found: false, url: '', port: 0 };
    }

    const pattern = /Chrome DevTools MCP URL discovered at (http:\/\/127\.0\.0\.1:(\d+)\/mcp)/gi;
    let match;
    let lastMatch = null;
    while ((match = pattern.exec(content)) !== null) {
        lastMatch = match;
    }

    if (!lastMatch) {
        return { found: false, url: '', port: 0 };
    }

    const url = String(lastMatch[1] || '');
    const port = normalizeCdpPort(lastMatch[2], 0);
    if (!url || !port) {
        return { found: false, url: '', port: 0 };
    }

    return { found: true, url, port };
}

async function isMcpEndpointReachable(mcpUrl) {
    return new Promise((resolve) => {
        let parsed;
        try {
            parsed = new URL(mcpUrl);
        } catch (err) {
            resolve(false);
            return;
        }

        const req = http.get({
            hostname: parsed.hostname,
            port: Number(parsed.port || 80),
            path: parsed.pathname || '/mcp',
            timeout: 900,
            headers: {
                Accept: 'text/event-stream'
            }
        }, (res) => {
            const ok = res.statusCode === 200 || res.statusCode === 406;
            res.resume();
            resolve(ok);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function detectAntigravityMcpEndpoint() {
    const now = Date.now();
    if ((now - lastMcpDiscovery.checkedAt) < MCP_DISCOVERY_CACHE_MS) {
        return { ...lastMcpDiscovery };
    }

    const latest = findLatestAntigravityMcpUrlFromLogs();
    if (!latest.found) {
        lastMcpDiscovery = {
            checkedAt: now,
            found: false,
            url: '',
            port: 0,
            reachable: false
        };
        return { ...lastMcpDiscovery };
    }

    const reachable = await isMcpEndpointReachable(latest.url);
    lastMcpDiscovery = {
        checkedAt: now,
        found: true,
        url: latest.url,
        port: latest.port,
        reachable
    };
    log(`[Setup] MCP discovery: url=${latest.url} reachable=${reachable}`);
    return { ...lastMcpDiscovery };
}

function normalizeCdpPort(value, fallback = DEFAULT_CDP_PORT) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    const port = Math.trunc(parsed);
    if (port < 1 || port > 65535) {
        return fallback;
    }
    return port;
}

function readAntigravityDevToolsMarker() {
    const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const markerPath = path.join(appDataDir, 'Antigravity', 'DevToolsActivePort');
    if (!fs.existsSync(markerPath)) {
        return { found: false, path: markerPath, port: 0, browserPath: '', ageMs: Number.POSITIVE_INFINITY };
    }

    try {
        const stat = fs.statSync(markerPath);
        const raw = fs.readFileSync(markerPath, 'utf8');
        const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const port = normalizeCdpPort(lines[0], 0);
        return {
            found: port > 0,
            path: markerPath,
            port,
            browserPath: lines[1] || '',
            ageMs: Date.now() - stat.mtimeMs
        };
    } catch (err) {
        return { found: false, path: markerPath, port: 0, browserPath: '', ageMs: Number.POSITIVE_INFINITY };
    }
}

function getCdpPortCandidates(preferredPort) {
    const expected = normalizeCdpPort(preferredPort, DEFAULT_CDP_PORT);
    const candidates = new Set([expected, 9000, 9222, 9229]);
    for (let offset = -CDP_SCAN_RANGE; offset <= CDP_SCAN_RANGE; offset++) {
        const port = expected + offset;
        if (port >= 1 && port <= 65535) {
            candidates.add(port);
        }
    }
    return [...candidates].sort((a, b) => a - b);
}

async function detectCdpRuntimeStatus(expectedPort = cdpPort) {
    const expected = normalizeCdpPort(expectedPort, DEFAULT_CDP_PORT);
    const expectedReady = await isCDPPortReady(expected, 900);
    const activePorts = [];
    const candidates = getCdpPortCandidates(expected);
    const isAntigravity = (currentIDE || '').toLowerCase() === 'antigravity';
    const antigravityExeInfo = isAntigravity ? resolveEditorExecutable('antigravity') : null;
    const antigravityRunning = process.platform === 'win32' && antigravityExeInfo ? isWindowsProcessRunning(antigravityExeInfo) : false;
    const devToolsMarker = isAntigravity ? readAntigravityDevToolsMarker() : null;
    const markerMatchesExpected = !!(
        devToolsMarker?.found &&
        devToolsMarker.port === expected &&
        devToolsMarker.ageMs <= DEVTOOLS_MARKER_MAX_AGE_MS &&
        antigravityRunning
    );

    for (const port of candidates) {
        if (port === expected && (expectedReady || markerMatchesExpected)) {
            activePorts.push(port);
            continue;
        }
        const ready = await isCDPPortReady(port, 400);
        if (ready) {
            activePorts.push(port);
        }
    }

    const connected = !!(cdpHandler && cdpHandler.getConnectionCount() > 0);
    const otherActivePorts = activePorts.filter(port => port !== expected);
    let state = 'ok';
    let message = `CDP ready on port ${expected}.`;
    let mcp = null;

    if (!expectedReady && !markerMatchesExpected && otherActivePorts.length > 0) {
        state = 'wrong_port';
        message = `CDP is active on ${otherActivePorts.join(', ')} but expected port is ${expected}.`;
    } else if (!expectedReady && !markerMatchesExpected) {
        state = 'not_ready';
        message = `CDP is not active on port ${expected}.`;
    } else if ((expectedReady || markerMatchesExpected) && !connected && isAntigravity) {
        state = 'connecting';
        message = markerMatchesExpected
            ? `Antigravity reports DevTools on port ${expected}; waiting for panel target connection.`
            : `CDP is on port ${expected}, waiting for panel target connection.`;
    }

    if (!expectedReady && !markerMatchesExpected && isAntigravity) {
        const mcpInfo = await detectAntigravityMcpEndpoint();
        if (mcpInfo.found) {
            state = 'mcp_only';
            message = mcpInfo.reachable
                ? `Antigravity MCP endpoint detected on port ${mcpInfo.port}; CDP /json endpoint was not found on ${expected}.`
                : `Antigravity MCP endpoint was discovered recently (${mcpInfo.url}), but is not reachable now; CDP /json endpoint was not found on ${expected}.`;
            mcp = { url: mcpInfo.url, port: mcpInfo.port, reachable: mcpInfo.reachable };
        }
    }

    return {
        state,
        message,
        expectedPort: expected,
        activePorts,
        connected,
        mcp
    };
}

function markCdpRuntimeStatus(status) {
    cdpRuntimeStatus = status || cdpRuntimeStatus;
}

function maybeNotifyCdpMismatch(status) {
    if (!pauseOnCdpMismatch) return;
    if (!isEnabled) return;
    if ((currentIDE || '').toLowerCase() !== 'antigravity') return;
    if (status?.state === 'mcp_only') return;
    if (!status || (status.state !== 'wrong_port' && status.state !== 'not_ready')) return;

    const now = Date.now();
    if ((now - lastCdpMismatchNotificationTs) < CDP_MISMATCH_NOTIFY_COOLDOWN_MS) {
        return;
    }
    lastCdpMismatchNotificationTs = now;
    vscode.window.showWarningMessage(`Auto Accept paused: ${status.message} Open "Antigravity Auto Accept: Open Control Panel" to fix.`);
}

function normalizeExecutablePath(value) {
    return String(value || '').trim();
}

function getExecutablePathConfigKey(ideName) {
    const ide = String(ideName || '').toLowerCase();
    if (ide === 'antigravity') return ANTIGRAVITY_EXECUTABLE_PATH_KEY;
    if (ide === 'cursor') return CURSOR_EXECUTABLE_PATH_KEY;
    return '';
}

function getConfiguredExecutablePath(ideName) {
    const key = getExecutablePathConfigKey(ideName);
    if (key === ANTIGRAVITY_EXECUTABLE_PATH_KEY) {
        return antigravityExecutablePath;
    }
    if (key === CURSOR_EXECUTABLE_PATH_KEY) {
        return cursorExecutablePath;
    }
    return '';
}

function setConfiguredExecutablePath(ideName, nextPath) {
    const normalized = normalizeExecutablePath(nextPath);
    const key = getExecutablePathConfigKey(ideName);
    if (key === ANTIGRAVITY_EXECUTABLE_PATH_KEY) {
        antigravityExecutablePath = normalized;
    } else if (key === CURSOR_EXECUTABLE_PATH_KEY) {
        cursorExecutablePath = normalized;
    }
}

function validateConfiguredExecutablePath(exeInfo, candidatePath = '') {
    const configuredPath = normalizeExecutablePath(candidatePath || exeInfo?.configuredPath || getConfiguredExecutablePath(exeInfo?.ide));
    if (!configuredPath) {
        return {
            hasOverride: false,
            valid: true,
            path: '',
            error: ''
        };
    }

    let stat = null;
    try {
        stat = fs.statSync(configuredPath);
    } catch (err) {
        return {
            hasOverride: true,
            valid: false,
            path: configuredPath,
            error: `Configured ${exeInfo?.appName || 'IDE'} path does not exist: ${configuredPath}`
        };
    }

    if (process.platform === 'win32') {
        if (!stat.isFile() || path.extname(configuredPath).toLowerCase() !== '.exe') {
            return {
                hasOverride: true,
                valid: false,
                path: configuredPath,
                error: `Configured ${exeInfo?.appName || 'IDE'} path must point to an existing .exe file: ${configuredPath}`
            };
        }
    } else if (process.platform === 'darwin') {
        const isAppBundle = stat.isDirectory() && /\.app$/i.test(configuredPath);
        if (!(stat.isFile() || isAppBundle)) {
            return {
                hasOverride: true,
                valid: false,
                path: configuredPath,
                error: `Configured ${exeInfo?.appName || 'IDE'} path must point to an existing app bundle or executable: ${configuredPath}`
            };
        }
    } else if (!stat.isFile()) {
        return {
            hasOverride: true,
            valid: false,
            path: configuredPath,
            error: `Configured ${exeInfo?.appName || 'IDE'} path must point to an existing executable file: ${configuredPath}`
        };
    }

    return {
        hasOverride: true,
        valid: true,
        path: configuredPath,
        error: ''
    };
}

function resolveDefaultWindowsExecutable(exeInfo) {
    if (!exeInfo) return '';
    const candidates = Array.isArray(exeInfo.exeCandidates) && exeInfo.exeCandidates.length > 0
        ? exeInfo.exeCandidates
        : [exeInfo.exePath];
    for (const exePath of candidates) {
        if (exePath && fs.existsSync(exePath)) {
            return exePath;
        }
    }
    return '';
}

function getExecutablePreferenceState(exeInfo) {
    if (!exeInfo) {
        return {
            configuredPath: '',
            displayPath: '-',
            source: 'unavailable',
            hasOverride: false,
            valid: false,
            message: 'Executable path controls are not available for this IDE.'
        };
    }

    const configured = validateConfiguredExecutablePath(exeInfo);
    if (configured.hasOverride) {
        return {
            configuredPath: configured.path,
            displayPath: configured.path,
            source: 'manual',
            hasOverride: true,
            valid: configured.valid,
            message: configured.valid
                ? `Using manual ${exeInfo.appName} path override.`
                : configured.error
        };
    }

    if (process.platform === 'win32') {
        const detectedPath = resolveDefaultWindowsExecutable(exeInfo);
        return {
            configuredPath: '',
            displayPath: detectedPath || (exeInfo.exeCandidates || []).join('\n'),
            source: 'auto',
            hasOverride: false,
            valid: !!detectedPath,
            message: detectedPath
                ? `Auto-detected ${exeInfo.appName} at ${detectedPath}.`
                : `${exeInfo.appName} was not found in default locations. Choose the executable path manually.`
        };
    }

    if (process.platform === 'darwin') {
        const appName = exeInfo.macAppName || exeInfo.appName || 'Antigravity';
        return {
            configuredPath: '',
            displayPath: appName,
            source: 'auto',
            hasOverride: false,
            valid: true,
            message: `Auto-launch uses macOS app name "${appName}". Choose a manual app or binary path only if needed.`
        };
    }

    const commandName = exeInfo.linuxCommand || exeInfo.appName || 'antigravity';
    return {
        configuredPath: '',
        displayPath: commandName,
        source: 'auto',
        hasOverride: false,
        valid: true,
        message: `Auto-launch uses command "${commandName}" from PATH. Choose a manual executable path only if needed.`
    };
}

function escapeSingleQuotedPowerShellString(input) {
    return `'${escapePowerShellSingleQuoted(input)}'`;
}

function resolveEditorExecutable(ideName) {
    const ide = String(ideName || '').toLowerCase();
    if (ide === 'antigravity') {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        return {
            ide: 'antigravity',
            appName: 'Antigravity',
            exePath: path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
            exeCandidates: [
                path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
                path.join(localAppData, 'Programs', 'antigravity', 'Antigravity.exe'),
                path.join(programFiles, 'Antigravity', 'Antigravity.exe'),
                path.join(programFilesX86, 'Antigravity', 'Antigravity.exe')
            ],
            configuredPath: getConfiguredExecutablePath('antigravity'),
            configKey: ANTIGRAVITY_EXECUTABLE_PATH_KEY,
            processName: 'Antigravity.exe',
            macAppName: 'Antigravity',
            linuxCommand: 'antigravity'
        };
    }

    if (ide === 'cursor') {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        return {
            ide: 'cursor',
            appName: 'Cursor',
            exePath: path.join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
            exeCandidates: [
                path.join(localAppData, 'Programs', 'cursor', 'Cursor.exe'),
                path.join(localAppData, 'Programs', 'Cursor', 'Cursor.exe'),
                path.join(programFiles, 'Cursor', 'Cursor.exe'),
                path.join(programFilesX86, 'Cursor', 'Cursor.exe')
            ],
            configuredPath: getConfiguredExecutablePath('cursor'),
            configKey: CURSOR_EXECUTABLE_PATH_KEY,
            processName: 'Cursor.exe',
            macAppName: 'Cursor',
            linuxCommand: 'cursor'
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

function getLauncherDir() {
    const desktopDir = getDesktopDir();
    try {
        if (desktopDir && !fs.existsSync(desktopDir)) {
            fs.mkdirSync(desktopDir, { recursive: true });
        }
        if (desktopDir && fs.existsSync(desktopDir)) {
            return desktopDir;
        }
    } catch (err) {
        log(`[Launch] Failed to use desktop directory: ${err.message}`);
    }
    return os.homedir();
}

function escapePowerShellSingleQuoted(input) {
    return String(input || '').replace(/'/g, "''");
}

function quoteShArg(arg) {
    return `'${String(arg ?? '').replace(/'/g, "'\\''")}'`;
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

function buildWindowsArgumentString(args = []) {
    const normalizedArgs = Array.isArray(args)
        ? args
            .map(arg => String(arg ?? ''))
            .filter(arg => arg.trim().length > 0)
        : [];
    return normalizedArgs.map(quoteCmdArg).join(' ');
}

function formatSpawnSyncError(result, fallbackMessage) {
    if (!result) return fallbackMessage;
    if (result.error?.message) {
        return `${fallbackMessage}: ${result.error.message}`;
    }
    const stderr = result.stderr ? result.stderr.toString().trim() : '';
    const stdout = result.stdout ? result.stdout.toString().trim() : '';
    const detail = stderr || stdout;
    return detail ? `${fallbackMessage}: ${detail}` : fallbackMessage;
}

function commandExistsOnHost(commandName) {
    if (!commandName) return false;
    if (process.platform === 'win32') {
        const result = spawnSync('where', [commandName], { windowsHide: true });
        return result.status === 0;
    }
    const result = spawnSync('sh', ['-lc', `command -v "${commandName}" >/dev/null 2>&1`], { windowsHide: true });
    return result.status === 0;
}

function getWindowsCommandLineByPid(pid) {
    const pidValue = Number(pid);
    if (!Number.isFinite(pidValue) || pidValue <= 0) {
        return '';
    }
    const psScript = [
        `$proc = Get-CimInstance Win32_Process -Filter "ProcessId=${Math.trunc(pidValue)}" |`,
        ' Select-Object -ExpandProperty CommandLine;',
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

function getWindowsMainProcessCommandLine(exeInfo) {
    if (process.platform !== 'win32' || !exeInfo?.processName) {
        return '';
    }

    const hintedPid = Number(process.env.VSCODE_PID || 0);
    const byPid = getWindowsCommandLineByPid(hintedPid);
    if (byPid && byPid.includes('.exe')) {
        return byPid;
    }

    const procName = escapePowerShellSingleQuoted(exeInfo.processName);
    const psScript = [
        `$proc = Get-CimInstance Win32_Process -Filter "Name='${procName}'" |`,
        " Where-Object {",
        "   $_.CommandLine -and",
        "   $_.CommandLine -notmatch '--type=' -and",
        "   $_.CommandLine -notmatch '--node-ipc' -and",
        "   $_.CommandLine -notmatch 'resources\\\\app\\\\extensions\\\\'",
        " } |",
        ' Sort-Object CreationDate -Descending |',
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

function hasCliFlag(commandLine, optionName) {
    if (!commandLine || !optionName) {
        return false;
    }
    const escaped = optionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flagPattern = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'i');
    return flagPattern.test(commandLine);
}

function getWindowsRelaunchArgs(exeInfo) {
    const commandLine = getWindowsMainProcessCommandLine(exeInfo);
    if (!commandLine) {
        return [];
    }

    const args = [];
    const valueOptions = [
        '--user-data-dir',
        '--extensions-dir',
        '--profile',
        '--folder-uri',
        '--file-uri',
        '--remote',
        '--workspace'
    ];
    const flagOptions = [
        '--new-window',
        '--reuse-window'
    ];

    for (const optionName of valueOptions) {
        const optionValue = extractCliOptionValue(commandLine, optionName);
        if (optionValue) {
            args.push(optionName, optionValue);
        }
    }

    for (const flagName of flagOptions) {
        if (hasCliFlag(commandLine, flagName)) {
            args.push(flagName);
        }
    }

    return args;
}

function resolveExistingWindowsExecutable(exeInfo) {
    if (!exeInfo) return '';
    const configured = validateConfiguredExecutablePath(exeInfo);
    if (configured.hasOverride) {
        return configured.valid ? configured.path : '';
    }
    return resolveDefaultWindowsExecutable(exeInfo);
}

function buildManualRestartNote(exeInfo, shortcutPath, port = cdpPort) {
    const appName = exeInfo?.appName || 'the IDE';
    return [
        `${appName} launcher is configured for CDP port ${port}.`,
        'If CDP is not detected, close existing IDE windows and open this launcher manually:',
        shortcutPath,
        'In some environments, first-time setup may require 2-3 restarts.'
    ].join('\n');
}

function writeWindowsCdpLauncher(exeInfo, port = cdpPort, relaunchArgs = []) {
    const desktopDir = getLauncherDir();
    const launcherName = `Start ${exeInfo.appName} (CDP ${port}).cmd`;
    const launcherPath = path.join(desktopDir, launcherName);
    const launchArgs = [`--remote-debugging-port=${port}`, ...relaunchArgs];
    const launchArgString = launchArgs.map(quoteCmdArg).join(' ');
    const launcherContent = [
        '@echo off',
        'setlocal',
        'set "ELECTRON_RUN_AS_NODE="',
        `if exist "${exeInfo.exePath}" (`,
        `  start "" "${exeInfo.exePath}" ${launchArgString}`,
        '  exit /b 0',
        ')',
        `echo Unable to find executable: ${exeInfo.exePath}`,
        'exit /b 1'
    ].join('\r\n');

    fs.writeFileSync(launcherPath, launcherContent, 'utf8');
    return launcherPath;
}

function writeWindowsDesktopShortcut(targetCmdPath, exeInfo, port = cdpPort) {
    const desktopDir = getLauncherDir();
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

function writePosixCdpLauncher(exeInfo, port = cdpPort) {
    const launcherDir = getLauncherDir();
    const appLabel = exeInfo?.appName || 'IDE';
    const isMac = process.platform === 'darwin';
    const launcherName = isMac
        ? `Start ${appLabel} (CDP ${port}).command`
        : `Start ${appLabel} (CDP ${port}).sh`;
    const launcherPath = path.join(launcherDir, launcherName);
    const configured = validateConfiguredExecutablePath(exeInfo);
    const commandName = isMac ? '' : (exeInfo.linuxCommand || 'antigravity');
    const appName = exeInfo.macAppName || exeInfo.appName;

    const launcherLines = isMac
        ? (configured.valid && configured.path
            ? (/\.app$/i.test(configured.path)
                ? [
                    '#!/bin/sh',
                    'set -eu',
                    `open -n ${quoteShArg(configured.path)} --args --remote-debugging-port=${port}`
                ]
                : [
                    '#!/bin/sh',
                    'set -eu',
                    `nohup ${quoteShArg(configured.path)} --remote-debugging-port=${port} >/dev/null 2>&1 &`
                ])
            : [
                '#!/bin/sh',
                'set -eu',
                `open -n -a ${quoteShArg(appName)} --args --remote-debugging-port=${port}`
            ])
        : [
            '#!/usr/bin/env sh',
            'set -eu',
            ...(configured.valid && configured.path
                ? [`nohup ${quoteShArg(configured.path)} --remote-debugging-port=${port} >/dev/null 2>&1 &`]
                : [
                    `if ! command -v ${quoteShArg(commandName)} >/dev/null 2>&1; then`,
                    `  echo "Command '${commandName}' not found in PATH." >&2`,
                    '  exit 1',
                    'fi',
                    `nohup ${quoteShArg(commandName)} --remote-debugging-port=${port} >/dev/null 2>&1 &`
                ])
        ];

    fs.writeFileSync(launcherPath, `${launcherLines.join('\n')}\n`, 'utf8');
    fs.chmodSync(launcherPath, 0o755);
    return launcherPath;
}

function launchWindowsShortcut(shortcutPath) {
    const shortcutEsc = escapePowerShellSingleQuoted(shortcutPath);
    const psScript = [
        `$path = '${shortcutEsc}'`,
        'if (-not (Test-Path $path)) { Write-Error "Shortcut not found: $path"; exit 1 }',
        'Start-Process -FilePath $path'
    ].join(';');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true
    });

    if (result.status !== 0 || result.error) {
        throw new Error(formatSpawnSyncError(result, `Failed to launch shortcut ${shortcutPath}`));
    }
}

function isWindowsProcessRunning(exeInfo) {
    if (process.platform !== 'win32' || !exeInfo?.processName) {
        return false;
    }
    const result = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${exeInfo.processName}`, '/FO', 'CSV', '/NH'], {
        windowsHide: true
    });
    if (result.status !== 0 || result.error) {
        return false;
    }
    const output = result.stdout ? result.stdout.toString().toLowerCase() : '';
    return output.includes(exeInfo.processName.toLowerCase());
}

function scheduleWindowsShortcutRestart(shortcutPath, exeInfo) {
    const shortcutEsc = escapePowerShellSingleQuoted(shortcutPath);
    const processBaseName = String(exeInfo?.processName || '')
        .replace(/\.exe$/i, '')
        .trim();
    const processEsc = escapePowerShellSingleQuoted(processBaseName);
    const psScript = [
        '$ErrorActionPreference = "Stop"',
        `$path = '${shortcutEsc}'`,
        `$proc = '${processEsc}'`,
        'Start-Sleep -Milliseconds 350',
        'if ($proc) { Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force }',
        'Start-Sleep -Milliseconds 900',
        'Start-Process -FilePath $path'
    ].join(';');

    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();
}

function launchPosixLauncher(launcherPath) {
    const result = spawnSync('sh', [launcherPath], {
        windowsHide: true
    });
    if (result.status !== 0 || result.error) {
        throw new Error(formatSpawnSyncError(result, `Failed to run launcher ${launcherPath}`));
    }
}

async function isCDPPortReady(port = cdpPort, timeoutMs = 1200) {
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

async function waitForCdpPort(port = cdpPort, timeoutMs = LAUNCH_VERIFY_TIMEOUT_MS, intervalMs = 500) {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
        const ready = await isCDPPortReady(port, Math.max(intervalMs, 1200));
        if (ready) {
            return true;
        }
        await delay(intervalMs);
    }
    return false;
}

async function launchIDEWithPort(port = cdpPort, options = {}) {
    const expectedPort = normalizeCdpPort(port, cdpPort);
    const exeInfo = resolveEditorExecutable(currentIDE);
    const ide = (currentIDE || '').toLowerCase();
    const verifyPort = options.verifyPort !== false;
    const forceRestartIfRunning = !!options.forceRestartIfRunning;
    const verifyTimeoutMs = Number.isFinite(options.verifyTimeoutMs) && options.verifyTimeoutMs > 0
        ? Math.trunc(options.verifyTimeoutMs)
        : LAUNCH_VERIFY_TIMEOUT_MS;
    const extensionHostKind = getExtensionHostKind(options.context || globalContext);

    if (extensionHostKind === 'workspace' && vscode.env.remoteName) {
        return {
            ok: false,
            error: `Launch is running in a remote extension host (${vscode.env.remoteName}). Install this extension locally to launch local ${currentIDE}.`
        };
    }

    if (!exeInfo) {
        return { ok: false, error: `Launch is not available for ${currentIDE}.` };
    }
    const configured = validateConfiguredExecutablePath(exeInfo);
    if (configured.hasOverride && !configured.valid) {
        return { ok: false, error: configured.error };
    }

    if (ide === 'antigravity') {
        const mcpInfo = await detectAntigravityMcpEndpoint();
        if (mcpInfo.found) {
            return {
                ok: false,
                error: mcpInfo.reachable
                    ? `Detected Antigravity MCP endpoint at ${mcpInfo.url}. CDP launch is not supported in this build.`
                    : `Antigravity MCP endpoint was discovered recently (${mcpInfo.url}), and CDP launch is not supported in this build.`,
                reason: 'mcp_only'
            };
        }
    }

    let launcherPath = '';
    let shortcutPath = '';

    try {
        if (process.platform === 'win32') {
            const exePath = resolveExistingWindowsExecutable(exeInfo);
            if (!exePath) {
                return { ok: false, error: `${exeInfo.appName} executable not found in standard locations.` };
            }
            exeInfo.exePath = exePath;
            const relaunchArgs = getWindowsRelaunchArgs(exeInfo);
            launcherPath = writeWindowsCdpLauncher(exeInfo, expectedPort, relaunchArgs);
            if (!fs.existsSync(launcherPath)) {
                return { ok: false, error: `Launcher file was not created: ${launcherPath}` };
            }
            shortcutPath = writeWindowsDesktopShortcut(launcherPath, exeInfo, expectedPort);
            if (!fs.existsSync(shortcutPath)) {
                return { ok: false, error: `Shortcut file was not created: ${shortcutPath}` };
            }
            log(`[Launch] Windows launcher created: ${launcherPath}`);
            log(`[Launch] Windows shortcut created: ${shortcutPath}`);
            const running = isWindowsProcessRunning(exeInfo);
            if (running && forceRestartIfRunning) {
                log('[Launch] Existing IDE process detected; scheduling restart via shortcut.');
                scheduleWindowsShortcutRestart(shortcutPath, exeInfo);
                return {
                    ok: true,
                    launcherPath,
                    shortcutPath,
                    portReady: false,
                    restartScheduled: true
                };
            }
            if (running && !forceRestartIfRunning) {
                return {
                    ok: false,
                    error: `${exeInfo.appName} is already running. Restart is required to apply the CDP port.`,
                    launcherPath,
                    shortcutPath,
                    requiresRestart: true
                };
            }
            launchWindowsShortcut(shortcutPath);
        } else if (process.platform === 'darwin') {
            launcherPath = writePosixCdpLauncher(exeInfo, expectedPort);
            if (!fs.existsSync(launcherPath)) {
                return { ok: false, error: `Launcher file was not created: ${launcherPath}` };
            }
            shortcutPath = launcherPath;
            log(`[Launch] macOS launcher created: ${launcherPath}`);
            launchPosixLauncher(launcherPath);
        } else {
            const commandName = exeInfo.linuxCommand || (ide === 'cursor' ? 'cursor' : 'antigravity');
            if (!commandExistsOnHost(commandName)) {
                return { ok: false, error: `Command '${commandName}' was not found in PATH on this host.` };
            }
            launcherPath = writePosixCdpLauncher(exeInfo, expectedPort);
            if (!fs.existsSync(launcherPath)) {
                return { ok: false, error: `Launcher file was not created: ${launcherPath}` };
            }
            shortcutPath = launcherPath;
            log(`[Launch] Linux launcher created: ${launcherPath}`);
            launchPosixLauncher(launcherPath);
        }
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }

    const portReady = verifyPort ? await waitForCdpPort(expectedPort, verifyTimeoutMs, 500) : false;
    return { ok: true, launcherPath, shortcutPath, portReady };
}

function buildManualLaunchCommand(port = cdpPort) {
    const expectedPort = normalizeCdpPort(port, cdpPort);
    const ide = (currentIDE || '').toLowerCase();
    const exeInfo = resolveEditorExecutable(currentIDE);
    const configured = validateConfiguredExecutablePath(exeInfo);
    if (configured.hasOverride && !configured.valid) {
        return configured.error;
    }
    if (process.platform === 'win32') {
        if (configured.valid && configured.path) {
            return `Start-Process ${escapeSingleQuotedPowerShellString(configured.path)} -ArgumentList '--remote-debugging-port=${expectedPort}'`;
        }
        return ide === 'antigravity'
            ? `$exeCandidates = @(\"$env:LOCALAPPDATA\\Programs\\Antigravity\\Antigravity.exe\", \"$env:ProgramFiles\\Antigravity\\Antigravity.exe\", \"$env:ProgramFiles(x86)\\Antigravity\\Antigravity.exe\"); $exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1; if (-not $exe) { Write-Host 'Antigravity executable not found'; exit 1 }; Start-Process $exe -ArgumentList '--remote-debugging-port=${expectedPort}'`
            : `$exeCandidates = @(\"$env:LOCALAPPDATA\\Programs\\cursor\\Cursor.exe\", \"$env:ProgramFiles\\Cursor\\Cursor.exe\", \"$env:ProgramFiles(x86)\\Cursor\\Cursor.exe\"); $exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1; if (-not $exe) { Write-Host 'Cursor executable not found'; exit 1 }; Start-Process $exe -ArgumentList '--remote-debugging-port=${expectedPort}'`;
    }
    if (process.platform === 'darwin') {
        if (configured.valid && configured.path) {
            if (/\.app$/i.test(configured.path)) {
                return `open -n ${quoteShArg(configured.path)} --args --remote-debugging-port=${expectedPort}`;
            }
            return `${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort}`;
        }
        return ide === 'antigravity'
            ? `open -n -a Antigravity --args --remote-debugging-port=${expectedPort}`
            : `open -n -a Cursor --args --remote-debugging-port=${expectedPort}`;
    }
    if (configured.valid && configured.path) {
        return `${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort} >/dev/null 2>&1 &`;
    }
    return ide === 'antigravity'
        ? `antigravity --remote-debugging-port=${expectedPort} >/dev/null 2>&1 &`
        : `cursor --remote-debugging-port=${expectedPort} >/dev/null 2>&1 &`;
}

function getLauncherFileExtension() {
    if (process.platform === 'win32') return 'lnk';
    if (process.platform === 'darwin') return 'command';
    return 'sh';
}

function getLauncherSaveFilters() {
    if (process.platform === 'win32') return { 'Windows Shortcut': ['lnk'] };
    if (process.platform === 'darwin') return { 'Command File': ['command'] };
    return { 'Shell Script': ['sh'] };
}

function sanitizeLauncherBaseName(input) {
    return String(input || 'IDE').replace(/[\\/:*?"<>|]/g, '').trim() || 'IDE';
}

function getDefaultLauncherFileName(exeInfo, port = cdpPort) {
    const safeName = sanitizeLauncherBaseName(exeInfo?.appName || currentIDE || 'IDE');
    const ext = getLauncherFileExtension();
    if (process.platform === 'linux') {
        return `start-${safeName.toLowerCase().replace(/\s+/g, '-')}-cdp-${port}.${ext}`;
    }
    return `Start ${safeName} (CDP ${port}).${ext}`;
}

function buildPortableLauncherScript(exeInfo, port = cdpPort) {
    const expectedPort = normalizeCdpPort(port, cdpPort);
    const configured = validateConfiguredExecutablePath(exeInfo);

    if (process.platform === 'win32') {
        return '';
    }

    if (process.platform === 'darwin') {
        if (configured.hasOverride && !configured.valid) {
            return '';
        }
        if (configured.valid && configured.path) {
            if (/\.app$/i.test(configured.path)) {
                return [
                    '#!/bin/sh',
                    'set -eu',
                    `open -n ${quoteShArg(configured.path)} --args --remote-debugging-port=${expectedPort} "$@"`
                ].join('\n') + '\n';
            }
            return [
                '#!/bin/sh',
                'set -eu',
                `nohup ${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort} "$@" >/dev/null 2>&1 &`
            ].join('\n') + '\n';
        }
        const appName = exeInfo?.macAppName || exeInfo?.appName || 'Antigravity';
        return [
            '#!/bin/sh',
            'set -eu',
            `open -n -a ${quoteShArg(appName)} --args --remote-debugging-port=${expectedPort} "$@"`
        ].join('\n') + '\n';
    }

    if (configured.hasOverride && !configured.valid) {
        return '';
    }
    if (configured.valid && configured.path) {
        return [
            '#!/usr/bin/env sh',
            'set -eu',
            `nohup ${quoteShArg(configured.path)} --remote-debugging-port=${expectedPort} "$@" >/dev/null 2>&1 &`
        ].join('\n') + '\n';
    }

    const commandName = exeInfo?.linuxCommand || ((currentIDE || '').toLowerCase() === 'cursor' ? 'cursor' : 'antigravity');
    return [
        '#!/usr/bin/env sh',
        'set -eu',
        `if ! command -v ${quoteShArg(commandName)} >/dev/null 2>&1; then`,
        `  echo "Command '${commandName}' not found in PATH." >&2`,
        '  exit 1',
        'fi',
        `nohup ${quoteShArg(commandName)} --remote-debugging-port=${expectedPort} "$@" >/dev/null 2>&1 &`
    ].join('\n') + '\n';
}

function findWindowsShortcutTemplateCandidates(exeInfo, port = cdpPort) {
    const appName = String(exeInfo?.appName || currentIDE || 'IDE').trim();
    const normalizedPort = normalizeCdpPort(port, cdpPort);
    const desktopDir = getDesktopDir();
    const candidates = [
        path.join(desktopDir, `${appName} (CDP).lnk`),
        path.join(desktopDir, `${appName} (CDP ${normalizedPort}).lnk`),
        path.join(desktopDir, `Start ${appName} (CDP ${normalizedPort}).lnk`),
        path.join(desktopDir, `Start ${appName} (CDP).lnk`)
    ];
    return [...new Set(candidates.filter(Boolean))];
}

function readWindowsShortcutDetails(shortcutPath) {
    if (!shortcutPath || !fs.existsSync(shortcutPath)) {
        return null;
    }

    const shortcutEsc = escapePowerShellSingleQuoted(shortcutPath);
    const psScript = [
        '$WScriptShell = New-Object -ComObject WScript.Shell',
        `$Shortcut = $WScriptShell.CreateShortcut('${shortcutEsc}')`,
        "$result = [PSCustomObject]@{",
        "  TargetPath = $Shortcut.TargetPath",
        "  Arguments = $Shortcut.Arguments",
        "  WorkingDirectory = $Shortcut.WorkingDirectory",
        "  IconLocation = $Shortcut.IconLocation",
        '}',
        '$result | ConvertTo-Json -Compress'
    ].join(';');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true
    });

    if (result.status !== 0 || result.error) {
        return null;
    }

    const stdout = result.stdout ? result.stdout.toString().trim() : '';
    if (!stdout) {
        return null;
    }

    try {
        return JSON.parse(stdout);
    } catch (err) {
        return null;
    }
}

function findExistingWindowsShortcutTemplate(exeInfo, port = cdpPort) {
    const normalizedPort = normalizeCdpPort(port, cdpPort);
    const directArg = `--remote-debugging-port=${normalizedPort}`;

    for (const candidate of findWindowsShortcutTemplateCandidates(exeInfo, normalizedPort)) {
        const details = readWindowsShortcutDetails(candidate);
        if (!details) {
            continue;
        }

        if (details.TargetPath && fs.existsSync(details.TargetPath) && String(details.Arguments || '').includes(directArg)) {
            return {
                path: candidate,
                details
            };
        }
    }

    return null;
}

function createWindowsLauncherShortcut(shortcutPath, exeInfo, port = cdpPort, relaunchArgs = []) {
    const expectedPort = normalizeCdpPort(port, cdpPort);
    const template = findExistingWindowsShortcutTemplate(exeInfo, expectedPort);
    const configured = validateConfiguredExecutablePath(exeInfo);
    const extraArgs = Array.isArray(relaunchArgs)
        ? relaunchArgs.map(arg => String(arg ?? '')).filter(arg => arg.trim().length > 0)
        : [];
    const argumentString = buildWindowsArgumentString([`--remote-debugging-port=${expectedPort}`, ...extraArgs]);
    const canReuseTemplate = !!(
        template?.path &&
        extraArgs.length === 0 &&
        path.resolve(template.path) !== path.resolve(shortcutPath) &&
        (!configured.hasOverride || (configured.valid && template?.details?.TargetPath && path.resolve(template.details.TargetPath) === path.resolve(configured.path)))
    );
    if (canReuseTemplate) {
        fs.copyFileSync(template.path, shortcutPath);
        if (fs.existsSync(shortcutPath)) {
            return {
                path: shortcutPath,
                targetPath: template.details?.TargetPath || '',
                arguments: template.details?.Arguments || argumentString,
                copiedFrom: template.path
            };
        }
    }
    const resolvedExePath = configured.valid && configured.path
        ? configured.path
        : template?.details?.TargetPath || resolveExistingWindowsExecutable(exeInfo);
    if (!resolvedExePath) {
        if (configured.hasOverride && !configured.valid) {
            throw new Error(configured.error);
        }
        const candidates = Array.isArray(exeInfo?.exeCandidates) && exeInfo.exeCandidates.length > 0
            ? exeInfo.exeCandidates.filter(Boolean)
            : [exeInfo?.exePath].filter(Boolean);
        throw new Error(
            `Could not find ${exeInfo?.appName || 'IDE'} executable. Checked: ${candidates.join(', ')}`
        );
    }

    const shortcutEsc = escapePowerShellSingleQuoted(shortcutPath);
    const targetEsc = escapePowerShellSingleQuoted(resolvedExePath);
    const workingDirectory = template?.details?.WorkingDirectory || path.dirname(resolvedExePath);
    const iconLocation = template?.details?.IconLocation || `${resolvedExePath},0`;
    const workDirEsc = escapePowerShellSingleQuoted(workingDirectory);
    const iconEsc = escapePowerShellSingleQuoted(iconLocation);
    const argsEsc = escapePowerShellSingleQuoted(argumentString);
    const psScript = [
        '$WScriptShell = New-Object -ComObject WScript.Shell',
        `$Shortcut = $WScriptShell.CreateShortcut('${shortcutEsc}')`,
        `$Shortcut.TargetPath = '${targetEsc}'`,
        `$Shortcut.Arguments = '${argsEsc}'`,
        `$Shortcut.WorkingDirectory = '${workDirEsc}'`,
        `$Shortcut.IconLocation = '${iconEsc}'`,
        '$Shortcut.Save()'
    ].join(';');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true
    });

    if (result.status !== 0 || result.error) {
        throw new Error(formatSpawnSyncError(result, `Failed to create shortcut ${shortcutPath}`));
    }

    if (!fs.existsSync(shortcutPath)) {
        throw new Error(`Shortcut file was not created: ${shortcutPath}`);
    }

    return {
        path: shortcutPath,
        targetPath: resolvedExePath,
        arguments: argumentString
    };
}

async function chooseExecutablePathForCurrentIDE() {
    const exeInfo = resolveEditorExecutable(currentIDE);
    if (!exeInfo) {
        return { ok: false, error: `Executable path override is not available for ${currentIDE}.` };
    }

    const configuredPath = normalizeExecutablePath(getConfiguredExecutablePath(exeInfo.ide));
    const defaultFsPath = configuredPath || (process.platform === 'win32' ? exeInfo.exePath : os.homedir());
    const canSelectFolders = process.platform === 'darwin';
    const filters = process.platform === 'win32'
        ? { Executable: ['exe'] }
        : undefined;
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders,
        openLabel: 'Use This Path',
        title: `Select ${exeInfo.appName} ${process.platform === 'darwin' ? 'app or executable' : 'executable'}`,
        defaultUri: vscode.Uri.file(defaultFsPath),
        filters
    });

    if (!uris || uris.length === 0) {
        return { ok: false, canceled: true };
    }

    const selectedPath = uris[0].fsPath;
    const validation = validateConfiguredExecutablePath(exeInfo, selectedPath);
    if (!validation.valid) {
        return { ok: false, error: validation.error };
    }

    await vscode.workspace.getConfiguration('autoAcceptFree').update(exeInfo.configKey, selectedPath, vscode.ConfigurationTarget.Global);
    setConfiguredExecutablePath(exeInfo.ide, selectedPath);
    return {
        ok: true,
        path: selectedPath,
        appName: exeInfo.appName
    };
}

async function clearExecutablePathForCurrentIDE() {
    const exeInfo = resolveEditorExecutable(currentIDE);
    if (!exeInfo) {
        return { ok: false, error: `Executable path override is not available for ${currentIDE}.` };
    }

    await vscode.workspace.getConfiguration('autoAcceptFree').update(exeInfo.configKey, '', vscode.ConfigurationTarget.Global);
    setConfiguredExecutablePath(exeInfo.ide, '');
    return {
        ok: true,
        appName: exeInfo.appName
    };
}

function buildLauncherManualSteps(savedPath, port = cdpPort) {
    if (!savedPath) {
        return 'No launcher saved yet.';
    }

    const expectedPort = normalizeCdpPort(port, cdpPort);
    const folderPath = path.dirname(savedPath);
    const fileName = path.basename(savedPath);

    if (process.platform === 'win32') {
        return [
            `1. Open File Explorer and go to: ${folderPath}`,
            `2. Double-click: ${fileName}`,
            `3. Always launch the IDE through this file when you want CDP port ${expectedPort}.`,
            '4. Optional: create a shortcut/pin from this file for easier access.'
        ].join('\n');
    }

    if (process.platform === 'darwin') {
        return [
            `1. Open Finder and go to: ${folderPath}`,
            `2. Run: ${fileName}`,
            '3. First run may require Right click -> Open -> Open (macOS Gatekeeper).',
            `4. Always launch the IDE with this file when you want CDP port ${expectedPort}.`
        ].join('\n');
    }

    return [
        `1. Open a terminal in: ${folderPath}`,
        `2. Run: "${savedPath}"`,
        '3. If needed, make sure it is executable: chmod +x "<saved launcher path>".',
        `4. Always launch the IDE with this file when you want CDP port ${expectedPort}.`
    ].join('\n');
}

async function saveLauncherForPort(port = cdpPort) {
    const expectedPort = normalizeCdpPort(port, cdpPort);
    const exeInfo = resolveEditorExecutable(currentIDE);
    if (!exeInfo) {
        return { ok: false, error: `Launcher creation is not available for ${currentIDE}.` };
    }
    const configured = validateConfiguredExecutablePath(exeInfo);
    if (configured.hasOverride && !configured.valid) {
        return { ok: false, error: configured.error };
    }

    const ext = getLauncherFileExtension();
    const defaultName = getDefaultLauncherFileName(exeInfo, expectedPort);
    const preferredTarget = savedLauncherPath && path.extname(savedLauncherPath).toLowerCase() === `.${ext}`
        ? savedLauncherPath
        : path.join(os.homedir(), defaultName);

    const saveUri = await vscode.window.showSaveDialog({
        saveLabel: 'Save IDE Launcher',
        defaultUri: vscode.Uri.file(preferredTarget),
        filters: getLauncherSaveFilters()
    });

    if (!saveUri) {
        return { ok: false, canceled: true };
    }

    const targetPath = saveUri.fsPath;

    try {
        if (process.platform === 'win32') {
            const relaunchArgs = getWindowsRelaunchArgs(exeInfo);
            createWindowsLauncherShortcut(targetPath, exeInfo, expectedPort, relaunchArgs);
        } else {
            const launcherScript = buildPortableLauncherScript(exeInfo, expectedPort);
            if (!launcherScript) {
                return { ok: false, error: 'Failed to build launcher script content.' };
            }
            fs.writeFileSync(targetPath, launcherScript, 'utf8');
            fs.chmodSync(targetPath, 0o755);
        }
    } catch (err) {
        return { ok: false, error: `Failed to save launcher: ${err.message}` };
    }

    savedLauncherPath = targetPath;
    savedLauncherPort = expectedPort;
    if (globalContext) {
        await globalContext.globalState.update(SAVED_LAUNCHER_PATH_KEY, savedLauncherPath);
        await globalContext.globalState.update(SAVED_LAUNCHER_PORT_KEY, savedLauncherPort);
    }

    const instructions = buildLauncherManualSteps(savedLauncherPath, savedLauncherPort);
    return {
        ok: true,
        path: savedLauncherPath,
        port: savedLauncherPort,
        instructions
    };
}

async function createAndRunAutomaticCdpSetup(port = cdpPort) {
    const exeInfo = resolveEditorExecutable(currentIDE);
    if (!exeInfo) {
        return { ok: false, error: `Automatic setup is not available for ${currentIDE}.` };
    }
    const configured = validateConfiguredExecutablePath(exeInfo);
    if (configured.hasOverride && !configured.valid) {
        return { ok: false, error: configured.error };
    }

    if ((currentIDE || '').toLowerCase() === 'antigravity') {
        const mcpInfo = await detectAntigravityMcpEndpoint();
        if (mcpInfo.found) {
            return {
                ok: false,
                error: mcpInfo.reachable
                    ? `Detected Antigravity MCP endpoint at ${mcpInfo.url}. This Antigravity build is not exposing CDP /json on a fixed port, so CDP shortcut setup cannot be completed.`
                    : `Antigravity MCP endpoint was discovered recently (${mcpInfo.url}), but is not reachable now. CDP /json was still not found on fixed port ${port}.`,
                reason: 'mcp_only'
            };
        }
    }

    if (process.platform !== 'win32') {
        const launched = await launchIDEWithPort(port);
        if (!launched.ok) return launched;
        return {
            ok: true,
            launcherPath: launched.launcherPath || '',
            shortcutPath: launched.shortcutPath || launched.launcherPath || '',
            alreadyReady: false,
            restarted: true
        };
    }

    const exePath = resolveExistingWindowsExecutable(exeInfo);
    if (!exePath) {
        return { ok: false, error: `${exeInfo.appName} executable not found in standard locations.` };
    }
    exeInfo.exePath = exePath;

    try {
        const expectedPort = normalizeCdpPort(port, cdpPort);
        const relaunchArgs = getWindowsRelaunchArgs(exeInfo);
        if (relaunchArgs.length > 0) {
            log(`[Setup] Preserving launch args: ${relaunchArgs.join(' ')}`);
        }

        const launcherPath = writeWindowsCdpLauncher(exeInfo, expectedPort, relaunchArgs);
        const shortcutPath = writeWindowsDesktopShortcut(launcherPath, exeInfo, expectedPort);

        const alreadyReady = await isCDPPortReady(expectedPort, 1200);
        let restarted = false;
        if (!alreadyReady) {
            const restartChoice = await vscode.window.showWarningMessage(
                buildManualRestartNote(exeInfo, shortcutPath, expectedPort),
                { modal: true },
                'Restart Now',
                'I Will Restart Manually'
            );

            if (restartChoice !== 'I Will Restart Manually') {
                scheduleWindowsShortcutRestart(shortcutPath, exeInfo);
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

    const now = Date.now();
    const setupDone = !!context.globalState.get(FIRST_RUN_SETUP_DONE_KEY, false);
    const snoozeUntilRaw = context.globalState.get(SETUP_PROMPT_SNOOZE_UNTIL_KEY, 0);
    const snoozeUntil = Number.isFinite(Number(snoozeUntilRaw)) ? Number(snoozeUntilRaw) : 0;
    const status = await detectCdpRuntimeStatus(cdpPort);
    const cdpReady = status.state === 'ok' || status.state === 'connecting';
    log(`[Setup] CDP check: state=${status.state} setupDone=${setupDone} snoozeUntil=${snoozeUntil}`);

    if (status.state === 'mcp_only') {
        if (!setupDone) {
            await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
            log('[Setup] MCP-only Antigravity detected; suppressing CDP setup prompt');
        }
        await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, Date.now() + SETUP_PROMPT_SNOOZE_MS);
        return;
    }

    if (cdpReady) {
        if (!setupDone) {
            await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
            log('[Setup] CDP detected; marking setup done');
        }
        if (snoozeUntil > 0) {
            await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, 0);
        }
        return;
    }

    if (snoozeUntil > now) {
        log(`[Setup] Prompt snoozed for ${(Math.ceil((snoozeUntil - now) / 1000))}s`);
        return;
    }

    if (setupPromptShownThisSession) {
        return;
    }
    setupPromptShownThisSession = true;

    const choice = await vscode.window.showWarningMessage(
        `CDP is not enabled on port ${cdpPort}. Antigravity Auto Accept can configure this automatically, create a desktop shortcut, and restart Antigravity now. Set it up now?`,
        { modal: true },
        'Set Up Now',
        'Later'
    );
    log(`[Setup] Prompt choice: ${choice || 'dismissed'}`);

    if (choice !== 'Set Up Now') {
        await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, now + SETUP_PROMPT_SNOOZE_MS);
        return;
    }

    const result = await createAndRunAutomaticCdpSetup(cdpPort);
    if (!result.ok) {
        if (result.reason === 'mcp_only') {
            await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
            await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, now + SETUP_PROMPT_SNOOZE_MS);
            log(`[Setup] ${result.error}`);
            return;
        }
        await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, now + SETUP_RETRY_SNOOZE_MS);
        vscode.window.showErrorMessage(`Auto setup failed: ${result.error}`);
        return;
    }

    if (result.alreadyReady) {
        await context.globalState.update(FIRST_RUN_SETUP_DONE_KEY, true);
        await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, now + SETUP_RETRY_SNOOZE_MS);
        log('[Setup] Automatic setup finished successfully');
    } else if (result.restarted) {
        await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, now + SETUP_RETRY_SNOOZE_MS);
        log('[Setup] Restart scheduled; CDP will be verified after relaunch');
    } else {
        await context.globalState.update(SETUP_PROMPT_SNOOZE_UNTIL_KEY, now + SETUP_RETRY_SNOOZE_MS);
        log('[Setup] Setup files created; waiting for user manual restart');
        vscode.window.showWarningMessage(
            buildManualRestartNote(resolveEditorExecutable(currentIDE), result.shortcutPath, cdpPort),
            { modal: true },
            'OK'
        );
    }
}

function getControlPanelHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: #0f1217;
      --panel: #151b23;
      --panel-2: #1c2430;
      --txt: #e6edf3;
      --muted: #9aa7b5;
      --accent: #2f81f7;
      --ok: #2ea043;
      --warn: #d29922;
      --bad: #f85149;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: "Segoe UI", system-ui, sans-serif; background: radial-gradient(1200px 500px at -20% -20%, #223146 0%, var(--bg) 48%); color: var(--txt); }
    .wrap { max-width: 960px; margin: 0 auto; display: grid; gap: 12px; }
    .card { background: linear-gradient(165deg, var(--panel), var(--panel-2)); border: 1px solid #2b3342; border-radius: 12px; padding: 12px; }
    .head { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
    .muted { color: var(--muted); font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
    .stat { border: 1px solid #2b3342; border-radius: 10px; padding: 10px; background: #10161f; }
    .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
    .v { margin-top: 4px; font-size: 13px; word-break: break-word; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; }
    label { font-size: 12px; color: var(--muted); display: grid; gap: 6px; }
    input[type="number"] { width: 140px; padding: 8px; background: #0f141c; border: 1px solid #2b3342; border-radius: 8px; color: var(--txt); }
    .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
    button { border: 0; border-radius: 8px; padding: 8px 10px; color: #fff; background: #2a3342; cursor: pointer; }
    button.primary { background: var(--accent); }
    button.good { background: #1f6b37; }
    button.warn { background: #8a6517; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { padding: 8px 10px; border-radius: 8px; font-size: 12px; border: 1px solid #2b3342; background: #111820; }
    .ok { color: #a7f3b6; border-color: #1f6b37; }
    .warnc { color: #fcd58f; border-color: #8a6517; }
    .bad { color: #ffb2ab; border-color: #8c2f2b; }
    pre { margin: 0; white-space: pre-wrap; font-size: 11px; color: #b8c5d3; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <h1>Antigravity Auto Accept Control Panel</h1>
        <button id="refresh">Refresh</button>
      </div>
      <div class="muted">Choose CDP port, save a launcher file anywhere on your machine, and follow the exact open steps.</div>
    </div>

    <div class="card">
      <div id="status" class="status">Loading...</div>
      <div class="grid" style="margin-top:10px;">
        <div class="stat"><div class="k">IDE</div><div id="ide" class="v">-</div></div>
        <div class="stat"><div class="k">Platform</div><div id="platform" class="v">-</div></div>
        <div class="stat"><div class="k">Remote Context</div><div id="remote" class="v">-</div></div>
        <div class="stat"><div class="k">Extension Host</div><div id="hostKind" class="v">-</div></div>
        <div class="stat"><div class="k">Expected CDP Port</div><div id="portValue" class="v">-</div></div>
        <div class="stat"><div class="k">Active CDP Ports</div><div id="ports" class="v">-</div></div>
        <div class="stat"><div class="k">CDP Connections</div><div id="connections" class="v">-</div></div>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <label>CDP Port
          <input id="portInput" type="number" min="1" max="65535" step="1" />
        </label>
        <button class="primary" id="savePort">Save Port</button>
        <button class="good" id="saveLauncher">Save IDE Launcher...</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <label class="toggle"><input id="pauseOnMismatch" type="checkbox" /> Pause when CDP port mismatch is detected</label>
      </div>
    </div>

    <div class="card">
      <div class="k">Executable Path Override</div>
      <pre id="executablePath">-</pre>
      <div class="muted" id="executablePathMeta" style="margin-top:6px;">Auto-detect status: -</div>
      <div class="row" style="margin-top:10px;">
        <button id="chooseExecutable">Choose IDE Path...</button>
        <button class="warn" id="clearExecutable">Clear Manual Path</button>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <button class="primary" id="toggleAuto">Toggle Auto Accept</button>
        <button id="toggleBg">Toggle Background Mode</button>
      </div>
      <div class="muted" style="margin-top:8px;">Auto Accept: <span id="enabled">-</span> | Background: <span id="background">-</span></div>
    </div>

    <div class="card">
      <div class="k">Saved Launcher Path</div>
      <pre id="savedLauncherPath">-</pre>
      <div class="muted" id="savedLauncherPort" style="margin-top:6px;">Launcher port: -</div>
      <div class="k" style="margin-top:10px;">How To Open It</div>
      <pre id="launcherSteps">Save a launcher first to get platform-specific steps.</pre>
    </div>

    <div class="card">
      <div class="k">Manual Command (Alternative)</div>
      <pre id="manualCmd">-</pre>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const byId = (id) => document.getElementById(id);
    let renderedPortValue = '';
    let portInputDirty = false;

    function post(type, payload = {}) {
      vscode.postMessage({ type, ...payload });
    }

    function parsePortInputValue() {
      return Number(String(byId('portInput').value || '').trim());
    }

    function refreshPortDraftState() {
      portInputDirty = String(byId('portInput').value || '') !== renderedPortValue;
    }

    function setStatus(text, kind) {
      const el = byId('status');
      el.textContent = text;
      el.className = 'status ' + (kind || '');
    }

    function render(state) {
      byId('ide').textContent = state.ide || '-';
      byId('platform').textContent = state.platform || '-';
      byId('remote').textContent = state.remoteName || 'local';
      byId('hostKind').textContent = state.extensionHostKind || 'unknown';
      byId('portValue').textContent = String(state.cdpPort || '-');
      byId('ports').textContent = (state.cdpStatus?.activePorts || []).length ? state.cdpStatus.activePorts.join(', ') : 'none';
      byId('connections').textContent = String(state.connectionCount || 0);
      byId('enabled').textContent = state.isEnabled ? 'ON' : 'OFF';
      byId('background').textContent = state.backgroundModeEnabled ? 'ON' : 'OFF';
      byId('manualCmd').textContent = state.manualLaunchCommand || '-';
      byId('savedLauncherPath').textContent = state.savedLauncherPath || '-';
      byId('savedLauncherPort').textContent = state.savedLauncherPath ? ('Launcher port: ' + String(state.savedLauncherPort || '-')) : 'Launcher port: -';
      byId('launcherSteps').textContent = state.launcherSteps || 'Save a launcher first to get platform-specific steps.';
      renderedPortValue = String(state.cdpPort || '');
      if (!portInputDirty) {
        byId('portInput').value = renderedPortValue;
      }
      byId('pauseOnMismatch').checked = !!state.pauseOnCdpMismatch;
      byId('executablePath').textContent = state.executablePath || '-';
      byId('executablePathMeta').textContent = (state.executablePathSource ? ('Source: ' + state.executablePathSource + ' | ') : '') + (state.executablePathMessage || '-');
      byId('clearExecutable').disabled = !state.hasExecutableOverride;

      const s = state.cdpStatus || {};
      const draftPort = parsePortInputValue();
      const invalidDraftPort = !Number.isInteger(draftPort) || draftPort < 1 || draftPort > 65535;
      byId('savePort').disabled = invalidDraftPort;
      byId('saveLauncher').disabled = invalidDraftPort || !!(state.hasExecutableOverride && !state.executablePathValid);
      if (s.state === 'ok') setStatus(s.message || 'CDP is ready.', 'ok');
      else if (s.state === 'connecting') setStatus(s.message || 'CDP is starting.', 'warnc');
      else if (s.state === 'mcp_only') setStatus(s.message || 'MCP mode detected; fixed CDP launcher is not available.', 'warnc');
      else if (s.state === 'wrong_port') setStatus(s.message || 'Wrong CDP port.', 'bad');
      else setStatus(s.message || 'CDP is not ready.', 'warnc');
    }

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'state') {
        render(msg.state || {});
      }
    });

    byId('refresh').addEventListener('click', () => post('refresh'));
    byId('portInput').addEventListener('input', () => refreshPortDraftState());
    byId('portInput').addEventListener('blur', () => refreshPortDraftState());
    byId('savePort').addEventListener('click', () => {
      const port = parsePortInputValue();
      renderedPortValue = String(port);
      portInputDirty = false;
      post('savePort', { port });
    });
    byId('saveLauncher').addEventListener('click', () => post('saveLauncher', { port: parsePortInputValue() }));
    byId('chooseExecutable').addEventListener('click', () => post('chooseExecutable'));
    byId('clearExecutable').addEventListener('click', () => post('clearExecutable'));
    byId('toggleAuto').addEventListener('click', () => post('toggleAuto'));
    byId('toggleBg').addEventListener('click', () => post('toggleBackground'));
    byId('pauseOnMismatch').addEventListener('change', (e) => post('setPauseOnMismatch', { value: !!e.target.checked }));

    post('ready');
    setInterval(() => post('refresh'), 4000);
  </script>
</body>
</html>`;
}

async function buildControlPanelState() {
    const status = await detectCdpRuntimeStatus(cdpPort);
    markCdpRuntimeStatus(status);
    const extensionHostKind = getExtensionHostKind(globalContext);
    const launcherPort = normalizeCdpPort(savedLauncherPort || cdpPort, cdpPort);
    const launcherSteps = buildLauncherManualSteps(savedLauncherPath, launcherPort);
    const exeInfo = resolveEditorExecutable(currentIDE);
    const executableState = getExecutablePreferenceState(exeInfo);
    return {
        ide: currentIDE,
        platform: process.platform,
        remoteName: vscode.env.remoteName || '',
        extensionHostKind,
        isEnabled,
        backgroundModeEnabled,
        cdpPort,
        pauseOnCdpMismatch,
        cdpStatus: status,
        connectionCount: cdpHandler ? cdpHandler.getConnectionCount() : 0,
        manualLaunchCommand: buildManualLaunchCommand(cdpPort),
        savedLauncherPath,
        savedLauncherPort: launcherPort,
        launcherSteps,
        executablePath: executableState.displayPath,
        executablePathSource: executableState.source,
        executablePathMessage: executableState.message,
        hasExecutableOverride: executableState.hasOverride,
        executablePathValid: executableState.valid
    };
}

async function postControlPanelState() {
    if (!controlPanel) return;
    try {
        const state = await buildControlPanelState();
        controlPanel.webview.postMessage({ type: 'state', state });
        updateStatusBar();
    } catch (err) {
        log(`[Panel] Failed to post state: ${err.message}`);
    }
}

async function openControlPanel(context) {
    if (controlPanel) {
        controlPanel.reveal(vscode.ViewColumn.Active);
        await postControlPanelState();
        return;
    }

    controlPanel = vscode.window.createWebviewPanel(
        'autoAcceptControlPanel',
        'Antigravity Auto Accept: Control Panel',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    controlPanel.webview.html = getControlPanelHtml();

    controlPanel.onDidDispose(() => {
        controlPanel = null;
    }, null, context.subscriptions);

    controlPanel.webview.onDidReceiveMessage(async (msg) => {
        if (!msg || typeof msg.type !== 'string') return;
        try {
            if (msg.type === 'ready' || msg.type === 'refresh') {
                await postControlPanelState();
                return;
            }
            if (msg.type === 'savePort') {
                const newPort = normalizeCdpPort(msg.port, cdpPort);
                await vscode.workspace.getConfiguration('autoAcceptFree').update('cdpPort', newPort, vscode.ConfigurationTarget.Global);
                cdpPort = newPort;
                if (isEnabled) {
                    await restartPolling();
                }
                vscode.window.showInformationMessage(`CDP port set to ${newPort}.`);
                await postControlPanelState();
                return;
            }
            if (msg.type === 'chooseExecutable') {
                const result = await chooseExecutablePathForCurrentIDE();
                if (!result.ok) {
                    if (!result.canceled) {
                        vscode.window.showErrorMessage(`Executable path update failed: ${result.error}`);
                    }
                } else {
                    vscode.window.showInformationMessage(`${result.appName} executable path set to:\n${result.path}`);
                }
                await postControlPanelState();
                return;
            }
            if (msg.type === 'clearExecutable') {
                const result = await clearExecutablePathForCurrentIDE();
                if (!result.ok) {
                    vscode.window.showErrorMessage(`Executable path reset failed: ${result.error}`);
                } else {
                    vscode.window.showInformationMessage(`${result.appName} executable path override cleared.`);
                }
                await postControlPanelState();
                return;
            }
            if (msg.type === 'setPauseOnMismatch') {
                const value = !!msg.value;
                await vscode.workspace.getConfiguration('autoAcceptFree').update('pauseOnCdpMismatch', value, vscode.ConfigurationTarget.Global);
                pauseOnCdpMismatch = value;
                updateStatusBar();
                await postControlPanelState();
                return;
            }
            if (msg.type === 'saveLauncher') {
                const launcherPort = normalizeCdpPort(msg.port, cdpPort);
                log(`[Launcher] Save requested for port ${launcherPort}`);
                const result = await saveLauncherForPort(launcherPort);
                if (!result.ok) {
                    if (!result.canceled) {
                        vscode.window.showErrorMessage(`Save launcher failed: ${result.error}`);
                    }
                } else {
                    const infoText = `Launcher saved at:\n${result.path}\n\nHow to open:\n${result.instructions}`;
                    const infoAction = await vscode.window.showInformationMessage(infoText, { modal: true }, 'Copy Steps');
                    if (infoAction === 'Copy Steps') {
                        await vscode.env.clipboard.writeText(result.instructions);
                    }
                }
                await postControlPanelState();
                return;
            }
            if (msg.type === 'launchWithPort' || msg.type === 'setup') {
                vscode.window.showWarningMessage('Launch/setup actions were removed from this panel. Save a launcher file and open the IDE through it.');
                return;
            }
            if (msg.type === 'toggleAuto') {
                await handleToggle(globalContext);
                await postControlPanelState();
                return;
            }
            if (msg.type === 'toggleBackground') {
                await handleBackgroundToggle(globalContext);
                await postControlPanelState();
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Control panel error: ${err.message}`);
        }
    }, null, context.subscriptions);

    await postControlPanelState();
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

        statusControlPanelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        statusControlPanelItem.command = 'auto-accept-free.openControlPanel';
        statusControlPanelItem.text = '$(tools) Auto Accept Panel';
        statusControlPanelItem.tooltip = 'Open Antigravity Auto Accept Control Panel';
        context.subscriptions.push(statusControlPanelItem);
        statusControlPanelItem.show();

        // Load settings
        const config = vscode.workspace.getConfiguration('autoAcceptFree');
        pollFrequency = config.get('pollInterval', 500);
        cdpPort = normalizeCdpPort(config.get('cdpPort', DEFAULT_CDP_PORT), DEFAULT_CDP_PORT);
        pauseOnCdpMismatch = !!config.get('pauseOnCdpMismatch', true);
        antigravityExecutablePath = normalizeExecutablePath(config.get(ANTIGRAVITY_EXECUTABLE_PATH_KEY, ''));
        cursorExecutablePath = normalizeExecutablePath(config.get(CURSOR_EXECUTABLE_PATH_KEY, ''));
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
        savedLauncherPath = String(context.globalState.get(SAVED_LAUNCHER_PATH_KEY, '') || '');
        savedLauncherPort = normalizeCdpPort(context.globalState.get(SAVED_LAUNCHER_PORT_KEY, cdpPort), cdpPort);

        currentIDE = detectIDE();

        // Create output channel
        outputChannel = vscode.window.createOutputChannel('Antigravity Auto Accept');
        context.subscriptions.push(outputChannel);

        log(`Antigravity Auto Accept: Detected ${currentIDE}`);
        log(`Poll interval: ${pollFrequency}ms`);
        log(`CDP port: ${cdpPort}`);
        log(`Pause on mismatch: ${pauseOnCdpMismatch}`);
        if (antigravityExecutablePath) {
            log(`Antigravity executable override: ${antigravityExecutablePath}`);
        }
        if (cursorExecutablePath) {
            log(`Cursor executable override: ${cursorExecutablePath}`);
        }
        if (savedLauncherPath) {
            log(`Saved launcher path: ${savedLauncherPath} (port ${savedLauncherPort})`);
        }
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
            vscode.commands.registerCommand('auto-accept-free.setupCDP', () => handleSetupCDP()),
            vscode.commands.registerCommand('auto-accept-free.openControlPanel', () => openControlPanel(context))
        );

        // Observe settings changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('autoAcceptFree')) {
                    const newConfig = vscode.workspace.getConfiguration('autoAcceptFree');
                    pollFrequency = newConfig.get('pollInterval', 500);
                    cdpPort = normalizeCdpPort(newConfig.get('cdpPort', DEFAULT_CDP_PORT), DEFAULT_CDP_PORT);
                    pauseOnCdpMismatch = !!newConfig.get('pauseOnCdpMismatch', true);
                    antigravityExecutablePath = normalizeExecutablePath(newConfig.get(ANTIGRAVITY_EXECUTABLE_PATH_KEY, ''));
                    cursorExecutablePath = normalizeExecutablePath(newConfig.get(CURSOR_EXECUTABLE_PATH_KEY, ''));
                    bannedCommands = newConfig.get('bannedCommands', []);
                    log(`Settings updated: ${pollFrequency}ms, cdpPort=${cdpPort}, pauseOnMismatch=${pauseOnCdpMismatch}, antigravityPath=${antigravityExecutablePath || '-'}, cursorPath=${cursorExecutablePath || '-'}`);
                    refreshRuntimeSafeCommands();
                    if (isEnabled) {
                        restartPolling();
                    }
                    postControlPanelState();
                }
            })
        );

        // Start if previously enabled
        if (isEnabled) {
            await startPolling();
        }

        log('Startup setup prompts are disabled; use Control Panel -> Save IDE Launcher.');

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

        postControlPanelState();

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

    const cdpAvailable = cdpHandler ? await cdpHandler.isCDPAvailable(cdpPort, CDP_SCAN_RANGE) : false;

    if (!backgroundModeEnabled && !cdpAvailable) {
        vscode.window.showWarningMessage(`Background mode requires CDP on port ${cdpPort}. Run: Antigravity Auto Accept: Setup CDP`);
        return;
    }

    backgroundModeEnabled = !backgroundModeEnabled;
    await context.globalState.update('auto-accept-free-background', backgroundModeEnabled);
    log(`Background mode: ${backgroundModeEnabled}`);

    if (isEnabled) {
        await restartPolling();
    }

    updateStatusBar();
    postControlPanelState();
}

async function handleSetupCDP() {
    const result = await saveLauncherForPort(cdpPort);
    if (!result.ok) {
        if (!result.canceled) {
            vscode.window.showErrorMessage(`Save launcher failed: ${result.error}`);
        }
        postControlPanelState();
        return;
    }
    const infoText = `Launcher saved at:\n${result.path}\n\nHow to open:\n${result.instructions}`;
    const infoAction = await vscode.window.showInformationMessage(infoText, { modal: true }, 'Copy Steps');
    if (infoAction === 'Copy Steps') {
        await vscode.env.clipboard.writeText(result.instructions);
    }
    postControlPanelState();
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
        cdpPort: cdpPort,
        cdpPortRange: CDP_SCAN_RANGE,
        quiet
    });

    const currentStatus = await detectCdpRuntimeStatus(cdpPort);
    markCdpRuntimeStatus(currentStatus);
    maybeNotifyCdpMismatch(currentStatus);
    updateStatusBar();

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
            log(`CDP not connected on expected port ${cdpPort}.`);
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
            const status = await detectCdpRuntimeStatus(cdpPort);
            markCdpRuntimeStatus(status);
            maybeNotifyCdpMismatch(status);
            updateStatusBar();
            if (controlPanel && (now - lastControlPanelStatePushTs > 2000)) {
                lastControlPanelStatePushTs = now;
                postControlPanelState();
            }
            if (cdpHandler && now - lastStatsLogTs > 5000) {
                lastStatsLogTs = now;
                try {
                    const stats = await cdpHandler.getStats();
                    log(`[CDP] Stats clicks=${stats.clicks || 0} permissions=${stats.permissions || 0} blocked=${stats.blocked || 0} files=${stats.fileEdits || 0} terminals=${stats.terminalCommands || 0} lastAction=${stats.lastAction || '-'} lastActionLabel="${(stats.lastActionLabel || '').replace(/"/g, '\'')}"`);
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
    if (statusControlPanelItem) {
        statusControlPanelItem.backgroundColor = undefined;
        statusControlPanelItem.color = undefined;
    }

    if (isEnabled) {
        let statusText = 'ON';
        let icon = '$(check)';
        let tooltip = `Antigravity Auto Accept is active (${pollFrequency}ms)`;

        const cdpConnected = cdpHandler && cdpHandler.getConnectionCount() > 0;
        if ((currentIDE || '').toLowerCase() === 'antigravity' && pauseOnCdpMismatch && cdpRuntimeStatus && cdpRuntimeStatus.state !== 'ok' && cdpRuntimeStatus.state !== 'mcp_only') {
            statusText = 'PAUSED';
            icon = '$(warning)';
            tooltip = `${cdpRuntimeStatus.message} Open Control Panel to fix.`;
        } else if (cdpConnected) {
            tooltip += ' | CDP connected';
        } else if ((currentIDE || '').toLowerCase() === 'antigravity') {
            tooltip += ' | CDP disconnected';
        }

        statusBarItem.text = `${icon} Auto Accept: ${statusText}`;
        statusBarItem.tooltip = tooltip;
        statusBarItem.backgroundColor = undefined;

        if (statusControlPanelItem) {
            const panelIcon = statusText === 'PAUSED' ? '$(warning)' : '$(tools)';
            statusControlPanelItem.text = `${panelIcon} Auto Accept Panel`;
            statusControlPanelItem.tooltip = 'Open Antigravity Auto Accept Control Panel';
            statusControlPanelItem.show();
        }

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

        if (statusControlPanelItem) {
            statusControlPanelItem.text = '$(tools) Auto Accept Panel';
            statusControlPanelItem.tooltip = 'Open Antigravity Auto Accept Control Panel';
            statusControlPanelItem.show();
        }

        // Hide background toggle
        if (statusBackgroundItem) {
            statusBackgroundItem.hide();
        }
    }
}

function deactivate() {
    if (controlPanel) {
        try {
            controlPanel.dispose();
        } catch (e) { }
        controlPanel = null;
    }
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


