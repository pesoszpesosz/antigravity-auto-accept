const vscode = require('vscode');

// Estados
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
let antigravityDiscoveredCommands = [];
const lastCommandErrorLogTs = new Map();

// Configurações
let pollFrequency = 500; // Menos agressivo para nao interferir no chat
let bannedCommands = [];

// Comandos de aceitação nativos por IDE
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
        log(`[AutoCmd] Falha ao listar comandos runtime: ${err.message}`);
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

async function activate(context) {
    globalContext = context;
    console.log('Auto Accept Extension FREE: Activating...');

    try {
        // Criar itens da status bar PRIMEIRO
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'auto-accept-free.toggle';
        statusBarItem.text = '$(sync~spin) Auto Accept: Loading...';
        statusBarItem.tooltip = 'Auto Accept FREE está inicializando...';
        context.subscriptions.push(statusBarItem);
        statusBarItem.show();

        statusBackgroundItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        statusBackgroundItem.command = 'auto-accept-free.toggleBackground';
        statusBackgroundItem.text = '$(globe) Background: OFF';
        statusBackgroundItem.tooltip = 'Background Mode - Funciona em todas as conversas';
        context.subscriptions.push(statusBackgroundItem);

        // Carregar configurações
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

        // Carregar estados salvos
        const savedEnabled = context.globalState.get('auto-accept-free-enabled', false);
        isEnabled = !!savedEnabled;
        backgroundModeEnabled = context.globalState.get('auto-accept-free-background', false);

        currentIDE = detectIDE();

        // Criar canal de output
        outputChannel = vscode.window.createOutputChannel('Auto Accept FREE');
        context.subscriptions.push(outputChannel);

        log(`Auto Accept FREE: Detectado ${currentIDE}`);
        log(`Intervalo: ${pollFrequency}ms`);
        log(`Comandos bloqueados: ${bannedCommands.length} padrões`);

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

        // Inicializar CDP Handler
        try {
            const { CDPHandler } = require('./main_scripts/cdp-handler');
            cdpHandler = new CDPHandler(log);
            log('CDP Handler inicializado com sucesso');
        } catch (err) {
            log(`Erro ao inicializar CDP: ${err.message}`);
        }

        // Atualizar status bar
        updateStatusBar();

        // Registrar comandos
        context.subscriptions.push(
            vscode.commands.registerCommand('auto-accept-free.toggle', () => handleToggle(context)),
            vscode.commands.registerCommand('auto-accept-free.toggleBackground', () => handleBackgroundToggle(context)),
            vscode.commands.registerCommand('auto-accept-free.setupCDP', () => handleSetupCDP())
        );

        // Observar mudanças nas configurações
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('autoAcceptFree')) {
                    const newConfig = vscode.workspace.getConfiguration('autoAcceptFree');
                    pollFrequency = newConfig.get('pollInterval', 500);
                    bannedCommands = newConfig.get('bannedCommands', []);
                    log(`Configurações atualizadas: ${pollFrequency}ms`);
                    refreshRuntimeSafeCommands();
                    if (isEnabled) {
                        restartPolling();
                    }
                }
            })
        );

        // Iniciar se estava habilitado
        if (isEnabled) {
            await startPolling();
        }

        log('Auto Accept FREE: Ativação completa!');

    } catch (error) {
        console.error('ERRO CRÍTICO NA ATIVAÇÃO:', error);
        log(`ERRO CRÍTICO: ${error.message}`);
        vscode.window.showErrorMessage(`Auto Accept Extension FREE falhou ao ativar: ${error.message}`);
    }
}

async function handleToggle(context) {
    log('=== Toggle chamado ===');
    log(`Estado anterior: ${isEnabled}`);

    try {
        isEnabled = !isEnabled;
        log(`Novo estado: ${isEnabled}`);

        await context.globalState.update('auto-accept-free-enabled', isEnabled);
        updateStatusBar();

        if (isEnabled) {
            log('Auto Accept: ATIVADO');
            vscode.window.showInformationMessage('Auto Accept FREE está ativo! 🚀');
            await startPolling();
        } else {
            log('Auto Accept: DESATIVADO');
            await stopPolling();
        }

        log('=== Toggle completo ===');
    } catch (e) {
        log(`Erro no toggle: ${e.message}`);
    }
}

async function handleBackgroundToggle(context) {
    const now = Date.now();
    if (now - lastBackgroundToggleTs < 1200) {
        return;
    }
    lastBackgroundToggleTs = now;

    log('Background toggle clicado');

    const cdpAvailable = cdpHandler ? await cdpHandler.isCDPAvailable() : false;
    
    if (!backgroundModeEnabled && !cdpAvailable) {
        vscode.window.showWarningMessage('Background Mode requer CDP ativo (porta 9000). Use: Auto Accept FREE: Setup CDP');
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
    const platform = process.platform;
    let script = '';
    let message = '';

    if (platform === 'win32') {
        if ((currentIDE || '').toLowerCase() === 'antigravity') {
            script = "$exe = \"$env:LOCALAPPDATA\\Programs\\Antigravity\\Antigravity.exe\"; $env:ELECTRON_RUN_AS_NODE = $null; Stop-Process -Name Antigravity -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; if (Test-Path $exe) { Start-Process $exe -ArgumentList '--remote-debugging-port=9000' } else { Write-Host 'Antigravity não encontrado em' $exe }";
            message = 'Script para Antigravity copiado! Cole no PowerShell e execute.';
        } else {
            script = "$exe = \"$env:LOCALAPPDATA\\Programs\\cursor\\Cursor.exe\"; Stop-Process -Name cursor -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; if (Test-Path $exe) { Start-Process $exe -ArgumentList '--remote-debugging-port=9000' } else { Write-Host 'Cursor não encontrado em' $exe }";
            message = 'Script para Cursor copiado! Cole no PowerShell e execute.';
        }
    } else if (platform === 'darwin') {
        if ((currentIDE || '').toLowerCase() === 'antigravity') {
            script = `pkill Antigravity 2>/dev/null; sleep 2; open -n -a Antigravity --args --remote-debugging-port=9000`;
            message = 'Script para Antigravity (macOS) copiado!';
        } else {
            script = `pkill Cursor 2>/dev/null; sleep 2; open -n -a Cursor --args --remote-debugging-port=9000`;
            message = 'Script para Cursor (macOS) copiado!';
        }
    } else {
        if ((currentIDE || '').toLowerCase() === 'antigravity') {
            script = `pkill antigravity 2>/dev/null; sleep 2; antigravity --remote-debugging-port=9000 &`;
            message = 'Script para Antigravity (Linux) copiado!';
        } else {
            script = `pkill cursor 2>/dev/null; sleep 2; cursor --remote-debugging-port=9000 &`;
            message = 'Script para Cursor (Linux) copiado!';
        }
    }

    await vscode.env.clipboard.writeText(script);
    vscode.window.showInformationMessage(message);
}

async function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    log('Auto Accept: Iniciando polling...');

    await refreshRuntimeSafeCommands();
    await refreshAntigravityDiscoveredCommands();

    const getCdpConfig = (quiet = false) => ({
        isBackgroundMode: backgroundModeEnabled,
        ide: currentIDE,
        bannedCommands: bannedCommands,
        pollInterval: pollFrequency,
        quiet
    });

    // Conectar CDP se disponível
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
            log(`CDP não disponível: ${e.message}`);
        }
    }

    if ((currentIDE || '').toLowerCase() === 'antigravity') {
        const cdpConnected = !!(cdpHandler && cdpHandler.getConnectionCount() > 0);
        if (!cdpConnected) {
            log('CDP não conectado. Usando fallback por comandos nativos (accept/run/allow/continue).');
        }
    }

    // Executar comandos de aceitação nativos
    await executeAcceptCommandsForIDE();

    // Iniciar polling
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
            
            // Verificar comandos bloqueados
            if (bannedCommands.length > 0) {
                // Lógica de verificação de comandos perigosos seria implementada aqui
                // via CDP quando disponível
            }
        } catch (e) {
            // Silencioso
        }
    }, pollFrequency);

    log(`Polling iniciado: ${pollFrequency}ms`);
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
    log('Auto Accept: Polling parado');
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
        let tooltip = `Auto Accept FREE está ativo (${pollFrequency}ms)`;

        const cdpConnected = cdpHandler && cdpHandler.getConnectionCount() > 0;
        if (cdpConnected) {
            tooltip += ' | CDP Conectado';
        } else if ((currentIDE || '').toLowerCase() === 'antigravity') {
            tooltip += ' | CDP desconectado';
        }

        statusBarItem.text = `${icon} Auto Accept: ${statusText}`;
        statusBarItem.tooltip = tooltip;
        statusBarItem.backgroundColor = undefined;

        // Mostrar botão de background
        if (statusBackgroundItem) {
            if (backgroundModeEnabled) {
                statusBackgroundItem.text = '$(sync~spin) Background: ON';
                statusBackgroundItem.tooltip = 'Background Mode ativo';
            } else {
                statusBackgroundItem.text = '$(globe) Background: OFF';
                statusBackgroundItem.tooltip = 'Clique para ativar Background Mode';
            }
            statusBackgroundItem.show();
        }

    } else {
        statusBarItem.text = '$(circle-slash) Auto Accept: OFF';
        statusBarItem.tooltip = 'Clique para ativar Auto Accept FREE';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        // Esconder botão de background
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

