
const vscode = require('vscode');

let autoAcceptInterval = null;
let enabled = true;
let statusBarItem;

function activate(context) {
    // Register toggle command
    let disposable = vscode.commands.registerCommand('unlimited.toggle', function () {
        enabled = !enabled;
        updateStatusBar();
        if (enabled) {
            vscode.window.showInformationMessage('Auto-Accept: ON ✅');
        } else {
            vscode.window.showInformationMessage('Auto-Accept: OFF 🛑');
        }
    });
    context.subscriptions.push(disposable);

    try {
        // Create Right Item (High Priority)
        // Alignment Right, Priority 10000 ensures it is the first/left-most item in the Right block
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
        statusBarItem.command = 'unlimited.toggle';
        context.subscriptions.push(statusBarItem);

        updateStatusBar();
        statusBarItem.show();
    } catch (e) {
        // Silent failure in production to avoid harassing user
    }

    // Start the loop
    startLoop();
}

function updateStatusBar() {
    if (!statusBarItem) return;

    if (enabled) {
        statusBarItem.text = "✅ Auto-Accept: ON";
        statusBarItem.tooltip = "Unlimited Auto-Accept is Executing (Click to Pause)";
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = "🛑 Auto-Accept: OFF";
        statusBarItem.tooltip = "Unlimited Auto-Accept is Paused (Click to Resume)";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}

function startLoop() {
    autoAcceptInterval = setInterval(async () => {
        if (!enabled) return;
        try {
            await vscode.commands.executeCommand('antigravity.agent.acceptAgentStep');
        } catch (e) { }
        try {
            await vscode.commands.executeCommand('antigravity.terminal.accept');
        } catch (e) { }
    }, 500);
}

function deactivate() {
    if (autoAcceptInterval) {
        clearInterval(autoAcceptInterval);
    }
}

module.exports = {
    activate,
    deactivate
}
