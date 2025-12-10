
# Publishing to Open VSX Registry

Antigravity uses the **Open VSX Registry** (open-vsx.org) instead of the Microsoft Marketplace.

## 1. Create a Namespace
1.  Go to [open-vsx.org](https://open-vsx.org).
2.  Log in with your GitHub account.
3.  Go to **Settings** -> **Namespaces**.
4.  Click **Create New Namespace**.
    *   *Example*: If your username is `matth`, create a namespace called `matth`.

## 2. Update Extension Files (CRITICAL)
Your `package.json` **MUST** match your Open VSX namespace.
1.  Open `package.json` in the extension folder.
2.  Find the line: `"publisher": "gemini"`
3.  Change `"gemini"` to your **actual namespace** (e.g., `"matth"`).
4.  Save the file.

## 3. Repackage the Extension
You must create a new `.vsix` file with the correct publisher name.
Open Command Prompt (`cmd`) and run:
```cmd
cd "C:\Users\matth\Desktop\auto_approval2\unlimited_approver"
npx vsce package
```
*   This will create a new file, e.g., `matth.antigravity-auto-accept-1.0.1.vsix`.

## 4. Upload to Open VSX
1.  Go to the [Publish Extension page](https://open-vsx.org/extension/settings).
2.  Or click your profile icon -> **Publish Extension**.
3.  Drag and drop your **new** `.vsix` file.
4.  Click **Publish**.

It will take a few minutes to process, and then it will be available in the Antigravity Extensions view!
