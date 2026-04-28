import * as vscode from 'vscode';
import { jsonToZod } from './engine';

export function activate(context: vscode.ExtensionContext) {
    console.log('Zodify JSON is now active!');

    let disposable = vscode.commands.registerCommand('zodify-json.pasteAsZod', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Zodify JSON: No active editor found.');
            return;
        }

        // 1. Read Clipboard
        const clipboardText = await vscode.env.clipboard.readText();
        if (!clipboardText) {
            vscode.window.showErrorMessage('Zodify JSON: Clipboard is empty.');
            return;
        }

        // 2. Validate JSON
        try {
            JSON.parse(clipboardText);
        } catch (e) {
            vscode.window.showErrorMessage('Zodify JSON: Clipboard content is not valid JSON.');
            return;
        }

        // 3. Prompt for Root Schema Name
        const rootName = await vscode.window.showInputBox({
            prompt: 'Enter the name for the root Zod schema',
            value: 'RootSchema',
            validateInput: (text) => {
                if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text)) {
                    return 'Must be a valid JavaScript identifier (no spaces, cannot start with a number)';
                }
                return null;
            }
        });

        if (!rootName) {
            // User cancelled
            return;
        }

        // 4. Generate Zod Code
        let generatedCode = '';
        try {
            const config = vscode.workspace.getConfiguration('zodify-json');
            const options = {
                generateTypes: config.get<boolean>('generateTypes', true),
                useUnknown: config.get<boolean>('useUnknown', true)
            };
            generatedCode = jsonToZod(clipboardText, rootName, options);
        } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage('Zodify JSON: Failed to generate schema from JSON.');
            return;
        }

        // 5. Insert Code at Cursor
        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, generatedCode);
        });

        // 6. Format the inserted text
        // We select the newly inserted text first to ensure only our insertion is formatted
        const endPosition = editor.document.positionAt(
            editor.document.offsetAt(position) + generatedCode.length
        );
        editor.selection = new vscode.Selection(position, endPosition);
        
        await vscode.commands.executeCommand('editor.action.formatSelection');
        
        // Clear selection to leave cursor at end
        editor.selection = new vscode.Selection(endPosition, endPosition);
        vscode.window.showInformationMessage(`Successfully Zodified as ${rootName}!`);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    // Clean up resources if needed
}
