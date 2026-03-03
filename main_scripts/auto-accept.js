/**
 * Antigravity Auto Accept - Injected script
 * Free and open-source edition
 * 
 * Features:
 * - Automatically clicks "accept", "keep", and "apply" actions
 * - Background mode support
 * - Blocks dangerous command patterns
 */
(function() {
    'use strict';

    if (typeof window === 'undefined') return;

    const log = (msg) => console.log(`[AutoAcceptFREE] ${msg}`);
    log('Script loaded');

    // =================================================================
    // DOM UTILITIES
    // =================================================================

    const getDocuments = (root = document) => {
        let docs = [root];
        try {
            const iframes = root.querySelectorAll('iframe, frame');
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) docs.push(...getDocuments(iframeDoc));
                } catch (e) { }
            }
        } catch (e) { }
        return docs;
    };

    const getQueryRoots = (root, roots = []) => {
        if (!root) return roots;
        roots.push(root);
        try {
            const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (const node of nodes) {
                if (node && node.shadowRoot) {
                    getQueryRoots(node.shadowRoot, roots);
                }
            }
        } catch (e) { }
        return roots;
    };

    const queryAll = (selector) => {
        const results = [];
        const seen = new Set();
        getDocuments().forEach(doc => {
            const roots = getQueryRoots(doc);
            roots.forEach(root => {
                try {
                    const nodes = Array.from(root.querySelectorAll(selector));
                    for (const node of nodes) {
                        if (!seen.has(node)) {
                            seen.add(node);
                            results.push(node);
                        }
                    }
                } catch (e) { }
            });
        });
        return results;
    };

    // =================================================================
    // BUTTON SELECTORS
    // =================================================================

    // Seletores para diferentes IDEs
    const ACCEPT_BUTTON_SELECTORS = [
        // VS Code / Copilot
        '[data-testid="accept-button"]',
        '[data-testid="accept-all-button"]',
        '.accept-button',
        '.accept-all-button',
        'button[title*="Accept"]',
        'button[aria-label*="Accept"]',
        '.codicon-check',
        '.monaco-button[title*="Accept"]',
        '[class*="accept"]',
        
        // Cursor
        '[data-testid="cursor-accept"]',
        '.cursor-accept-button',
        'button[data-action="accept"]',
        '[class*="cursor"] [class*="accept"]',
        
        // Generic
        'button:contains("Accept")',
        'button:contains("Keep")',
        'button:contains("Apply")',
        'button:contains("Save")',
        '[role="button"]:contains("Accept")'
    ];

    // Terminal buttons
    const TERMINAL_BUTTON_SELECTORS = [
        '[data-testid="run-in-terminal"]',
        'button[title*="Run in terminal"]',
        'button[title*=" terminal"]',
        '.terminal-accept-button',
        '[class*="terminal"] [class*="accept"]'
    ];

    // =================================================================
    // MAIN FUNCTION: CLICK BUTTONS
    // =================================================================

    function getActionText(el) {
        const text = (el?.textContent || '').trim();
        const title = (el?.title || '').trim();
        const aria = (el?.getAttribute && el.getAttribute('aria-label') || '').trim();
        return `${text} ${title} ${aria}`.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function isRunActionText(rawText) {
        const t = String(rawText || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!t) return false;
        if (/\balways\s+run\b/i.test(t)) return false;
        if (/\brun\s+in\s+terminal\b/i.test(t)) return false;
        if (/\brunning\b/i.test(t)) return false;
        return /^\s*run/i.test(t) || /\brun\b/i.test(t) || /runalt\+/i.test(t);
    }

    function clickAcceptButtons() {
        let clickedCount = 0;
        const clickedElements = new Set();

        const getInteractiveNodes = (root) => {
            try {
                return Array.from((root || document).querySelectorAll('button, [role="button"], a[role="button"], div[class*="button"], span[class*="button"], div[class*="action"], span[class*="action"]'));
            } catch (e) {
                return [];
            }
        };

        const hasStepInputMarkers = () => {
            const markers = [
                'step requires input',
                'ask every time',
                'reject | run',
                'run command',
                'command?',
                'runalt+',
                'agent execution terminated due to error',
                'continue generating'
            ];

            for (const doc of getDocuments()) {
                try {
                    const text = ((doc.body && doc.body.textContent) || '').toLowerCase();
                    if (markers.some(marker => text.includes(marker))) {
                        return true;
                    }
                } catch (e) { }
            }

            return false;
        };

        const hasErrorRecoveryMarkers = () => {
            const markers = [
                'agent execution terminated due to error',
                'terminated due to error',
                'continue generating',
                'execution error'
            ];

            for (const doc of getDocuments()) {
                try {
                    const text = ((doc.body && doc.body.textContent) || '').toLowerCase();
                    if (markers.some(marker => text.includes(marker))) {
                        return true;
                    }
                } catch (e) { }
            }

            return false;
        };

        const isUserTyping = () => {
            const active = document.activeElement;
            if (!active) return false;
            const tag = (active.tagName || '').toLowerCase();
            if (tag === 'textarea') return true;
            if (tag === 'input') {
                const t = (active.type || '').toLowerCase();
                return !['button', 'submit', 'checkbox', 'radio'].includes(t);
            }
            return !!active.isContentEditable;
        };

        const isExcludedControl = (el, actionText) => {
            if (!el) return true;

            const t = actionText || getActionText(el);
            const controlBlocklist = [
                'auto accept',
                'background',
                'background mode',
                'toggle on/off',
                'setup cdp'
            ];
            if (controlBlocklist.some(keyword => t.includes(keyword))) {
                return true;
            }

            const inStatusBar = !!el.closest('#workbench\\.parts\\.statusbar, .statusbar, .part.statusbar');
            if (inStatusBar) {
                return true;
            }

            const inPromptContext = !!el.closest(
                '[role="dialog"], .notification-toast, .notification-list-item, .monaco-dialog-box, .monaco-dialog-modal-block, .interactive-session, .chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]'
            );

            // Nunca clique em controles globais da interface do editor
            const inWorkbenchChrome = !!el.closest(
                '.titlebar, .menubar, .activitybar, .sidebar, .composite.title, .tabs-container, .editor-actions, .action-bar'
            );
            if (inWorkbenchChrome && !inPromptContext) {
                return true;
            }

            return false;
        };

        const clickElement = (el, reason = '') => {
            if (!el || clickedElements.has(el)) return false;

            try {
                const bypassExclude = reason === 'run-prompt';
                if (!bypassExclude && isExcludedControl(el)) return false;

                const now = Date.now();
                const lastClickedAt = Number(el.getAttribute && el.getAttribute('data-aaf-clicked-at') || 0);
                if (lastClickedAt > 0 && (now - lastClickedAt) < 1400) {
                    return false;
                }

                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;

                if (typeof el.click === 'function') {
                    el.click();
                }

                el.dispatchEvent(new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                }));

                clickedElements.add(el);
                try {
                    el.setAttribute('data-aaf-clicked-at', String(now));
                } catch (e) { }

                try {
                    if (reason === 'permission') {
                        const state = window.__autoAcceptFreeState || {};
                        state.lastPermissionClickAt = now;
                        state.lastPermissionX = rect.left + (rect.width / 2);
                        state.lastPermissionY = rect.top + (rect.height / 2);
                        window.__autoAcceptFreeState = state;

                        const origin = el.closest('[role="dialog"], .notification-toast, .notification-list-item, .monaco-dialog-box, .monaco-dialog-modal-block, .chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]');
                        if (origin && origin.setAttribute) {
                            origin.setAttribute('data-aaf-permission-origin-at', String(now));
                        }
                    }
                } catch (e) { }

                clickedCount++;
                return true;
            } catch (e) {
                return false;
            }
        };

        const triggerRunShortcut = () => {
            try {
                if (isUserTyping()) {
                    return false;
                }

                const state = window.__autoAcceptFreeState || {};
                const now = Date.now();
                if ((state.lastRunShortcutAt || 0) + 4000 > now) {
                    return false;
                }

                // Only send shortcut when there is a visible run-command prompt context
                const promptScopes = queryAll('[role="dialog"], .notification-toast, .notification-list-item, .monaco-dialog-box, .monaco-dialog-modal-block, .interactive-session, .chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]');
                const prompt = promptScopes.find(node => {
                    const t = getActionText(node);
                    if (!t) return false;
                    return (
                        t.includes('run command') ||
                        t.includes('ask every time') ||
                        t.includes('step requires input') ||
                        (t.includes('reject') && (t.includes('run') || t.includes('runalt')))
                    );
                });

                if (!prompt) {
                    return false;
                }

                const promptSig = ((prompt.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()).slice(0, 260);
                if (promptSig && state.lastRunPromptSig === promptSig && (now - (state.lastRunShortcutAt || 0)) < 12000) {
                    return false;
                }

                const targets = [
                    document.activeElement,
                    document.body,
                    document.documentElement
                ].filter(Boolean);

                const combos = [
                    { altKey: true }
                ];

                for (const target of targets) {
                    for (const combo of combos) {
                        const opts = {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                            ...combo
                        };
                        target.dispatchEvent(new KeyboardEvent('keydown', opts));
                        target.dispatchEvent(new KeyboardEvent('keypress', opts));
                        target.dispatchEvent(new KeyboardEvent('keyup', opts));
                    }
                }

                state.lastRunShortcutAt = now;
                state.lastRunPromptSig = promptSig;
                window.__autoAcceptFreeState = state;
                log('Atalho Alt+Enter enviado para executar passo automaticamente');
                return true;
            } catch (e) {
                return false;
            }
        };

        const ACTION_NODE_SELECTOR = 'button, [role="button"], a[role="button"]';

        // 1) Priority: permission prompts (Always Allow / Allow Once / Allow)
        const promptContainers = queryAll('[role="dialog"], .notification-toast, .notification-list-item, .monaco-dialog-box, .monaco-dialog-modal-block, .chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]');
        const allActionButtons = [];
        const seenActionButtons = new Set();
        for (const container of promptContainers) {
            try {
                const scopedButtons = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR));
                for (const btn of scopedButtons) {
                    if (!seenActionButtons.has(btn)) {
                        seenActionButtons.add(btn);
                        allActionButtons.push(btn);
                    }
                }
            } catch (e) { }
        }

        for (const container of promptContainers) {
            const containerText = getActionText(container);
            const permissionMarkers = [
                'opening url in browser',
                'needs permission to act on',
                'permission to act on',
                'requires permission',
                'permission request',
                'grant permission',
                'requesting permission',
                'access permission',
                'allow this',
                'requires your approval',
                'approval required'
            ];
            const isPermissionPrompt =
                permissionMarkers.some(marker => containerText.includes(marker)) &&
                !containerText.includes('allowlist');

            if (!isPermissionPrompt) continue;

            const buttons = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR));
            const isNegative = (txt) => /\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b|\ballowlist\b/i.test(txt);

            const alwaysAllow = buttons.find(btn => {
                const t = getActionText(btn);
                if (!t || isNegative(t)) return false;
                if (/\balways\s+allow\b/i.test(t)) return true;
                if (/^always\b/i.test(t) && !/\balways\s+run\b/i.test(t)) return true;
                if (/\balways\s*\.\.\./i.test(t)) return true;
                return false;
            });

            if (alwaysAllow && clickElement(alwaysAllow, 'permission')) {
                log('URL permission approved with "Always Allow"');
                return clickedCount;
            }

            const allowOnce = buttons.find(btn => {
                const t = getActionText(btn);
                return /\ballow\s+once\b/i.test(t);
            });

            if (allowOnce && clickElement(allowOnce, 'permission')) {
                log('URL permission approved with "Allow Once"');
                return clickedCount;
            }

            const allowButton = buttons.find(btn => {
                const t = getActionText(btn);
                if (!t) return false;
                const hasAllowAction = /\ballow\b/i.test(t) || /\bapprove\b/i.test(t) || /\bgrant\b/i.test(t) || /^always\b/i.test(t);
                const hasBlockedWord = /\ballowlist\b|\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(t);
                return hasAllowAction && !hasBlockedWord;
            });

            if (allowButton && clickElement(allowButton, 'permission')) {
                log(`Permission approved automatically: "${getActionText(allowButton)}"`);
                return clickedCount;
            }

            const primaryButton = buttons.find(btn => {
                const t = getActionText(btn);
                if (!t || isNegative(t)) return false;
                const cls = String(btn.className || '').toLowerCase();
                return cls.includes('primary') || cls.includes('prominent') || cls.includes('cta');
            });

            if (primaryButton && clickElement(primaryButton, 'permission')) {
                log(`Permission approved via primary button: "${getActionText(primaryButton)}"`);
                return clickedCount;
            }

            const fallbackAllow = getInteractiveNodes(container).find(el => {
                const t = getActionText(el);
                if (!t || isNegative(t)) return false;
                const hasAllowAction = /\ballow\b/i.test(t) || /\bapprove\b/i.test(t) || /\bgrant\b/i.test(t) || /^always\b/i.test(t);
                return hasAllowAction;
            });

            if (fallbackAllow && clickElement(fallbackAllow, 'permission')) {
                log(`Permission approved via fallback: "${getActionText(fallbackAllow)}"`);
                return clickedCount;
            }
        }

        const findActionContext = (btn) => {
            const direct = btn.closest('[role="dialog"], .notification-toast, .notification-list-item, .monaco-dialog-box, .monaco-dialog-modal-block, .chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]');
            if (direct) return direct;

            let node = btn.parentElement;
            let depth = 0;
            while (node && depth < 10) {
                try {
                    const neighbors = Array.from(node.querySelectorAll(ACTION_NODE_SELECTOR));
                    const hasRejectOrAlwaysRun = neighbors.some(el => {
                        const t = getActionText(el);
                        return /\breject\b/i.test(t) || /\balways\s+run\b/i.test(t);
                    });
                    if (hasRejectOrAlwaysRun) {
                        return node;
                    }
                } catch (e) { }
                node = node.parentElement;
                depth++;
            }
            return null;
        };

        // 1.5) Command execution prompt (example: Reject | Run Alt+Enter)
        const hasGlobalStepInput = hasStepInputMarkers();
        const hasStrictStepInput = (() => {
            for (const doc of getDocuments()) {
                try {
                    const text = ((doc.body && doc.body.textContent) || '').toLowerCase();
                    if (text.includes('step requires input') || text.includes('requires input')) {
                        return true;
                    }
                } catch (e) { }
            }
            return false;
        })();
        const hasGlobalRecoveryError = hasErrorRecoveryMarkers();
        // 1.55) Automatic recovery after agent error (Continue Generating)
        if (hasGlobalRecoveryError) {
            for (const btn of allActionButtons) {
                const text = getActionText(btn);
                const isContinueGenerating = text.includes('continue generating') || /^continue(\b|\s)/i.test(text);
                if (isContinueGenerating && clickElement(btn)) {
                    log(`Flow recovered automatically after error: "${text}"`);
                    return clickedCount;
                }
            }
        }

        const runCandidates = [];
        const nowForRun = Date.now();
        const hasRecentPermissionOrigin = queryAll('[data-aaf-permission-origin-at]').some(node => {
            try {
                const ts = Number(node.getAttribute('data-aaf-permission-origin-at') || 0);
                return ts > 0 && (nowForRun - ts) < 8000;
            } catch (e) {
                return false;
            }
        });

        for (const btn of allActionButtons) {
            const text = getActionText(btn);
            const isRunButton = isRunActionText(text);
            if (!isRunButton) continue;

            const container = findActionContext(btn);
            if (!container) continue;

            const permissionOriginAt = Number(container.getAttribute && container.getAttribute('data-aaf-permission-origin-at') || 0);
            const isFromRecentPermissionOrigin = permissionOriginAt > 0 && (nowForRun - permissionOriginAt) < 8000;
            if (hasRecentPermissionOrigin && !isFromRecentPermissionOrigin) {
                continue;
            }

            const containerText = getActionText(container);
            const neighbors = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR));
            const hasReject = neighbors.some(el => /\breject\b/i.test(getActionText(el)));
            const hasAlwaysRun = neighbors.some(el => /\balways\s+run\b/i.test(getActionText(el)));
            const hasPermissionPending = (
                ['opening url in browser', 'needs permission to act on', 'permission to act on', 'requires permission', 'permission request', 'allow this', 'approval required'].some(marker => containerText.includes(marker)) &&
                neighbors.some(el => {
                    const t = getActionText(el);
                    if (!t) return false;
                    if (/\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b|\ballowlist\b/i.test(t)) return false;
                    return /\ballow\b|\bapprove\b|\bgrant\b|^always\b/i.test(t);
                })
            );
            if (hasPermissionPending) {
                continue;
            }

            let score = 0;
            if (hasReject) score += 4;
            if (hasAlwaysRun) score += 3;
            if (containerText.includes('step requires input') || containerText.includes('requires input')) score += 5;
            if (containerText.includes('ask every time')) score += 3;
            if (containerText.includes('run alt') || containerText.includes('runalt')) score += 2;
            if (containerText.includes('continue generating')) score += 2;
            if (/\brun\s*alt/i.test(text) || /runalt/i.test(text)) score += 2;
            if (/\brun\s+in\s+terminal\b/i.test(text)) score -= 2;
            if (isFromRecentPermissionOrigin) score += 12;

            try {
                const state = window.__autoAcceptFreeState || {};
                const recentPermissionClick = state.lastPermissionClickAt && (Date.now() - state.lastPermissionClickAt < 6000);
                if (recentPermissionClick) {
                    const rect = btn.getBoundingClientRect();
                    const cx = rect.left + (rect.width / 2);
                    const cy = rect.top + (rect.height / 2);
                    const dx = cx - Number(state.lastPermissionX || 0);
                    const dy = cy - Number(state.lastPermissionY || 0);
                    const distance = Math.hypot(dx, dy);
                    if (distance < 420) score += 6;
                    else if (distance < 700) score += 2;
                }
            } catch (e) { }

            if (score > 0) {
                runCandidates.push({ btn, text, score });
            }
        }

        if (runCandidates.length > 0) {
            runCandidates.sort((a, b) => b.score - a.score);
            const best = runCandidates[0];
            if (clickElement(best.btn, 'run-prompt')) {
                log(`Execution approved automatically: "${best.text}" (score=${best.score})`);
                return clickedCount;
            }
        }

        // 1.51) Fallback for Run in non-standard elements
        if (hasGlobalStepInput) {
            for (const container of promptContainers) {
                const runFallback = getInteractiveNodes(container).find(el => {
                    const t = getActionText(el);
                    if (!t) return false;
                    if (!isRunActionText(t)) return false;
                    if (/\breject\b|\bdeny\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(t)) return false;
                    if (isExcludedControl(el, t)) return false;

                    const scope = findActionContext(el) || container || el.parentElement;
                    const containerText = getActionText(scope || el);
                    const hasPermissionPending = (
                        ['opening url in browser', 'needs permission to act on', 'permission to act on', 'requires permission', 'permission request', 'allow this', 'approval required'].some(marker => containerText.includes(marker)) &&
                        !!(scope && getInteractiveNodes(scope).some(n => {
                            const nt = getActionText(n);
                            if (!nt) return false;
                            if (/\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b|\ballowlist\b/i.test(nt)) return false;
                            return /\ballow\b|\bapprove\b|\bgrant\b|^always\b/i.test(nt);
                        }))
                    );
                    if (hasPermissionPending) return false;
                    return ['step requires input', 'ask every time', 'requires input', 'reject', 'run alt', 'runalt', 'run command', 'command?'].some(marker => containerText.includes(marker));
                });

                if (runFallback && clickElement(runFallback, 'run-prompt')) {
                    log(`Execution approved via fallback: "${getActionText(runFallback)}"`);
                    return clickedCount;
                }
            }
        }

        // 1.52) Strict global fallback for "Run command?" when the container is not identified
        {
            const findRunPromptContext = (btn) => {
                let node = btn;
                let depth = 0;
                while (node && depth < 12) {
                    try {
                        const contextText = getActionText(node);
                        const neighbors = Array.from(node.querySelectorAll(ACTION_NODE_SELECTOR));
                        const hasRejectNearby = neighbors.some(el => /\breject\b|\bdeny\b|\bcancel\b/i.test(getActionText(el)));
                        const hasRunNearby = neighbors.some(el => {
                            const t = getActionText(el);
                            return isRunActionText(t);
                        });

                        const hasStepMarker = [
                            'run command',
                            'ask every time',
                            'step requires input',
                            'requires input',
                            'run alt',
                            'runalt',
                            'alt+enter',
                            'alt+',
                            'always run',
                            'command?'
                        ].some(marker => contextText.includes(marker));

                        if ((hasRejectNearby && hasRunNearby) || hasStepMarker) {
                            return node;
                        }
                    } catch (e) { }
                    node = node.parentElement;
                    depth++;
                }
                return null;
            };

            const strictRunCandidates = [];
            const allButtonsGlobal = queryAll(ACTION_NODE_SELECTOR);

            for (const btn of allButtonsGlobal) {
                const text = getActionText(btn);
                if (!text) continue;
                if (!isRunActionText(text)) continue;
                if (/\brun\s+in\s+terminal\b/i.test(text)) continue;
                if (/\breject\b|\bdeny\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(text)) continue;
                if (isExcludedControl(btn, text)) continue;

                const context = findActionContext(btn) || findRunPromptContext(btn);
                if (!context) continue;

                const contextText = getActionText(context);
                const neighbors = Array.from(context.querySelectorAll(ACTION_NODE_SELECTOR));
                const hasReject = neighbors.some(el => /\breject\b|\bdeny\b|\bcancel\b/i.test(getActionText(el)));
                const hasStepMarker = [
                    'run command',
                    'ask every time',
                    'step requires input',
                    'requires input',
                    'run alt',
                    'runalt',
                    'alt+enter',
                    'alt+',
                    'always run',
                    'command?'
                ].some(marker => contextText.includes(marker));

                if (!hasReject && !hasStepMarker) continue;

                let score = 0;
                if (hasReject) score += 4;
                if (hasStepMarker) score += 4;
                if (/\brun\s*alt/i.test(text) || /runalt/i.test(text)) score += 2;
                if (isRunActionText(text)) score += 1;
                strictRunCandidates.push({ btn, text, score });
            }

            if (strictRunCandidates.length > 0) {
                strictRunCandidates.sort((a, b) => b.score - a.score);
                const bestStrictRun = strictRunCandidates[0];
                if (clickElement(bestStrictRun.btn, 'run-prompt')) {
                    log(`Execution approved via strict global fallback: "${bestStrictRun.text}" (score=${bestStrictRun.score})`);
                    return clickedCount;
                }
            }
        }

        // 1.56) Some flows hide Run behind an Expand button
        if (hasStrictStepInput) {
            const state = window.__autoAcceptFreeState || {};
            const now = Date.now();
            const canClickExpand = (state.lastExpandClickAt || 0) + 1200 <= now;

            if (canClickExpand) {
                for (const btn of allActionButtons) {
                    const text = getActionText(btn);
                    if (!/\bexpand\b/i.test(text)) continue;
                    if (/\bexpand\s+all\b/i.test(text)) continue;

                    const container = findActionContext(btn) || btn.parentElement;
                    const containerText = getActionText(container || btn);
                    const neighbors = container ? Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) : [];

                    const hasRunOrRejectNearby = neighbors.some(el => {
                        const t = getActionText(el);
                        return isRunActionText(t) || /\breject\b/i.test(t) || /\balways\s+run\b/i.test(t);
                    });

                    const hasStepMarkerNearby = ['step requires input', 'ask every time', 'requires input'].some(marker => containerText.includes(marker));

                    if ((hasRunOrRejectNearby || hasStepMarkerNearby) && clickElement(btn)) {
                        state.lastExpandClickAt = now;
                        window.__autoAcceptFreeState = state;
                        log(`Step input expanded automatically: "${text}"`);
                        return clickedCount;
                    }
                }
            }
        }

        // 1.57) "Ask every time" flows may expose an "Allow" button
        if (hasGlobalStepInput) {
            for (const btn of allActionButtons) {
                const text = getActionText(btn);
                const isAllowAction = /\ballow\b/i.test(text) || /\bapprove\b/i.test(text) || /\bgrant\b/i.test(text);
                if (!isAllowAction) continue;
                if (/\ballowlist\b|\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(text)) continue;

                const container = findActionContext(btn) || btn.parentElement;
                const containerText = getActionText(container || btn);
                const neighbors = container ? Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) : [];
                const hasRejectNearby = neighbors.some(el => /\breject\b|\bdeny\b|\bcancel\b/i.test(getActionText(el)));
                const hasInputSignals = ['step requires input', 'ask every time', 'requires input', 'permission', 'browser'].some(marker => containerText.includes(marker));

                if ((hasInputSignals || hasRejectNearby) && clickElement(btn)) {
                    log(`Step permission approved automatically: "${text}"`);
                    return clickedCount;
                }
            }
        }

        if ((hasGlobalStepInput || hasStrictStepInput) && triggerRunShortcut()) {
            clickedCount++;
            return clickedCount;
        }

        // 1.6) Continue paused/interrupted flow
        for (const btn of allActionButtons) {
            const text = getActionText(btn);
            const isContinueButton = /\bcontinue\b/i.test(text);
            if (!isContinueButton) continue;

            const container = findActionContext(btn);
            if (!container) continue;

            const containerText = getActionText(container);
            const neighbors = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR));
            const hasPauseSignal = ['stopped', 'paused', 'interrupted', 'retry', 'continue'].some(word => containerText.includes(word));
            const hasControlPair = neighbors.some(el => /\b(reject|cancel|retry|stop)\b/i.test(getActionText(el)));
            const hasInputSignal = ['step requires input', 'requires input', 'ask every time', 'continue generating'].some(word => containerText.includes(word));

            if ((hasPauseSignal || hasControlPair || hasInputSignal) && clickElement(btn)) {
                log(`Flow resumed automatically: "${text}"`);
                return clickedCount;
            }
        }

        // Hard-disable broad generic auto-click fallback to prevent random IDE clicks.
        // Remaining logic already handles explicit command/permission/recovery prompts above.
        return clickedCount;

        // 2) Normal flow: accept/apply while avoiding negative actions
        if (isUserTyping()) {
            return clickedCount;
        }

        const acceptKeywords = [
            'accept',
            'accept all',
            'keep',
            'apply',
            'apply all',
            'always allow',
            'allow once',
            'continue',
            'retry',
            'proceed',
            'run command',
            'run in terminal'
        ];
        const negativeKeywords = ['deny', 'cancel', 'reject', 'block', 'stop', 'disable', 'never', 'discard', 'configure', 'setting', 'settings', 'policy', 'allowlist', 'manage'];
        const allButtons = allActionButtons;

        for (const btn of allButtons) {
            const actionText = getActionText(btn);
            if (!actionText) continue;

            if (isExcludedControl(btn, actionText)) {
                continue;
            }

            if (negativeKeywords.some(keyword => actionText.includes(keyword))) {
                continue;
            }

            const isScopedToPrompt = !!btn.closest('[role="dialog"], .notification-toast, .notification-list-item, .monaco-dialog-box, .monaco-dialog-modal-block, .chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]');
            if (!isScopedToPrompt) {
                continue;
            }

            const normalized = actionText.replace(/\s+/g, ' ').trim();
            const isAllowedAction = acceptKeywords.some(keyword => normalized === keyword || normalized.startsWith(`${keyword} `));

            if (isAllowedAction) {
                if (clickElement(btn)) {
                    log(`Clicked button: "${actionText}"`);
                }
            }
        }

        const checkIcons = promptContainers.flatMap(container => {
            try {
                return Array.from(container.querySelectorAll('.codicon-check, .codicon-check-all'));
            } catch (e) {
                return [];
            }
        });
        for (const icon of checkIcons) {
            const parent = icon.closest('button, [role="button"]');
            const t = getActionText(parent || icon);
            const safeCheckContext = t.includes('accept') || t.includes('apply') || t.includes('keep');
            if (parent && safeCheckContext && clickElement(parent)) {
                log('Clicked button com icone de check');
            }
        }

        return clickedCount;
    }

    // =================================================================
    // BACKGROUND MODE: OVERLAY E TABS
    // =================================================================

    const OVERLAY_ID = '__autoAcceptFreeOverlay';
    const STYLE_ID = '__autoAcceptFreeStyles';

    const OVERLAY_STYLES = `
        #${OVERLAY_ID} {
            position: fixed;
            background: rgba(0, 0, 0, 0.95);
            z-index: 2147483647;
            font-family: system-ui, -apple-system, sans-serif;
            color: #fff;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            overflow: hidden;
        }
        #${OVERLAY_ID}.visible { opacity: 1; }

        .aaf-container {
            width: 90%;
            max-width: 400px;
            padding: 20px;
        }

        .aaf-slot {
            margin-bottom: 12px;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .aaf-header {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            gap: 8px;
        }

        .aaf-name {
            flex: 1;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #e0e0e0;
        }

        .aaf-status {
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 3px;
        }

        .aaf-slot.in-progress .aaf-status {
            color: #a855f7;
            background: rgba(168, 85, 247, 0.15);
        }

        .aaf-slot.completed .aaf-status {
            color: #22c55e;
            background: rgba(34, 197, 94, 0.15);
        }

        .aaf-progress-track {
            height: 3px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
        }

        .aaf-progress-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.4s ease, background 0.3s ease;
        }

        .aaf-slot.in-progress .aaf-progress-fill {
            width: 60%;
            background: linear-gradient(90deg, #a855f7, #8b5cf6);
            animation: pulse-progress 1.5s ease-in-out infinite;
        }

        .aaf-slot.completed .aaf-progress-fill {
            width: 100%;
            background: linear-gradient(90deg, #22c55e, #16a34a);
        }

        @keyframes pulse-progress {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
    `;

    function mountOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;

        const ide = (window.__autoAcceptFreeState?.ide || '').toLowerCase();
        if (ide === 'antigravity') {
            log('Visual overlay disabled on Antigravity to prevent black-screen effects');
            return;
        }

        log('Mounting overlay...');

        // Position above side panel
        const panelSelectors = [
            '#workbench\\.parts\\.auxiliarybar',
            '#workbench\\.parts\\.sidebar',
            '.auxiliary-bar-container',
            '.sidebar'
        ];

        let panel = null;
        for (const selector of panelSelectors) {
            const found = queryAll(selector).find(p => p.offsetWidth > 50);
            if (found) {
                panel = found;
                break;
            }
        }

        if (!panel) {
            log('Side panel not found; overlay will not be shown');
            return;
        }

        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = OVERLAY_STYLES;
            document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        const container = document.createElement('div');
        container.className = 'aaf-container';
        container.id = OVERLAY_ID + '-c';

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        const syncPosition = () => {
            const rect = panel.getBoundingClientRect();
            overlay.style.top = rect.top + 'px';
            overlay.style.left = rect.left + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
        };

        syncPosition();

        const resizeObserver = new ResizeObserver(syncPosition);
        resizeObserver.observe(panel);
        overlay._resizeObserver = resizeObserver;

        requestAnimationFrame(() => overlay.classList.add('visible'));
        log('Overlay mounted');
    }

    function dismountOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;

        if (overlay._resizeObserver) {
            overlay._resizeObserver.disconnect();
        }
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
    }

    // =================================================================
    // BACKGROUND MODE: TABS
    // =================================================================

    const TAB_SELECTORS = [
        '#workbench\\.parts\\.auxiliarybar ul[role="tablist"] li[role="tab"]',
        '.monaco-pane-view .monaco-list-row[role="listitem"]',
        'div[role="tablist"] div[role="tab"]',
        '.chat-session-item',
        '.tab-item',
        '[role="tab"]'
    ];

    const NEW_CONVERSATION_SELECTOR = "[data-tooltip-id='new-conversation-tooltip'], button[title*='new'], button[aria-label*='new']";

    function stripTimeSuffix(text) {
        return (text || '').trim().replace(/\s*\d+[smh]$/, '').trim();
    }

    function deduplicateNames(names) {
        const counts = {};
        return names.map(name => {
            if (counts[name] === undefined) {
                counts[name] = 1;
                return name;
            } else {
                counts[name]++;
                return `${name} (${counts[name]})`;
            }
        });
    }

    async function backgroundTabLoop(sessionID, state) {
        // Disabled intentionally: tab-cycling/new-conversation clicks cause unsafe random UI actions.
        while (state.isRunning && state.sessionID === sessionID) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // =================================================================
    // STATE AND PUBLIC API
    // =================================================================

    if (!window.__autoAcceptFreeState) {
        window.__autoAcceptFreeState = {
            isRunning: false,
            sessionID: 0,
            clicks: 0,
            lastRunShortcutAt: 0,
            lastExpandClickAt: 0,
            lastPermissionClickAt: 0,
            lastPermissionX: 0,
            lastPermissionY: 0,
            lastObserverScanAt: 0,
            clickInterval: null,
            domObserver: null,
            mode: null,
            ide: null,
            tabNames: [],
            bannedCommands: []
        };
    }

    window.__autoAcceptGetStats = function() {
        return { 
            clicks: window.__autoAcceptFreeState.clicks || 0,
            tabCount: window.__autoAcceptFreeState.tabNames?.length || 0
        };
    };

    window.__autoAcceptStart = function(config) {
        const state = window.__autoAcceptFreeState;

        // Stop previous run if already running
        if (state.isRunning) {
            log('Already running, stopping current session first...');
            window.__autoAcceptStop();
        }

        state.isRunning = true;
        state.sessionID++;
        state.mode = 'simple';
        state.ide = (config.ide || 'vscode').toLowerCase();
        state.bannedCommands = config.bannedCommands || [];
        state.tabNames = [];
        state.lastRunShortcutAt = 0;
        state.lastExpandClickAt = 0;
        state.lastPermissionClickAt = 0;
        state.lastPermissionX = 0;
        state.lastPermissionY = 0;

        log(`Starting ${state.mode} mode for ${state.ide}...`);

        if (state.domObserver) {
            try {
                state.domObserver.disconnect();
            } catch (e) { }
            state.domObserver = null;
        }

        try {
            const observer = new MutationObserver(() => {
                if (!state.isRunning) return;
                const now = Date.now();
                if (now - (state.lastObserverScanAt || 0) < 120) return;
                state.lastObserverScanAt = now;
                const clicked = clickAcceptButtons();
                if (clicked > 0) {
                    state.clicks += clicked;
                }
            });

            observer.observe(document.documentElement || document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: false
            });
            state.domObserver = observer;
            log('DOM observer started');
        } catch (e) {
            log(`DOM observer unavailable: ${e.message}`);
        }

        // Always start click loop
        state.clickInterval = setInterval(() => {
            if (state.isRunning) {
                const clicked = clickAcceptButtons();
                if (clicked > 0) {
                    state.clicks += clicked;
                }
            }
        }, 300);

        log('Click loop started (300ms)');

        // If background mode was requested, tab cycling remains disabled for safety
        if (config.isBackgroundMode) {
            log('Background mode requested, but tab cycling remains disabled for safety.');
        }

        log('Running');
    };

    window.__autoAcceptStop = function() {
        const state = window.__autoAcceptFreeState;
        state.isRunning = false;

        if (state.clickInterval) {
            clearInterval(state.clickInterval);
            state.clickInterval = null;
        }

        if (state.domObserver) {
            try {
                state.domObserver.disconnect();
            } catch (e) { }
            state.domObserver = null;
        }

        dismountOverlay();
        log('Stopped');
    };

    window.__autoAcceptUpdateBannedCommands = function(commands) {
        if (window.__autoAcceptFreeState) {
            window.__autoAcceptFreeState.bannedCommands = commands || [];
        }
    };

    log('Ready');
})();


