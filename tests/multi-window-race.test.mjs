import http from 'http';
import { createRequire } from 'module';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { CDPHandler } = require('../main_scripts/cdp-handler');

function listen(server) {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

describe('Multi-Window CDP Race Resilience', () => {
    test('reports healthy recent activity within grace period even if a connection momentarily drops', () => {
        const handler = new CDPHandler(() => {});
        
        // Initially no connections and no activity
        expect(handler.hasRecentActivity(5000)).toBe(false);

        // Simulate an established target connection
        handler.connections.set('9000:target-window-1', {
            ws: { close: () => {} },
            injected: true,
            mode: 'simple',
            targetInfo: { type: 'page' },
            childSessions: new Map()
        });
        handler.markActivity();

        expect(handler.getConnectionCount()).toBe(1);
        expect(handler.hasRecentActivity(5000)).toBe(true);

        // Simulate Window 2 competing for WebSocket and triggering close on Window 1
        handler.connections.delete('9000:target-window-1');
        expect(handler.getConnectionCount()).toBe(0);

        // In multi-window environments, recent activity grace period prevents instant false-alarm PAUSED
        expect(handler.hasRecentActivity(5000)).toBe(true);
    });

    test('multi-window target discovery survives when one target rejects connection', async () => {
        const server = http.createServer((req, res) => {
            if (req.url === '/json/list') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify([
                    {
                        id: 'window-1-panel',
                        type: 'webview',
                        url: 'vscode-webview://window-1',
                        webSocketDebuggerUrl: 'ws://127.0.0.1:1/non-existent'
                    },
                    {
                        id: 'window-2-panel',
                        type: 'webview',
                        url: 'vscode-webview://window-2',
                        webSocketDebuggerUrl: 'ws://127.0.0.1:1/non-existent'
                    }
                ]));
                return;
            }
            res.writeHead(404);
            res.end();
        });

        const port = await listen(server);
        try {
            const handler = new CDPHandler(() => {});
            const pages = await handler._getPages(port);
            expect(pages.length).toBe(2);
            expect(pages.map(p => p.id)).toEqual(['window-1-panel', 'window-2-panel']);
        } finally {
            await close(server);
        }
    });
});
