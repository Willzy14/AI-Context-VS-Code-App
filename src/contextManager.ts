// Context Manager - Load, save, and manage AI context with token budgeting

import * as vscode from 'vscode';
import * as path from 'path';
import {
  ProjectContext,
  LocalContext,
  FullContext,
  ContextPaths,
  TokenBudget,
} from './types';

const PROJECT_CONTEXT_FILE = 'ai-context.json';
const LOCAL_CONTEXT_FILE = 'ai-context.local.json';
const GITIGNORE_ENTRY = '\n# AI Context Keeper - personal context\n.vscode/ai-context.local.json\n';

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token budget
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 20) + '\n... [truncated]';
}

/**
 * Get context file paths for a workspace
 */
export function getContextPaths(workspaceFolder: vscode.WorkspaceFolder): ContextPaths {
  const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
  return {
    projectContext: path.join(vscodeDir, PROJECT_CONTEXT_FILE),
    localContext: path.join(vscodeDir, LOCAL_CONTEXT_FILE),
  };
}

/**
 * Generate a unique project ID
 */
function generateProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create default project context
 */
export function createDefaultProjectContext(name: string): ProjectContext {
  return {
    version: '1.0',
    projectId: generateProjectId(),
    lastUpdated: new Date().toISOString(),
    project: {
      name,
      description: '',
      stack: [],
    },
    architecture: {
      overview: '',
      keyPaths: {},
    },
    conventions: {},
    decisions: [],
  };
}

/**
 * Create default local context
 */
export function createDefaultLocalContext(projectId: string): LocalContext {
  return {
    version: '1.0',
    projectId,
    lastUpdated: new Date().toISOString(),
    currentWork: {},
    memory: [],
    conversationSummary: {
      lastSession: new Date().toISOString(),
      keyPoints: [],
      pendingQuestions: [],
    },
    checkpoints: [],
  };
}

/**
 * Load project context from file
 */
export async function loadProjectContext(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<ProjectContext | null> {
  const paths = getContextPaths(workspaceFolder);
  const uri = vscode.Uri.file(paths.projectContext);

  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(content.toString()) as ProjectContext;
  } catch {
    return null;
  }
}

/**
 * Load local context from file
 */
export async function loadLocalContext(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<LocalContext | null> {
  const paths = getContextPaths(workspaceFolder);
  const uri = vscode.Uri.file(paths.localContext);

  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(content.toString()) as LocalContext;
  } catch {
    return null;
  }
}

/**
 * Load full context (both project and local)
 */
export async function loadFullContext(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<FullContext | null> {
  const project = await loadProjectContext(workspaceFolder);
  if (!project) return null;

  let local = await loadLocalContext(workspaceFolder);
  if (!local) {
    // Create default local context if project exists but local doesn't
    local = createDefaultLocalContext(project.projectId);
    await saveLocalContext(workspaceFolder, local);
  }

  return { project, local };
}

/**
 * Save project context to file
 */
export async function saveProjectContext(
  workspaceFolder: vscode.WorkspaceFolder,
  context: ProjectContext
): Promise<void> {
  const paths = getContextPaths(workspaceFolder);
  const vscodeDir = vscode.Uri.file(path.dirname(paths.projectContext));

  // Ensure .vscode directory exists
  try {
    await vscode.workspace.fs.createDirectory(vscodeDir);
  } catch {
    // Directory may already exist
  }

  context.lastUpdated = new Date().toISOString();
  const uri = vscode.Uri.file(paths.projectContext);
  const content = Buffer.from(JSON.stringify(context, null, 2));
  await vscode.workspace.fs.writeFile(uri, content);
}

/**
 * Save local context to file
 */
export async function saveLocalContext(
  workspaceFolder: vscode.WorkspaceFolder,
  context: LocalContext
): Promise<void> {
  const paths = getContextPaths(workspaceFolder);
  const vscodeDir = vscode.Uri.file(path.dirname(paths.localContext));

  // Ensure .vscode directory exists
  try {
    await vscode.workspace.fs.createDirectory(vscodeDir);
  } catch {
    // Directory may already exist
  }

  context.lastUpdated = new Date().toISOString();
  const uri = vscode.Uri.file(paths.localContext);
  const content = Buffer.from(JSON.stringify(context, null, 2));
  await vscode.workspace.fs.writeFile(uri, content);

  // Ensure local context is gitignored
  await ensureGitignore(workspaceFolder);
}

/**
 * Ensure local context file is in .gitignore
 */
async function ensureGitignore(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
  const uri = vscode.Uri.file(gitignorePath);

  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const text = content.toString();

    if (!text.includes(LOCAL_CONTEXT_FILE)) {
      const newContent = text + GITIGNORE_ENTRY;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent));
    }
  } catch {
    // .gitignore doesn't exist, create it
    await vscode.workspace.fs.writeFile(uri, Buffer.from(GITIGNORE_ENTRY.trim()));
  }
}

/**
 * Calculate token budget based on settings
 */
export function calculateTokenBudget(): TokenBudget {
  const config = vscode.workspace.getConfiguration('aiContext');
  const total = config.get<number>('maxTokens', 4000);

  // Allocate tokens proportionally
  return {
    total,
    project: Math.floor(total * 0.15),      // 15% - project basics
    architecture: Math.floor(total * 0.25), // 25% - architecture
    currentWork: Math.floor(total * 0.30),  // 30% - current work
    memory: Math.floor(total * 0.15),       // 15% - memory
    history: Math.floor(total * 0.15),      // 15% - history
  };
}

/**
 * Format context for injection into chat
 * Respects token budget and prioritizes most relevant info
 */
export function formatContextForInjection(
  context: FullContext,
  budget: TokenBudget
): string {
  const sections: string[] = [];

  // Project basics (highest priority)
  const projectSection = formatProjectSection(context.project, budget.project);
  if (projectSection) sections.push(projectSection);

  // Current work (high priority)
  const workSection = formatCurrentWorkSection(context.local, budget.currentWork);
  if (workSection) sections.push(workSection);

  // Architecture
  const archSection = formatArchitectureSection(context.project, budget.architecture);
  if (archSection) sections.push(archSection);

  // Memory items
  const memorySection = formatMemorySection(context.local, budget.memory);
  if (memorySection) sections.push(memorySection);

  // Conversation history
  const historySection = formatHistorySection(context.local, budget.history);
  if (historySection) sections.push(historySection);

  const fullContext = sections.join('\n\n');
  
  // Final check against total budget
  return truncateToTokens(fullContext, budget.total);
}

function formatProjectSection(project: ProjectContext, maxTokens: number): string {
  const lines = [
    '## Project Context',
    `**Project:** ${project.project.name}`,
  ];

  if (project.project.description) {
    lines.push(`**Description:** ${project.project.description}`);
  }

  if (project.project.stack.length > 0) {
    lines.push(`**Stack:** ${project.project.stack.join(', ')}`);
  }

  return truncateToTokens(lines.join('\n'), maxTokens);
}

function formatCurrentWorkSection(local: LocalContext, maxTokens: number): string {
  const lines = ['## Current Work'];

  if (local.currentWork.activeTask) {
    lines.push(`**Active Task:** ${local.currentWork.activeTask}`);
  }

  if (local.currentWork.blockers?.length) {
    lines.push(`**Blockers:** ${local.currentWork.blockers.join('; ')}`);
  }

  if (local.currentWork.recentChanges?.length) {
    lines.push(`**Recent Changes:**`);
    local.currentWork.recentChanges.slice(-5).forEach(c => lines.push(`- ${c}`));
  }

  if (local.currentWork.nextSteps?.length) {
    lines.push(`**Next Steps:**`);
    local.currentWork.nextSteps.forEach(s => lines.push(`- ${s}`));
  }

  if (lines.length === 1) return ''; // No current work info
  return truncateToTokens(lines.join('\n'), maxTokens);
}

function formatArchitectureSection(project: ProjectContext, maxTokens: number): string {
  const lines = ['## Architecture'];

  if (project.architecture.overview) {
    lines.push(project.architecture.overview);
  }

  const keyPaths = Object.entries(project.architecture.keyPaths);
  if (keyPaths.length > 0) {
    lines.push('\n**Key Files:**');
    keyPaths.slice(0, 10).forEach(([path, desc]) => {
      lines.push(`- \`${path}\`: ${desc}`);
    });
  }

  if (lines.length === 1) return '';
  return truncateToTokens(lines.join('\n'), maxTokens);
}

function formatMemorySection(local: LocalContext, maxTokens: number): string {
  if (local.memory.length === 0) return '';

  const lines = ['## Remember'];
  // Most recent memories first
  local.memory.slice(-10).forEach(m => lines.push(`- ${m}`));

  return truncateToTokens(lines.join('\n'), maxTokens);
}

function formatHistorySection(local: LocalContext, maxTokens: number): string {
  const summary = local.conversationSummary;
  if (summary.keyPoints.length === 0 && summary.pendingQuestions.length === 0) {
    return '';
  }

  const lines = ['## Previous Session'];

  if (summary.keyPoints.length > 0) {
    lines.push('**Key Points:**');
    summary.keyPoints.slice(-5).forEach(p => lines.push(`- ${p}`));
  }

  if (summary.pendingQuestions.length > 0) {
    lines.push('**Pending Questions:**');
    summary.pendingQuestions.forEach(q => lines.push(`- ${q}`));
  }

  return truncateToTokens(lines.join('\n'), maxTokens);
}

/**
 * Add item to memory
 */
export async function addToMemory(
  workspaceFolder: vscode.WorkspaceFolder,
  item: string
): Promise<void> {
  let local = await loadLocalContext(workspaceFolder);
  const project = await loadProjectContext(workspaceFolder);

  if (!project) {
    throw new Error('No project context found. Run "AI Context: Initialize" first.');
  }

  if (!local) {
    local = createDefaultLocalContext(project.projectId);
  }

  // Prevent duplicates
  if (!local.memory.includes(item)) {
    local.memory.push(item);
    // Keep memory manageable
    if (local.memory.length > 50) {
      local.memory = local.memory.slice(-50);
    }
  }

  await saveLocalContext(workspaceFolder, local);
}

/**
 * Remove item from memory
 */
export async function removeFromMemory(
  workspaceFolder: vscode.WorkspaceFolder,
  searchTerm: string
): Promise<boolean> {
  const local = await loadLocalContext(workspaceFolder);
  if (!local) return false;

  const lowerSearch = searchTerm.toLowerCase();
  const index = local.memory.findIndex(m => m.toLowerCase().includes(lowerSearch));

  if (index !== -1) {
    local.memory.splice(index, 1);
    await saveLocalContext(workspaceFolder, local);
    return true;
  }

  return false;
}

/**
 * Update current work status
 */
export async function updateCurrentWork(
  workspaceFolder: vscode.WorkspaceFolder,
  updates: Partial<LocalContext['currentWork']>
): Promise<void> {
  let local = await loadLocalContext(workspaceFolder);
  const project = await loadProjectContext(workspaceFolder);

  if (!project) {
    throw new Error('No project context found. Run "AI Context: Initialize" first.');
  }

  if (!local) {
    local = createDefaultLocalContext(project.projectId);
  }

  local.currentWork = { ...local.currentWork, ...updates };
  await saveLocalContext(workspaceFolder, local);
}

/**
 * Save a checkpoint
 */
export async function saveCheckpoint(
  workspaceFolder: vscode.WorkspaceFolder,
  name: string,
  summary: string
): Promise<void> {
  let local = await loadLocalContext(workspaceFolder);
  const project = await loadProjectContext(workspaceFolder);

  if (!project) {
    throw new Error('No project context found. Run "AI Context: Initialize" first.');
  }

  if (!local) {
    local = createDefaultLocalContext(project.projectId);
  }

  local.checkpoints.push({
    name,
    date: new Date().toISOString(),
    summary,
  });

  // Keep last 20 checkpoints
  if (local.checkpoints.length > 20) {
    local.checkpoints = local.checkpoints.slice(-20);
  }

  await saveLocalContext(workspaceFolder, local);
}

/**
 * Check if context exists for workspace
 */
export async function hasContext(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
  const context = await loadProjectContext(workspaceFolder);
  return context !== null;
}
