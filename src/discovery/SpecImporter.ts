import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';

const PINNED_BY = 'auto:spec';
const FIND_LIMIT_PER_PATTERN = 500;
const SPEC_EXCLUDE_PATTERN =
  '{**/node_modules/**,**/.git/**,**/.hg/**,**/.svn/**,**/out/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/.turbo/**,**/.cache/**,**/coverage/**,**/.venv/**,**/venv/**,**/__pycache__/**}';

const DEFAULT_PATTERNS = [
  'CLAUDE.md',
  '**/CLAUDE.md',
  'AGENTS.md',
  '**/AGENTS.md',
  'GEMINI.md',
  '**/GEMINI.md',
  'AGENT.md',
  '**/AGENT.md',
  '.cursorrules',
  '**/.cursorrules',
  '.cursor/rules/**/*.{md,mdc}',
  '**/.cursor/rules/**/*.{md,mdc}',
  '.windsurfrules',
  '**/.windsurfrules',
  '.github/copilot-instructions.md',
  '**/.github/copilot-instructions.md',
  'README.md',
  '**/README.md',
  'README.*.md',
  '**/README.*.md',
  'ARCHITECTURE.md',
  '**/ARCHITECTURE.md',
  'SPEC.md',
  '**/SPEC.md',
  'SPECIFICATION.md',
  '**/SPECIFICATION.md',
  'PLAN.md',
  '**/PLAN.md',
  'ROADMAP.md',
  '**/ROADMAP.md',
  'plans/**/*.md',
  'plan/**/*.md',
  'roadmap/**/*.md',
  'roadmaps/**/*.md',
  'proposals/**/*.md',
  'rfcs/**/*.md',
  'prd/**/*.md',
  'prds/**/*.md',
  'docs/SPEC.md',
  'docs/ARCHITECTURE.md',
  'docs/spec/**/*.md',
  'docs/specs/**/*.md',
  'docs/architecture/**/*.md',
  'docs/design/**/*.md',
  'docs/plans/**/*.md',
  'docs/rfcs/**/*.md',
  '.aicb/spec/**/*.md',
];

export class SpecImporter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private rescanHandle: NodeJS.Timeout | undefined;

  constructor(private readonly memory: MemoryManager) {}

  start(): void {
    void this.scan();
    this.watch();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('aiContextBridge.autoImportSpecFiles') ||
          e.affectsConfiguration('aiContextBridge.specPatterns')
        ) {
          this.refreshWatcher();
          void this.scan();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.refreshWatcher();
        void this.scan();
      }),
    );
  }

  private cfg() {
    const c = vscode.workspace.getConfiguration('aiContextBridge');
    return {
      enabled: c.get<boolean>('autoImportSpecFiles', true),
      patterns: c.get<string[]>('specPatterns') ?? DEFAULT_PATTERNS,
    };
  }

  async scan(): Promise<void> {
    const cfg = this.cfg();
    if (!cfg.enabled) {
      // Clean up previously imported spec pins.
      for (const f of this.memory.getState().pinnedFiles) {
        if (f.auto === 'spec') {
          this.memory.unpinFile(f.path);
        }
      }
      return;
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      return;
    }

    const found = new Set<string>();
    for (const pattern of cfg.patterns) {
      for (const folder of folders) {
        const rel = new vscode.RelativePattern(folder, pattern);
        try {
          const uris = await vscode.workspace.findFiles(
            rel,
            SPEC_EXCLUDE_PATTERN,
            FIND_LIMIT_PER_PATTERN,
          );
          for (const uri of uris) {
            found.add(uri.fsPath);
          }
        } catch {
          // ignore individual pattern failures
        }
      }
    }

    // Pin newly found specs.
    for (const filePath of found) {
      const existing = this.memory.getState().pinnedFiles.find((f) => f.path === filePath);
      if (existing && !existing.auto) {
        // Manual pin already — leave it but mark role as spec.
        if (existing.role !== 'spec') {
          this.memory.pinFile({
            path: filePath,
            pinnedBy: existing.pinnedBy,
            role: 'spec',
          });
        }
        continue;
      }
      this.memory.pinFile({
        path: filePath,
        pinnedBy: PINNED_BY,
        auto: 'spec',
        role: 'spec',
        note: this.describe(filePath, folders),
      });
    }

    // Remove spec pins for files that no longer match.
    for (const f of this.memory.getState().pinnedFiles) {
      if (f.auto === 'spec' && !found.has(f.path)) {
        this.memory.unpinFile(f.path);
      }
    }
  }

  private describe(filePath: string, folders: readonly vscode.WorkspaceFolder[]): string {
    const workspaceRoot = this.workspaceRootFor(filePath, folders);
    const rel = path.relative(workspaceRoot, filePath);
    const base = path.basename(filePath).toLowerCase();
    const dir = path.dirname(rel);
    const location = dir && dir !== '.' ? ` (${dir})` : '';
    if (base === 'claude.md') return `Claude Code instructions${location}`;
    if (base === 'agents.md' || base === 'agent.md') return `Multi-agent instructions${location}`;
    if (base === 'gemini.md') return `Gemini instructions${location}`;
    if (base === '.cursorrules') return `Cursor rules${location}`;
    if (base === '.windsurfrules') return `Windsurf rules${location}`;
    if (base === 'copilot-instructions.md') return `GitHub Copilot instructions${location}`;
    if (base.startsWith('readme')) return `Project README${location}`;
    if (base === 'architecture.md') return `Architecture spec${location}`;
    if (base.startsWith('spec')) return `Specification${location}`;
    return `Spec: ${rel}`;
  }

  private workspaceRootFor(filePath: string, folders: readonly vscode.WorkspaceFolder[]): string {
    const owner = folders.find((folder) => isWithin(filePath, folder.uri.fsPath));
    return owner?.uri.fsPath ?? folders[0]?.uri.fsPath ?? path.dirname(filePath);
  }

  private watch(): void {
    this.refreshWatcher();
  }

  private refreshWatcher(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    const cfg = this.cfg();
    if (!cfg.enabled) {
      return;
    }
    // One broad watcher covering common spec roots is cheaper than N narrow ones.
    this.watcher = vscode.workspace.createFileSystemWatcher(
      '{**/*.md,**/.cursorrules,**/.windsurfrules,**/.cursor/**,**/.github/copilot-instructions.md}',
    );
    const trigger = () => {
      if (this.rescanHandle) {
        clearTimeout(this.rescanHandle);
      }
      this.rescanHandle = setTimeout(() => void this.scan(), 1000);
    };
    this.watcher.onDidCreate(trigger);
    this.watcher.onDidDelete(trigger);
    this.disposables.push(this.watcher);
  }

  dispose(): void {
    if (this.rescanHandle) {
      clearTimeout(this.rescanHandle);
    }
    this.watcher?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

function isWithin(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
