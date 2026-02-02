// Auto-analyzer - Detect project stack, frameworks, and key files

import * as vscode from 'vscode';
import * as path from 'path';
import { DetectedProjectInfo, ProjectContext } from './types';
import { createDefaultProjectContext } from './contextManager';

/**
 * Patterns to detect different project types
 */
const DETECTION_PATTERNS = {
  // Package managers
  npm: ['package.json'],
  yarn: ['yarn.lock'],
  pnpm: ['pnpm-lock.yaml'],
  pip: ['requirements.txt', 'Pipfile', 'pyproject.toml'],
  cargo: ['Cargo.toml'],
  dotnet: ['*.csproj', '*.fsproj', '*.sln'],
  maven: ['pom.xml'],
  gradle: ['build.gradle', 'build.gradle.kts'],
  go: ['go.mod'],

  // Frameworks
  react: ['package.json'], // Check contents for react
  vue: ['package.json'],   // Check contents for vue
  angular: ['angular.json'],
  nextjs: ['next.config.js', 'next.config.ts', 'next.config.mjs'],
  express: ['package.json'], // Check for express
  django: ['manage.py', 'settings.py'],
  flask: ['app.py', 'wsgi.py'],
  rails: ['Gemfile', 'config/routes.rb'],

  // Languages
  typescript: ['tsconfig.json'],
  python: ['*.py', 'requirements.txt', 'pyproject.toml'],
  rust: ['Cargo.toml'],
  // go already defined above
  java: ['*.java', 'pom.xml'],
  csharp: ['*.cs', '*.csproj'],
};

/**
 * Key files to look for in any project
 */
const KEY_FILE_PATTERNS = [
  'README.md',
  'README.rst',
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'Cargo.toml',
  '.env.example',
  'docker-compose.yml',
  'Dockerfile',
  'Makefile',
  '.github/workflows/*.yml',
];

/**
 * Analyze a workspace and detect project info
 */
export async function analyzeWorkspace(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<DetectedProjectInfo> {
  const info: DetectedProjectInfo = {
    name: workspaceFolder.name,
    languages: [],
    frameworks: [],
    entryPoints: [],
    configFiles: [],
    hasGit: false,
  };

  // Check for git
  try {
    const gitFolder = vscode.Uri.joinPath(workspaceFolder.uri, '.git');
    await vscode.workspace.fs.stat(gitFolder);
    info.hasGit = true;

    // Try to read remote URL
    const gitConfig = vscode.Uri.joinPath(gitFolder, 'config');
    try {
      const configContent = await vscode.workspace.fs.readFile(gitConfig);
      const match = configContent.toString().match(/url\s*=\s*(.+)/);
      if (match) {
        info.remoteUrl = match[1].trim();
      }
    } catch {
      // No git config
    }
  } catch {
    // No git folder
  }

  // Check for package.json (Node.js projects)
  try {
    const packageJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
    const packageContent = await vscode.workspace.fs.readFile(packageJsonUri);
    const packageJson = JSON.parse(packageContent.toString());

    info.configFiles.push('package.json');
    info.description = packageJson.description;

    // Detect from dependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (allDeps['typescript']) info.languages.push('TypeScript');
    if (allDeps['react']) info.frameworks.push('React');
    if (allDeps['vue']) info.frameworks.push('Vue');
    if (allDeps['@angular/core']) info.frameworks.push('Angular');
    if (allDeps['next']) info.frameworks.push('Next.js');
    if (allDeps['express']) info.frameworks.push('Express');
    if (allDeps['fastify']) info.frameworks.push('Fastify');
    if (allDeps['nestjs'] || allDeps['@nestjs/core']) info.frameworks.push('NestJS');
    if (allDeps['electron']) info.frameworks.push('Electron');
    if (allDeps['vite']) info.frameworks.push('Vite');
    if (allDeps['playwright']) info.frameworks.push('Playwright');

    // Check for main entry
    if (packageJson.main) info.entryPoints.push(packageJson.main);

    // Detect package manager
    if (await fileExists(workspaceFolder, 'yarn.lock')) {
      info.packageManager = 'yarn';
    } else if (await fileExists(workspaceFolder, 'pnpm-lock.yaml')) {
      info.packageManager = 'pnpm';
    } else if (await fileExists(workspaceFolder, 'package-lock.json')) {
      info.packageManager = 'npm';
    }

    if (!info.languages.includes('JavaScript')) {
      info.languages.push('JavaScript');
    }
  } catch {
    // No package.json
  }

  // Check for TypeScript
  if (await fileExists(workspaceFolder, 'tsconfig.json')) {
    if (!info.languages.includes('TypeScript')) {
      info.languages.push('TypeScript');
    }
    info.configFiles.push('tsconfig.json');
  }

  // Check for Python
  if (await fileExists(workspaceFolder, 'requirements.txt')) {
    info.languages.push('Python');
    info.configFiles.push('requirements.txt');
  }
  if (await fileExists(workspaceFolder, 'pyproject.toml')) {
    info.languages.push('Python');
    info.configFiles.push('pyproject.toml');
  }

  // Check for Rust
  if (await fileExists(workspaceFolder, 'Cargo.toml')) {
    info.languages.push('Rust');
    info.configFiles.push('Cargo.toml');
  }

  // Check for Go
  if (await fileExists(workspaceFolder, 'go.mod')) {
    info.languages.push('Go');
    info.configFiles.push('go.mod');
  }

  // Check for .NET
  const csprojFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/*.csproj'),
    '**/node_modules/**',
    5
  );
  if (csprojFiles.length > 0) {
    info.languages.push('C#');
    info.configFiles.push(...csprojFiles.map(f => path.relative(workspaceFolder.uri.fsPath, f.fsPath)));
  }

  // Check for common config files
  const configFiles = ['docker-compose.yml', 'Dockerfile', 'Makefile', '.env.example'];
  for (const file of configFiles) {
    if (await fileExists(workspaceFolder, file)) {
      info.configFiles.push(file);
    }
  }

  // Check for README
  if (await fileExists(workspaceFolder, 'README.md')) {
    // Try to extract description from README
    try {
      const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');
      const readmeContent = await vscode.workspace.fs.readFile(readmeUri);
      const lines = readmeContent.toString().split('\n');
      
      // Look for first non-heading, non-empty line
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!') && !trimmed.startsWith('[')) {
          if (!info.description && trimmed.length > 20) {
            info.description = trimmed.substring(0, 200);
          }
          break;
        }
      }
    } catch {
      // Can't read README
    }
  }

  // Dedupe
  info.languages = [...new Set(info.languages)];
  info.frameworks = [...new Set(info.frameworks)];
  info.configFiles = [...new Set(info.configFiles)];

  return info;
}

/**
 * Check if a file exists in the workspace
 */
async function fileExists(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePath: string
): Promise<boolean> {
  try {
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create initial project context from auto-detected info
 */
export function createContextFromDetection(info: DetectedProjectInfo): ProjectContext {
  const context = createDefaultProjectContext(info.name);

  context.project.description = info.description || '';
  context.project.stack = [...info.languages, ...info.frameworks];

  if (info.remoteUrl) {
    context.project.repository = info.remoteUrl;
  }

  // Set up architecture based on detected files
  const stackDescription = info.frameworks.length > 0
    ? `${info.frameworks.join(' + ')} project`
    : info.languages.length > 0
      ? `${info.languages.join('/')} project`
      : 'Project';

  context.architecture.overview = stackDescription;

  // Add key paths for config files
  for (const file of info.configFiles.slice(0, 10)) {
    context.architecture.keyPaths[file] = describeConfigFile(file);
  }

  // Add entry points
  for (const entry of info.entryPoints) {
    context.architecture.keyPaths[entry] = 'Application entry point';
  }

  return context;
}

/**
 * Get description for common config files
 */
function describeConfigFile(file: string): string {
  const descriptions: Record<string, string> = {
    'package.json': 'Node.js dependencies and scripts',
    'tsconfig.json': 'TypeScript configuration',
    'requirements.txt': 'Python dependencies',
    'pyproject.toml': 'Python project configuration',
    'Cargo.toml': 'Rust project configuration',
    'go.mod': 'Go module definition',
    'docker-compose.yml': 'Docker Compose services',
    'Dockerfile': 'Docker build instructions',
    'Makefile': 'Build automation',
    '.env.example': 'Environment variables template',
  };

  return descriptions[file] || 'Configuration file';
}
