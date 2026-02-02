// AI Context Keeper - Main Extension Entry Point

import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerChatParticipant } from './chatParticipant';
import { createStatusBar, updateStatusBar } from './statusBar';
import { hasContext } from './contextManager';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('AI Context Keeper is now active');

  // Register commands
  registerCommands(context);

  // Register chat participant (@context)
  const chatParticipant = registerChatParticipant(context);
  context.subscriptions.push(chatParticipant);

  // Create status bar
  createStatusBar(context);

  // Watch for context file changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.vscode/ai-context*.json'
  );
  watcher.onDidChange(() => updateStatusBar());
  watcher.onDidCreate(() => updateStatusBar());
  watcher.onDidDelete(() => updateStatusBar());
  context.subscriptions.push(watcher);

  // Check if context exists and prompt if not
  promptInitializeIfNeeded();
}

/**
 * Check if workspace has context and prompt to initialize if not
 */
async function promptInitializeIfNeeded(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const contextExists = await hasContext(workspaceFolder);
  
  if (!contextExists) {
    // Wait a bit before prompting to not interrupt startup
    setTimeout(async () => {
      const action = await vscode.window.showInformationMessage(
        'AI Context Keeper: No context found for this project. Initialize?',
        'Initialize',
        'Later'
      );
      
      if (action === 'Initialize') {
        vscode.commands.executeCommand('aiContext.initialize');
      }
    }, 3000);
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log('AI Context Keeper deactivated');
}
