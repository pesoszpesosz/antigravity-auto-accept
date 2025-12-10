
# How to Publish "Antigravity Auto Accept"

Since PowerShell script execution is restricted on your system, please follow these steps to package and publish the extension manually.

## 1. Open Command Prompt (CMD)
Do not use PowerShell. Press `Win + R`, type `cmd`, and press Enter.

## 2. Navigate to the Extension Folder
Run this command:
```cmd
cd "C:\Users\matth\Desktop\auto_approval2\unlimited_approver"
```

## 3. Package the Extension
Run these commands to install the packager and create the file:
```cmd
npm install -g @vscode/vsce
npx vsce package
```
*   If asked about missing `repository` field, type `y` to continue.
*   This will create a file named `antigravity-auto-accept-1.0.1.vsix`.

## 4. Publish to Marketplace
You have two options:

### Option A: Web Upload (Easiest)
1.  Go to [marketplace.visualstudio.com](https://marketplace.visualstudio.com/manage).
2.  Login with your Microsoft account.
3.  Click **"New Extension"** -> **"Visual Studio Code"**.
4.  Upload the `.vsix` file you just created.

### Option B: Command Line (Advanced)
1.  Get a Personal Access Token (PAT) from Azure DevOps.
2.  Run:
    ```cmd
    npx vsce publish -p <YOUR_TOKEN>
    ```

## 5. Metadata Check
Before publishing, you may want to edit `package.json` to add your real name/publisher ID:
*   Change `"publisher": "gemini"` to your actual Marketplace Publisher ID.
*   Change `"repository"` to your GitHub URL (optional).
