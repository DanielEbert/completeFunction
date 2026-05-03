import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "opencode.completeFunction",
    () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const document = editor.document;
      const position = editor.selection.active;
      const lineText = document.lineAt(position.line).text.trim();

      if (!lineText) {
        vscode.window.showWarningMessage(
          "The current line is empty. Please place your cursor on a function signature.",
        );
        return;
      }

      const filePath = vscode.workspace.asRelativePath(document.uri);
      const lineNumber = position.line + 1;

      const message = `File: ${filePath}, Line: ${lineNumber}, Content: ${lineText}`;

      const escapedMessage = message.replace(/"/g, '\\"');

      const modelString = "google/gemini-3.1-pro-preview";
      const command = `opencode run --agent implement --model ${modelString} "${escapedMessage}"`;

      const terminal = vscode.window.createTerminal(`OpenCode: Implement`);
      terminal.show();
      terminal.sendText(command);
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
