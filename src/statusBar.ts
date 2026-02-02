// Status Bar - Shows context status in VS Code status bar

import * as vscode from 'vscode';
import { hasContext, loadFullContext } from './contextManager';

let statusBarItem: vscode.StatusBarItem;

/**
 * Create and register the status bar item
 */
export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarItem.command = 'aiContext.showStatus';
  context.subscriptions.push(statusBarItem);

  // Update on workspace change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBar())
  );

  // Initial update
  updateStatusBar();

  return statusBarItem;
}

/**
 * Update status bar based on current context state
 */
export async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) return;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  
  if (!workspaceFolder) {
    statusBarItem.hide();
    return;
  }

  const contextExists = await hasContext(workspaceFolder);

  if (!contextExists) {
    statusBarItem.text = '$(brain) No Context';
    statusBarItem.tooltip = 'Click to initialize AI context for this project';
    statusBarItem.backgroundColor = undefined;
  } else {
    const fullContext = await loadFullContext(workspaceFolder);
    
    if (fullContext) {
      const memoryCount = fullContext.local.memory.length;
      const activeTask = fullContext.local.currentWork.activeTask;

      statusBarItem.text = `$(brain) ${fullContext.project.project.name}`;
      
      const tooltipLines = [
        `**AI Context Active**`,
        `Project: ${fullContext.project.project.name}`,
        fullContext.project.project.stack.length > 0 
          ? `Stack: ${fullContext.project.project.stack.join(', ')}`
          : null,
        activeTask ? `\n🎯 Active: ${activeTask}` : null,
        `\n💾 Memory: ${memoryCount} items`,
        `\nClick for details`,
      ].filter(Boolean);

      statusBarItem.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = '$(brain) Context Error';
      statusBarItem.tooltip = 'Error loading context - click to reinitialize';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  statusBarItem.show();
}

/**
 * Show context active indicator temporarily
 */
export function flashContextActive(): void {
  if (!statusBarItem) return;

  const originalText = statusBarItem.text;
  statusBarItem.text = '$(brain) Context Injected';
  
  setTimeout(() => {
    statusBarItem.text = originalText;
  }, 2000);
}
