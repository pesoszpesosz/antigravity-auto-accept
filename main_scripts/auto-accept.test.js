// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptSource = fs.readFileSync(path.join(__dirname, 'auto-accept.js'), 'utf8');

function loadScript() {
    window.eval(scriptSource);
}

function buildBulkPrompt({ offscreen = false } = {}) {
    const card = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = '1 File with Changes';

    const reject = document.createElement('span');
    reject.className = 'action';
    reject.tabIndex = 0;
    reject.textContent = 'Reject All';

    const accept = document.createElement('span');
    accept.className = 'action';
    accept.tabIndex = 0;
    accept.textContent = 'Accept All';
    if (offscreen) {
        accept.dataset.offscreen = '1';
        reject.dataset.offscreen = '1';
        title.dataset.offscreen = '1';
        card.dataset.offscreen = '1';
    }

    card.append(title, reject, accept);
    return { card, accept };
}

describe('auto-accept bulk approval handling', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(console, 'log').mockImplementation(() => {});

        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

        Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
            configurable: true,
            value() {
                if (this.dataset && this.dataset.offscreen === '1') {
                    return { top: -200, left: 10, bottom: -120, right: 180, width: 170, height: 80 };
                }
                return { top: 40, left: 10, bottom: 120, right: 180, width: 170, height: 80 };
            }
        });

        loadScript();
    });

    afterEach(() => {
        window.__autoAcceptStop?.();
        delete window.__autoAcceptFreeState;
        delete window.__autoAcceptGetStats;
        delete window.__autoAcceptStart;
        delete window.__autoAcceptStop;
        delete window.__autoAcceptUpdateBannedCommands;
        vi.restoreAllMocks();
    });

    it('clicks the visible File with Changes Accept All action and ignores offscreen stale actions', async () => {
        const panel = document.createElement('div');
        panel.className = 'antigravity-agent-side-panel';

        const stale = buildBulkPrompt({ offscreen: true });
        const current = buildBulkPrompt();

        let staleClicks = 0;
        let currentClicks = 0;
        stale.accept.addEventListener('click', () => { staleClicks += 1; });
        current.accept.addEventListener('click', () => { currentClicks += 1; });

        panel.append(stale.card, current.card);
        document.body.append(panel);

        window.__autoAcceptStart({ ide: 'antigravity', bannedCommands: [] });
        await new Promise(resolve => setTimeout(resolve, 350));

        expect(staleClicks).toBe(0);
        expect(currentClicks).toBeGreaterThan(0);
    });
});
