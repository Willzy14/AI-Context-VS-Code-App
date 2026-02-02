// Types for AI Context Keeper

/**
 * Project-level context that should be committed to git
 * Shared across team members
 */
export interface ProjectContext {
  version: string;
  projectId: string;
  lastUpdated: string;

  project: {
    name: string;
    description: string;
    stack: string[];
    repository?: string;
  };

  architecture: {
    overview: string;
    keyPaths: Record<string, string>;
    dataFlow?: string;
  };

  conventions: {
    naming?: string;
    patterns?: string[];
    testing?: string;
    other?: string[];
  };

  decisions: Array<{
    date: string;
    decision: string;
    reason: string;
  }>;
}

/**
 * Personal/session context that should be gitignored
 * Specific to each developer
 */
export interface LocalContext {
  version: string;
  projectId: string;
  lastUpdated: string;

  currentWork: {
    activeTask?: string;
    blockers?: string[];
    recentChanges?: string[];
    nextSteps?: string[];
  };

  memory: string[];

  conversationSummary: {
    lastSession: string;
    keyPoints: string[];
    pendingQuestions: string[];
  };

  checkpoints: Array<{
    name: string;
    date: string;
    summary: string;
  }>;
}

/**
 * Combined context for injection into chat
 */
export interface FullContext {
  project: ProjectContext;
  local: LocalContext;
}

/**
 * Token budget allocation
 */
export interface TokenBudget {
  total: number;
  project: number;
  architecture: number;
  currentWork: number;
  memory: number;
  history: number;
}

/**
 * Auto-detected project information
 */
export interface DetectedProjectInfo {
  name: string;
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  entryPoints: string[];
  configFiles: string[];
  hasGit: boolean;
  remoteUrl?: string;
  description?: string;
}

/**
 * Context file paths
 */
export interface ContextPaths {
  projectContext: string;  // .vscode/ai-context.json (committed)
  localContext: string;    // .vscode/ai-context.local.json (gitignored)
}
