const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_PORT = 9000;
const DEFAULT_PORT_RANGE = 3;

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
                        this.log(`Port ${port}: ${pages.length} page(s) found`);
                    }
                    for (const page of pages) {
                        const id = `${port}:${page.id}`;
                        if (!this.connections.has(id)) {
                            await this._connect(id, page.webSocketDebuggerUrl);
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
                            if (p.type !== 'page' && p.type !== 'webview') return false;
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

    async _connect(id, url) {
        return new Promise((resolve) => {
            const ws = new WebSocket(url);
            const timeout = setTimeout(() => {
                try { ws.terminate(); } catch (e) { }
                resolve(false);
            }, 3000);

            ws.on('open', () => {
                clearTimeout(timeout);
                this.connections.set(id, { ws, injected: false, mode: null });
                this.log(`Connected to page ${id}`);
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

        try {
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
                const script = getAutoAcceptScript();
                if (!quiet) {
                    this.log(`Injecting script into ${id} (${(script.length / 1024).toFixed(1)}KB)...`);
                }
                await this._safeEvaluate(id, script, 1);
                conn.injected = true;
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
                const configJson = JSON.stringify({
                    ide: config.ide,
                    isBackgroundMode: mode === 'background',
                    bannedCommands: config.bannedCommands || []
                });
                if (!quiet) {
                    this.log(`Calling __autoAcceptStart in ${id}`);
                }
                await this._safeEvaluate(id, `if(window.__autoAcceptStart) window.__autoAcceptStart(${configJson})`, 1);
                conn.mode = mode;
            }
        } catch (e) {
            this.log(`Failed to inject into ${id}: ${e.message}`);
        }
    }

    async _safeEvaluate(id, expression, retries = 0) {
        let attempts = 0;
        while (true) {
            try {
                return await this._evaluate(id, expression);
            } catch (e) {
                if (attempts >= retries) throw e;
                attempts += 1;
                await new Promise(r => setTimeout(r, 120));
            }
        }
    }

    async _evaluate(id, expression) {
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
                conn.ws.send(JSON.stringify({
                    id: currentId,
                    method: 'Runtime.evaluate',
                    params: { expression, userGesture: true, awaitPromise: true }
                }));
            } catch (e) {
                conn.ws.off('message', onMessage);
                clearTimeout(timeout);
                reject(e);
            }
        });
    }

    getConnectionCount() { 
        return this.connections.size; 
    }

    async getStats() {
        const stats = { clicks: 0, permissions: 0, blocked: 0, fileEdits: 0, terminalCommands: 0, lastAction: '', lastActionLabel: '' };
        for (const [id] of this.connections) {
            try {
                const res = await this._evaluate(id, 'JSON.stringify(window.__autoAcceptGetStats ? window.__autoAcceptGetStats() : {})');
                if (res?.result?.value) {
                    const s = JSON.parse(res.result.value);
                    stats.clicks += s.clicks || 0;
                    stats.permissions += s.permissions || 0;
                    stats.blocked += s.blocked || 0;
                    stats.fileEdits += s.fileEdits || 0;
                    stats.terminalCommands += s.terminalCommands || 0;
                    if (s.lastActionLabel) {
                        stats.lastAction = s.lastAction || '';
                        stats.lastActionLabel = s.lastActionLabel || '';
                    }
                }
            } catch (e) { }
        }
        return stats;
    }
}

module.exports = { CDPHandler };

