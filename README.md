# AI Context Keeper

> **Persist AI conversation context across sessions for seamless project continuity**

Ever switch between projects and lose all the context your AI assistant had? This extension solves that by maintaining persistent project context that automatically gets injected into your Copilot conversations.

## Features

### 🧠 Automatic Context Injection
When you use `@context` in chat, your project context is automatically included - the AI knows your project's stack, architecture, what you're working on, and what you've discussed before.

### 📁 Dual Context System
- **Project Context** (`.vscode/ai-context.json`) - Shared across team, committed to git
- **Local Context** (`.vscode/ai-context.local.json`) - Personal notes, gitignored

### 🔍 Auto-Detection
On initialization, automatically detects:
- Languages and frameworks
- Package manager
- Key configuration files
- Git repository info

### 💾 Smart Memory
Remember important things with `/remember` - preferences, decisions, constraints.

### 📍 Checkpoints
Save named checkpoints to mark progress points you can reference later.

## Usage

### Chat Commands
Use `@context` in GitHub Copilot Chat:

```
@context How should I structure the authentication module?
@context /status
@context /remember User prefers functional components
@context /forget functional
@context /checkpoint auth-complete Basic auth flow done
```

### VS Code Commands
- `AI Context: Initialize` - Set up context for current project
- `AI Context: Update` - Update current work status
- `AI Context: Edit` - Open context file for manual editing
- `AI Context: Remember` - Add something to memory
- `AI Context: Clear` - Clear history or memory
- `AI Context: Show Status` - View current context status

## Context Structure

### Project Context (Committed)
```json
{
  "project": {
    "name": "My Project",
    "description": "A web app for...",
    "stack": ["TypeScript", "React", "Node.js"]
  },
  "architecture": {
    "overview": "Monorepo with frontend/ and backend/",
    "keyPaths": {
      "src/index.ts": "Application entry point"
    }
  },
  "conventions": {
    "naming": "camelCase for variables",
    "patterns": ["Repository pattern for data access"]
  },
  "decisions": [
    {
      "date": "2026-01-15",
      "decision": "Use PostgreSQL over MongoDB",
      "reason": "Relational data with complex queries"
    }
  ]
}
```

### Local Context (Gitignored)
```json
{
  "currentWork": {
    "activeTask": "Implementing user authentication",
    "blockers": ["Waiting for API keys"],
    "nextSteps": ["Add password reset flow"]
  },
  "memory": [
    "User prefers async/await over .then()",
    "Project uses Jest for testing"
  ],
  "conversationSummary": {
    "keyPoints": ["Discussed auth architecture"],
    "pendingQuestions": ["How to handle refresh tokens?"]
  }
}
```

## Token Management

Context is automatically truncated to fit within token limits. Priority order:
1. Project basics (name, stack)
2. Current work
3. Architecture
4. Memory
5. History

Configure max tokens in settings: `aiContext.maxTokens`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `aiContext.maxTokens` | 4000 | Maximum tokens for context injection |
| `aiContext.autoSummarize` | true | Auto-summarize on session end |
| `aiContext.includeGitInfo` | true | Include git branch/commits |

## Requirements

- VS Code 1.85+
- GitHub Copilot extension

## License

MIT
