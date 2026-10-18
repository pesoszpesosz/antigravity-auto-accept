const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_PORT = 9000;
const DEFAULT_PORT_RANGE = 3;
const TARGET_TYPES_WITH_DOCUMENTS = new Set(['page', 'webview', 'iframe']);

function normalizePort(value, fallback = DEFAULT_BASE_PORT) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const port = Math.trunc(num);
    if (port < 1 || port > 65535) return fallback;
    return port;
}

function normalizePortRange(value, fallback = DEFAULT_PORT_RANGE) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const range = Math.trunc(num);
    if (range < 0 || range > 32) return fallback;
    return range;
}

// Load auto-accept.js script
let _autoAcceptScript = null;
function getAutoAcceptScript() {
    if (_autoAcceptScript) return _autoAcceptScript;

    const candidates = [
        path.join(__dirname, 'auto-accept.js'),
        path.join(__dirname, 'main_scripts', 'auto-accept.js'),
        path.join(__dirname, '..', 'main_scripts', 'auto-accept.js')
    ];

    for (const scriptPath of candidates) {
        if (fs.existsSync(scriptPath)) {
            _autoAcceptScript = fs.readFileSync(scriptPath, 'utf8');
            return _autoAcceptScript;
        }
    }

    throw new Error(`auto-accept.js not found. __dirname=${__dirname}`);
}

class CDPHandler {
    constructor(logger = console.log) {
        this.logger = logger;
        this.connections = new Map();
        this.isEnabled = false;
        this.msgId = 1;
        this._lastConfigHash = '';
        this.basePort = DEFAULT_BASE_PORT;
        this.portRange = DEFAULT_PORT_RANGE;
        this.lastActivityTs = 0;
    }

    log(msg) {
        this.logger(`[CDP] ${msg}`);
    }

    getPortCandidates(basePort = this.basePort, portRange = this.portRange) {
        const base = normalizePort(basePort, DEFAULT_BASE_PORT);
        const range = normalizePortRange(portRange, DEFAULT_PORT_RANGE);
        const ports = [];
        for (let port = base - range; port <= base + range; port++) {
            if (port >= 1 && port <= 65535) {
                ports.push(port);
            }
        }
        return ports;
    }

    async getAvailablePorts(portCandidates = null) {
        const candidates = Array.isArray(portCandidates) && portCandidates.length > 0
            ? [...new Set(portCandidates.map(p => normalizePort(p, 0)).filter(p => p > 0))]
            : this.getPortCandidates();
        const available = [];
        for (const port of candidates) {
            try {
                const pages = await this._getPages(port);
                if (pages.length > 0) {
                    available.push(port);
                }
            } catch (e) { }
        }
        return available;
    }

    async isCDPAvailable(port = this.basePort, portRange = this.portRange) {
        const candidates = this.getPortCandidates(port, portRange);
        for (const port of candidates) {
            try {
                const pages = await this._getPages(port);
                if (pages.length > 0) return true;
            } catch (e) { }
        }
        return false;
    }

    async start(config) {
        this.isEnabled = true;
        this.basePort = normalizePort(config?.cdpPort, this.basePort);
        this.portRange = normalizePortRange(config?.cdpPortRange, this.portRange);
        const candidates = this.getPortCandidates(this.basePort, this.portRange);
        const candidateSet = new Set(candidates);

        for (const [id, conn] of Array.from(this.connections.entries())) {
            const port = Number(String(id).split(':')[0]);
            if (!candidateSet.has(port)) {
                try {
                    conn.ws.close();
                } catch (e) { }
                this.connections.delete(id);
            }
        }

        const quiet = !!config?.quiet;
        const configHash = JSON.stringify({
            b: !!config?.isBackgroundMode,
            i: String(config?.ide || ''),
            bc: Array.isArray(config?.bannedCommands) ? config.bannedCommands.length : 0,
            p: this.basePort,
            r: this.portRange
        });

        if (!quiet || this._lastConfigHash !== configHash) {
            this.log(`Scanning ports ${candidates[0]} to ${candidates[candidates.length - 1]}...`);
            this.log(`Config: background=${config.isBackgroundMode}, ide=${config.ide}`);
        }
        this._lastConfigHash = configHash;

        for (const port of candidates) {
            try {
                const pages = await this._getPages(port);
                if (pages.length > 0) {
                    const newTargets = pages.filter(p => !this.connections.has(`${port}:${p.id}`));
                    if (!quiet || newTargets.length > 0) {
                        const typeSummary = pages.reduce((acc, page) => {
                            const type = page.type || 'unknown';
                            acc[type] = (acc[type] || 0) + 1;
                            return acc;
                        }, {});
                        const typeText = Object.entries(typeSummary).map(([type, count]) => `${type}=${count}`).join(', ');
                        this.log(`Port ${port}: ${pages.length} target(s) found${typeText ? ` (${typeText})` : ''}`);
                    }
                    for (const page of pages) {
                        const id = `${port}:${page.id}`;
                        if (!this.connections.has(id)) {
                            await this._connect(id, page.webSocketDebuggerUrl, page);
                        }
                        await this._inject(id, config);
                    }
                }
            } catch (e) { 
                // Port not available
            }
        }
    }

    async stop() {
        this.isEnabled = false;
        for (const [id, conn] of this.connections) {
            try {
                for (const [sessionId] of conn.childSessions || []) {
                    try {
                        await this._evaluate(id, 'if(window.__autoAcceptStop) window.__autoAcceptStop()', sessionId);
                    } catch (e) { }
                }
                await this._evaluate(id, 'if(window.__autoAcceptStop) window.__autoAcceptStop()');
                conn.mode = null;
                conn.ws.close();
            } catch (e) { }
        }
        this.connections.clear();
    }

    async _getPages(port) {
        return new Promise((resolve, reject) => {
            const req = http.get({ 
                hostname: '127.0.0.1', 
                port, 
                path: '/json/list', 
                timeout: 500 
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const pages = JSON.parse(body);
                        const filtered = pages.filter(p => {
                            if (!p.webSocketDebuggerUrl) return false;
                            if (!TARGET_TYPES_WITH_DOCUMENTS.has(p.type)) return false;
                            const url = (p.url || '').toLowerCase();
                            if (url.startsWith('devtools://') || url.startsWith('chrome-devtools://')) return false;
                            return true;
                        });
                        resolve(filtered);
                    } catch (e) { 
                        resolve([]); 
                    }
                });
            });
            req.on('error', () => resolve([]));
            req.on('timeout', () => { 
                req.destroy(); 
                resolve([]); 
            });
        });
    }

    async _connect(id, url, targetInfo = {}) {
        return new Promise((resolve) => {
            const ws = new WebSocket(url);
            const timeout = setTimeout(() => {
                try { ws.terminate(); } catch (e) { }
                resolve(false);
            }, 3000);

            ws.on('open', () => {
                clearTimeout(timeout);
                const conn = {
                    ws,
                    injected: false,
                    mode: null,
                    targetInfo,
                    childSessions: new Map(),
                    lastConfig: null
                };
                const onMessage = (data) => this._handleConnectionEvent(id, data);
                conn.eventHandler = onMessage;
                ws.on('message', onMessage);
                this.connections.set(id, conn);
                this.markActivity();
                this.log(`Connected to ${targetInfo.type || 'target'} ${id}`);
                resolve(true);
            });
            ws.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
            ws.on('close', () => {
                clearTimeout(timeout);
                this.connections.delete(id);
                this.log(`Disconnected from page ${id}`);
            });
        });
    }

    async _inject(id, config) {
        const conn = this.connections.get(id);
        if (!conn) return;

        const mode = config.isBackgroundMode ? 'background' : 'simple';

        const quiet = !!config?.quiet;
        conn.lastConfig = config;

        try {
            await this._enableChildTargetInjection(id, quiet);

            // Check whether script is still present (webviews can reload)
            if (conn.injected) {
                try {
                    const existsRes = await this._evaluate(id, 'typeof window.__autoAcceptStart === "function"');
                    const exists = !!existsRes?.result?.value;
                    if (!exists) {
                        conn.injected = false;
                        conn.mode = null;
                        if (!quiet) {
                            this.log(`Script missing in ${id}; reinjecting...`);
                        }
                    }
                } catch (e) {
                    conn.injected = false;
                    conn.mode = null;
                }
            }

            // Inject script when needed
            if (!conn.injected) {
                if (!quiet) {
                    this.log(`Injecting script into ${id} (${(getAutoAcceptScript().length / 1024).toFixed(1)}KB)...`);
                }
                await this._installScriptIntoContext(id, null, config, quiet, 1);
                conn.injected = true;
                conn.mode = mode;
                this.markActivity();
                if (!quiet) {
                    this.log(`Script injected into ${id}`);
                }
            }

            // If mode changed, stop current mode first
            if (conn.mode !== null && conn.mode !== mode) {
                this.log(`Mode changed from ${conn.mode} to ${mode}, restarting...`);
                await this._safeEvaluate(id, 'if(window.__autoAcceptStop) window.__autoAcceptStop()', 1);
            }

            // Start with current configuration
            let isRunning = true;
            try {
                const runningRes = await this._safeEvaluate(id, '!!(window.__autoAcceptFreeState && window.__autoAcceptFreeState.isRunning)', 1);
                isRunning = !!runningRes?.result?.value;
            } catch (e) {
                isRunning = false;
            }

            if (conn.mode !== mode || !isRunning) {
                if (!quiet) {
                    this.log(`Calling __autoAcceptStart in ${id}`);
                }
                await this._startScriptInContext(id, null, config, 1);
                conn.mode = mode;
            }

            for (const [sessionId, session] of conn.childSessions) {
                await this._injectChildSession(id, sessionId, session, config, quiet);
            }
        } catch (e) {
            this.log(`Failed to inject into ${id}: ${e.message}`);
        }
    }

    async _enableChildTargetInjection(id, quiet = false) {
        const conn = this.connections.get(id);
        if (!conn || conn.childTargetInjectionEnabled) return;

        try {
            await this._send(id, 'Target.setAutoAttach', {
                autoAttach: true,
                waitForDebuggerOnStart: false,
                flatten: true,
                filter: [
                    { type: 'iframe', exclude: false },
                    { type: 'webview', exclude: false },
                    { type: 'page', exclude: false }
                ]
            });
            conn.childTargetInjectionEnabled = true;
            if (!quiet) {
                this.log(`Child target auto-attach enabled for ${id}`);
            }
        } catch (err) {
            conn.childTargetInjectionEnabled = false;
            if (!quiet) {
                this.log(`Child target auto-attach unavailable for ${id}: ${err.message}`);
            }
        }
    }

    _handleConnectionEvent(id, data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (e) {
            return;
        }

        const conn = this.connections.get(id);
        if (!conn) return;

        if (msg.method === 'Target.attachedToTarget' && msg.params?.sessionId) {
            const targetInfo = msg.params.targetInfo || {};
            if (!TARGET_TYPES_WITH_DOCUMENTS.has(targetInfo.type)) return;
            conn.childSessions.set(msg.params.sessionId, {
                targetInfo,
                injected: false,
                mode: null
            });
            const config = conn.lastConfig;
            if (config && this.isEnabled) {
                this._injectChildSession(id, msg.params.sessionId, conn.childSessions.get(msg.params.sessionId), config, !!config.quiet)
                    .catch(err => this.log(`Failed to inject child target ${id}/${msg.params.sessionId}: ${err.message}`));
            }
            return;
        }

        if (msg.method === 'Target.detachedFromTarget' && msg.params?.sessionId) {
            conn.childSessions.delete(msg.params.sessionId);
        }
    }

    async _injectChildSession(id, sessionId, session, config, quiet = false) {
        if (!session) return;
        const mode = config.isBackgroundMode ? 'background' : 'simple';

        try {
            let exists = false;
            if (session.injected) {
                try {
                    const existsRes = await this._evaluate(id, 'typeof window.__autoAcceptStart === "function"', sessionId);
                    exists = !!existsRes?.result?.value;
                } catch (e) {
                    exists = false;
                }
                if (!exists) {
                    session.injected = false;
                    session.mode = null;
                }
            }

            if (!session.injected) {
                if (!quiet) {
                    this.log(`Injecting script into child ${id}/${sessionId} (${session.targetInfo?.type || 'target'})`);
                }
                await this._installScriptIntoContext(id, sessionId, config, quiet, 1);
                session.injected = true;
                session.mode = mode;
                this.markActivity();
            }

            if (session.mode !== null && session.mode !== mode) {
                await this._safeEvaluate(id, 'if(window.__autoAcceptStop) window.__autoAcceptStop()', 1, sessionId);
                session.mode = null;
            }

            let isRunning = false;
            try {
                const runningRes = await this._safeEvaluate(id, '!!(window.__autoAcceptFreeState && window.__autoAcceptFreeState.isRunning)', 1, sessionId);
                isRunning = !!runningRes?.result?.value;
            } catch (e) {
                isRunning = false;
            }

            if (session.mode !== mode || !isRunning) {
                await this._startScriptInContext(id, sessionId, config, 1);
                session.mode = mode;
            }
        } catch (err) {
            session.injected = false;
            session.mode = null;
            throw err;
        }
    }

    async _installScriptIntoContext(id, sessionId, config, quiet = false, retries = 0) {
        const script = getAutoAcceptScript();
        try {
            await this._send(id, 'Page.addScriptToEvaluateOnNewDocument', { source: script }, sessionId);
        } catch (e) {
            if (!quiet) {
                this.log(`New-document hook unavailable for ${sessionId ? `${id}/${sessionId}` : id}: ${e.message}`);
            }
        }
        await this._safeEvaluate(id, script, retries, sessionId);
        await this._startScriptInContext(id, sessionId, config, retries);
    }

    async _startScriptInContext(id, sessionId, config, retries = 0) {
        const configJson = JSON.stringify({
            ide: config.ide,
            isBackgroundMode: !!config.isBackgroundMode,
            bannedCommands: config.bannedCommands || []
        });
        await this._safeEvaluate(id, `if(window.__autoAcceptStart) window.__autoAcceptStart(${configJson})`, retries, sessionId);
    }

    async _safeEvaluate(id, expression, retries = 0, sessionId = null) {
        let attempts = 0;
        while (true) {
            try {
                return await this._evaluate(id, expression, sessionId);
            } catch (e) {
                if (attempts >= retries) throw e;
                attempts += 1;
                await new Promise(r => setTimeout(r, 120));
            }
        }
    }

    async _evaluate(id, expression, sessionId = null) {
        return this._send(id, 'Runtime.evaluate', {
            expression,
            userGesture: true,
            awaitPromise: true
        }, sessionId);
    }

    async _send(id, method, params = {}, sessionId = null) {
        const conn = this.connections.get(id);
        if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;

        return new Promise((resolve, reject) => {
            const currentId = this.msgId++;
            const timeout = setTimeout(() => {
                conn.ws.off('message', onMessage);
                reject(new Error('CDP Timeout'));
            }, 4500);

            const onMessage = (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === currentId) {
                        conn.ws.off('message', onMessage);
                        clearTimeout(timeout);
                        resolve(msg.result);
                    }
                } catch (e) {}
            };

            conn.ws.on('message', onMessage);
            try {
                const payload = {
                    id: currentId,
                    method,
                    params
                };
                if (sessionId) {
                    payload.sessionId = sessionId;
                }
                conn.ws.send(JSON.stringify(payload));
            } catch (e) {
                conn.ws.off('message', onMessage);
                clearTimeout(timeout);
                reject(e);
            }
        });
    }

    getConnectionCount() { 
        let count = this.connections.size;
        for (const conn of this.connections.values()) {
            count += conn.childSessions?.size || 0;
        }
        return count;
    }

    markActivity() {
        this.lastActivityTs = Date.now();
    }

    hasRecentActivity(gracePeriodMs = 15000) {
        if (this.getConnectionCount() > 0) return true;
        if (!this.lastActivityTs) return false;
        return (Date.now() - this.lastActivityTs) <= gracePeriodMs;
    }

    async getStats() {
        const stats = { clicks: 0, permissions: 0, blocked: 0, fileEdits: 0, terminalCommands: 0, lastAction: '', lastActionLabel: '' };
        const mergeStats = (s) => {
            stats.clicks += s.clicks || 0;
            stats.permissions += s.permissions || 0;
            stats.blocked += s.blocked || 0;
            stats.fileEdits += s.fileEdits || 0;
            stats.terminalCommands += s.terminalCommands || 0;
            if (s.lastActionLabel) {
                stats.lastAction = s.lastAction || '';
                stats.lastActionLabel = s.lastActionLabel || '';
            }
        };
        for (const [id] of this.connections) {
            try {
                const res = await this._evaluate(id, 'JSON.stringify(window.__autoAcceptGetStats ? window.__autoAcceptGetStats() : {})');
                if (res?.result?.value) {
                    mergeStats(JSON.parse(res.result.value));
                }
            } catch (e) { }

            const conn = this.connections.get(id);
            for (const [sessionId] of conn?.childSessions || []) {
                try {
                    const res = await this._evaluate(id, 'JSON.stringify(window.__autoAcceptGetStats ? window.__autoAcceptGetStats() : {})', sessionId);
                    if (res?.result?.value) {
                        mergeStats(JSON.parse(res.result.value));
                    }
                } catch (e) { }
            }
        }
        return stats;
    }
}

module.exports = { CDPHandler };

