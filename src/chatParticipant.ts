// Chat Participant - @context integration with Copilot

import * as vscode from 'vscode';
import {
  loadFullContext,
  calculateTokenBudget,
  formatContextForInjection,
  addToMemory,
  removeFromMemory,
  saveCheckpoint,
  updateCurrentWork,
  hasContext,
} from './contextManager';

const PARTICIPANT_ID = 'ai-context-keeper.context';

interface ChatResult extends vscode.ChatResult {
  metadata?: {
    command?: string;
  };
}

/**
 * Register the @context chat participant
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<ChatResult> => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      stream.markdown('⚠️ No workspace folder open. Please open a folder first.');
      return { metadata: { command: '' } };
    }

    // Handle slash commands
    if (request.command) {
      return await handleCommand(request, stream, workspaceFolder);
    }

    // Regular message - inject context and forward to model
    return await handleChatWithContext(request, chatContext, stream, token, workspaceFolder);
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('brain');

  return participant;
}

/**
 * Handle slash commands
 */
async function handleCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ChatResult> {
  switch (request.command) {
    case 'status':
      return await handleStatusCommand(stream, workspaceFolder);

    case 'remember':
      return await handleRememberCommand(request.prompt, stream, workspaceFolder);

    case 'forget':
      return await handleForgetCommand(request.prompt, stream, workspaceFolder);

    case 'checkpoint':
      return await handleCheckpointCommand(request.prompt, stream, workspaceFolder);

    default:
      stream.markdown(`Unknown command: ${request.command}`);
      return { metadata: { command: request.command } };
  }
}

/**
 * /status - Show current context status
 */
async function handleStatusCommand(
  stream: vscode.ChatResponseStream,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ChatResult> {
  const fullContext = await loadFullContext(workspaceFolder);

  if (!fullContext) {
    stream.markdown('❌ **No context found**\n\nRun `AI Context: Initialize` command to set up context for this project.');
    return { metadata: { command: 'status' } };
  }

  const { project, local } = fullContext;

  stream.markdown(`## 📋 Context Status\n\n`);
  stream.markdown(`**Project:** ${project.project.name}\n`);
  
  if (project.project.description) {
    stream.markdown(`**Description:** ${project.project.description}\n`);
  }
  
  if (project.project.stack.length > 0) {
    stream.markdown(`**Stack:** ${project.project.stack.join(', ')}\n`);
  }

  stream.markdown(`\n### Current Work\n`);
  if (local.currentWork.activeTask) {
    stream.markdown(`**Active Task:** ${local.currentWork.activeTask}\n`);
  } else {
    stream.markdown(`_No active task set_\n`);
  }

  if (local.memory.length > 0) {
    stream.markdown(`\n### Memory (${local.memory.length} items)\n`);
    local.memory.slice(-5).forEach(m => stream.markdown(`- ${m}\n`));
    if (local.memory.length > 5) {
      stream.markdown(`_...and ${local.memory.length - 5} more_\n`);
    }
  }

  if (local.checkpoints.length > 0) {
    stream.markdown(`\n### Recent Checkpoints\n`);
    local.checkpoints.slice(-3).forEach(cp => {
      stream.markdown(`- **${cp.name}** (${new Date(cp.date).toLocaleDateString()})\n`);
    });
  }

  stream.markdown(`\n_Last updated: ${new Date(local.lastUpdated).toLocaleString()}_`);

  return { metadata: { command: 'status' } };
}

/**
 * /remember - Add to memory
 */
async function handleRememberCommand(
  prompt: string,
  stream: vscode.ChatResponseStream,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ChatResult> {
  if (!prompt.trim()) {
    stream.markdown('⚠️ Please provide something to remember.\n\nExample: `/remember User prefers TypeScript over JavaScript`');
    return { metadata: { command: 'remember' } };
  }

  try {
    await addToMemory(workspaceFolder, prompt.trim());
    stream.markdown(`✅ **Remembered:** "${prompt.trim()}"`);
  } catch (error) {
    stream.markdown(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { metadata: { command: 'remember' } };
}

/**
 * /forget - Remove from memory
 */
async function handleForgetCommand(
  prompt: string,
  stream: vscode.ChatResponseStream,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ChatResult> {
  if (!prompt.trim()) {
    stream.markdown('⚠️ Please provide a search term to forget.\n\nExample: `/forget TypeScript`');
    return { metadata: { command: 'forget' } };
  }

  const removed = await removeFromMemory(workspaceFolder, prompt.trim());
  
  if (removed) {
    stream.markdown(`✅ **Removed** memory item containing "${prompt.trim()}"`);
  } else {
    stream.markdown(`⚠️ No memory item found containing "${prompt.trim()}"`);
  }

  return { metadata: { command: 'forget' } };
}

/**
 * /checkpoint - Save a checkpoint
 */
async function handleCheckpointCommand(
  prompt: string,
  stream: vscode.ChatResponseStream,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ChatResult> {
  const parts = prompt.trim().split(/\s+/);
  const name = parts[0] || `checkpoint-${Date.now()}`;
  const summary = parts.slice(1).join(' ') || 'No description';

  try {
    await saveCheckpoint(workspaceFolder, name, summary);
    stream.markdown(`✅ **Checkpoint saved:** ${name}\n\n_${summary}_`);
  } catch (error) {
    stream.markdown(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { metadata: { command: 'checkpoint' } };
}

/**
 * Handle regular chat with context injection
 */
async function handleChatWithContext(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ChatResult> {
  // Load context
  const fullContext = await loadFullContext(workspaceFolder);

  // Build messages
  const messages: vscode.LanguageModelChatMessage[] = [];

  // Inject context if available
  if (fullContext) {
    const budget = calculateTokenBudget();
    const contextText = formatContextForInjection(fullContext, budget);

    if (contextText) {
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `[PROJECT CONTEXT - Use this information to provide better assistance]\n\n${contextText}\n\n---\n\n`
        )
      );
    }
  }

  // Add conversation history from this session
  for (const turn of chatContext.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      // Extract text from response
      let responseText = '';
      for (const part of turn.response) {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          responseText += part.value.value;
        }
      }
      if (responseText) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
      }
    }
  }

  // Add current user message
  messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

  // Select model and send request
  try {
    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-4o',
    });

    if (models.length === 0) {
      stream.markdown('⚠️ No language model available. Please ensure GitHub Copilot is installed and signed in.');
      return {};
    }

    const model = models[0];
    const response = await model.sendRequest(messages, {}, token);

    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch (error) {
    if (error instanceof vscode.LanguageModelError) {
      stream.markdown(`❌ Model error: ${error.message}`);
    } else {
      throw error;
    }
  }

  return {};
}
