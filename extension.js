const vscode = require('vscode');

let isEnabled = true;
let autoAcceptTask = null;
let statusBarIndicator;

function activate(context) {
    let toggleAction = vscode.commands.registerCommand('unlimited.toggle', function () {
        isEnabled = !isEnabled;
        updateStatusBar();
        if (isEnabled) {
            vscode.window.showInformationMessage('Auto-Accept: ON ✅');
            executeAutoAccept();
        } else {
            vscode.window.showInformationMessage('Auto-Accept: OFF 🛑');
            if (autoAcceptTask) {
                clearTimeout(autoAcceptTask);
                autoAcceptTask = null;
            }
        }
    });
    context.subscriptions.push(toggleAction);

    try {
        statusBarIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
        statusBarIndicator.command = 'unlimited.toggle';
        context.subscriptions.push(statusBarIndicator);
        updateStatusBar();
        statusBarIndicator.show();
    } catch (error) {}

    executeAutoAccept();
}

function updateStatusBar() {
    if (!statusBarIndicator) return;

    if (isEnabled) {
        statusBarIndicator.text = "✅ Auto-Accept: ON";
        statusBarIndicator.tooltip = "Unlimited Auto-Accept is Executing";
        statusBarIndicator.backgroundColor = undefined;
    } else {
        statusBarIndicator.text = "🛑 Auto-Accept: OFF";
        statusBarIndicator.tooltip = "Unlimited Auto-Accept is Paused";
        statusBarIndicator.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}

async function executeAutoAccept() {
    if (!isEnabled) return;

    try {
        await vscode.commands.executeCommand('antigravity.agent.acceptAgentStep');
        await vscode.commands.executeCommand('antigravity.terminalCommand.accept');
        await vscode.commands.executeCommand('antigravity.terminal.accept');
        await vscode.commands.executeCommand('antigravity.prioritized.agentAcceptFocusedHunk');
    } catch (error) {}

    autoAcceptTask = setTimeout(executeAutoAccept, 500);
}

function deactivate() {
    if (autoAcceptTask) {
        clearTimeout(autoAcceptTask);
    }
}

module.exports = {
    activate,
    deactivate
};