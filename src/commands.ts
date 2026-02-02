// VS Code Commands for AI Context Keeper

import * as vscode from 'vscode';
import {
  loadFullContext,
  loadProjectContext,
  loadLocalContext,
  saveProjectContext,
  saveLocalContext,
  createDefaultProjectContext,
  createDefaultLocalContext,
  addToMemory,
  hasContext,
  getContextPaths,
} from './contextManager';
import { analyzeWorkspace, createContextFromDetection } from './autoAnalyzer';

/**
 * Register all extension commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiContext.initialize', initializeCommand),
    vscode.commands.registerCommand('aiContext.update', updateCommand),
    vscode.commands.registerCommand('aiContext.edit', editCommand),
    vscode.commands.registerCommand('aiContext.remember', rememberCommand),
    vscode.commands.registerCommand('aiContext.clear', clearCommand),
    vscode.commands.registerCommand('aiContext.showStatus', showStatusCommand)
  );
}

/**
 * Initialize context for current workspace
 */
async function initializeCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  // Check if context already exists
  if (await hasContext(workspaceFolder)) {
    const overwrite = await vscode.window.showWarningMessage(
      'Context already exists for this project. Overwrite?',
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing project...',
      cancellable: false,
    },
    async () => {
      // Auto-detect project info
      const detected = await analyzeWorkspace(workspaceFolder);

      // Create context from detection
      const projectContext = createContextFromDetection(detected);

      // Let user customize before saving
      const name = await vscode.window.showInputBox({
        prompt: 'Project name',
        value: projectContext.project.name,
      });

      if (!name) return; // Cancelled

      projectContext.project.name = name;

      const description = await vscode.window.showInputBox({
        prompt: 'Project description (what does this project do?)',
        value: projectContext.project.description,
      });

      if (description !== undefined) {
        projectContext.project.description = description;
      }

      // Save project context
      await saveProjectContext(workspaceFolder, projectContext);

      // Create and save local context
      const localContext = createDefaultLocalContext(projectContext.projectId);
      await saveLocalContext(workspaceFolder, localContext);

      vscode.window.showInformationMessage(
        `✅ Context initialized for ${name}`,
        'Edit Context'
      ).then((action) => {
        if (action === 'Edit Context') {
          editCommand();
        }
      });
    }
  );
}

/**
 * Update context summary
 */
async function updateCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const fullContext = await loadFullContext(workspaceFolder);
  if (!fullContext) {
    const initialize = await vscode.window.showWarningMessage(
      'No context found. Initialize first?',
      'Initialize'
    );
    if (initialize === 'Initialize') {
      await initializeCommand();
    }
    return;
  }

  // Update active task
  const activeTask = await vscode.window.showInputBox({
    prompt: 'What are you currently working on?',
    value: fullContext.local.currentWork.activeTask || '',
  });

  if (activeTask !== undefined) {
    fullContext.local.currentWork.activeTask = activeTask;
  }

  // Update key points from this session
  const keyPoint = await vscode.window.showInputBox({
    prompt: 'Any key points to remember from this session? (optional)',
  });

  if (keyPoint) {
    fullContext.local.conversationSummary.keyPoints.push(keyPoint);
    // Keep last 10
    if (fullContext.local.conversationSummary.keyPoints.length > 10) {
      fullContext.local.conversationSummary.keyPoints = 
        fullContext.local.conversationSummary.keyPoints.slice(-10);
    }
  }

  fullContext.local.conversationSummary.lastSession = new Date().toISOString();

  await saveLocalContext(workspaceFolder, fullContext.local);
  vscode.window.showInformationMessage('✅ Context updated');
}

/**
 * Open context file for editing
 */
async function editCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const paths = getContextPaths(workspaceFolder);

  const choice = await vscode.window.showQuickPick(
    [
      {
        label: '$(globe) Project Context',
        description: 'Shared team context (committed to git)',
        path: paths.projectContext,
      },
      {
        label: '$(person) Local Context',
        description: 'Personal context (gitignored)',
        path: paths.localContext,
      },
    ],
    { placeHolder: 'Which context file to edit?' }
  );

  if (!choice) return;

  try {
    const doc = await vscode.workspace.openTextDocument(choice.path);
    await vscode.window.showTextDocument(doc);
  } catch {
    vscode.window.showErrorMessage(
      'Context file not found. Run "AI Context: Initialize" first.'
    );
  }
}

/**
 * Remember something
 */
async function rememberCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const item = await vscode.window.showInputBox({
    prompt: 'What should I remember?',
    placeHolder: 'e.g., User prefers functional components over class components',
  });

  if (!item) return;

  try {
    await addToMemory(workspaceFolder, item);
    vscode.window.showInformationMessage(`✅ Remembered: "${item}"`);
  } catch (error) {
    vscode.window.showErrorMessage(
      error instanceof Error ? error.message : 'Failed to save memory'
    );
  }
}

/**
 * Clear conversation history
 */
async function clearCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const local = await loadLocalContext(workspaceFolder);
  if (!local) {
    vscode.window.showErrorMessage('No context found');
    return;
  }

  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Clear conversation history only', value: 'history' },
      { label: 'Clear memory only', value: 'memory' },
      { label: 'Clear all local context', value: 'all' },
    ],
    { placeHolder: 'What to clear?' }
  );

  if (!choice) return;

  switch (choice.value) {
    case 'history':
      local.conversationSummary = {
        lastSession: new Date().toISOString(),
        keyPoints: [],
        pendingQuestions: [],
      };
      break;
    case 'memory':
      local.memory = [];
      break;
    case 'all':
      local.conversationSummary = {
        lastSession: new Date().toISOString(),
        keyPoints: [],
        pendingQuestions: [],
      };
      local.memory = [];
      local.currentWork = {};
      local.checkpoints = [];
      break;
  }

  await saveLocalContext(workspaceFolder, local);
  vscode.window.showInformationMessage('✅ Context cleared');
}

/**
 * Show context status
 */
async function showStatusCommand(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const fullContext = await loadFullContext(workspaceFolder);
  if (!fullContext) {
    vscode.window.showInformationMessage(
      'No context found. Run "AI Context: Initialize" to set up.',
      'Initialize'
    ).then((action) => {
      if (action === 'Initialize') {
        initializeCommand();
      }
    });
    return;
  }

  const { project, local } = fullContext;

  const items = [
    `📦 **${project.project.name}**`,
    project.project.description ? `📝 ${project.project.description}` : null,
    project.project.stack.length > 0 ? `🛠️ ${project.project.stack.join(', ')}` : null,
    local.currentWork.activeTask ? `🎯 Working on: ${local.currentWork.activeTask}` : null,
    `💾 Memory: ${local.memory.length} items`,
    `📍 Checkpoints: ${local.checkpoints.length}`,
    `🕐 Last updated: ${new Date(local.lastUpdated).toLocaleString()}`,
  ].filter(Boolean);

  vscode.window.showInformationMessage(items.join('\n'), 'Edit Context').then((action) => {
    if (action === 'Edit Context') {
      editCommand();
    }
  });
}
