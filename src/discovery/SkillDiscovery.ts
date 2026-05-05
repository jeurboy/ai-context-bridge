import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { SkillStatus } from '../memory/types';

const RISKY = /(exec|run|delete|remove|terminal|shell|kill|format|install|publish|push|commit|deploy|apply|rebuild|reset|clean)/i;

interface DiscoveredSkill {
  id: string;
  name: string;
  description?: string;
  status: SkillStatus;
  sourceUri: string;
  origin: 'claude-skill' | 'claude-command' | 'cursor-rule' | 'cursor-skill';
}

const AICB_GENERATED_MARKER = 'AICB:GENERATED';

export class SkillDiscovery implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly memory: MemoryManager) {}

  start(): void {
    void this.runScan();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('aiContextBridge.autoDiscoverSkills')) {
          void this.runScan();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.runScan()),
    );
    const fsWatcher = vscode.workspace.createFileSystemWatcher(
      '{**/.claude/skills/**/SKILL.md,**/.claude/commands/**/*.md,**/.cursor/skills/**/*.md,**/.cursor/rules/**/*.{md,mdc}}',
    );
    fsWatcher.onDidCreate(() => void this.runScan());
    fsWatcher.onDidDelete(() => void this.runScan());
    fsWatcher.onDidChange(() => void this.runScan());
    this.disposables.push(fsWatcher);
  }

  private enabled(): boolean {
    return vscode.workspace
      .getConfiguration('aiContextBridge')
      .get<boolean>('autoDiscoverSkills', true);
  }

  async rescan(): Promise<number> {
    const discovered = await this.scan();
    await this.applyDiscovered(discovered);
    return discovered.length;
  }

  private async runScan(): Promise<void> {
    if (!this.enabled()) {
      return;
    }
    const discovered = await this.scan();
    await this.applyDiscovered(discovered);
  }

  private async applyDiscovered(discovered: DiscoveredSkill[]): Promise<void> {
    const existing = new Map(this.memory.getState().skills.map((s) => [s.id, s] as const));
    for (const s of discovered) {
      const prior = existing.get(s.id);
      if (prior) {
        // Don't override user-set status; refresh metadata only.
        const sourceChanged = prior.sourceUri !== s.sourceUri || prior.origin !== s.origin;
        if (
          prior.name !== s.name ||
          prior.description !== s.description ||
          !prior.source ||
          sourceChanged
        ) {
          this.memory.registerSkill({
            id: s.id,
            name: s.name,
            description: s.description,
            status: prior.status,
            ownerModelId: prior.ownerModelId,
            source: prior.source ?? 'auto',
            sourceUri: s.sourceUri,
            origin: s.origin,
          });
        }
        continue;
      }
      this.memory.registerSkill({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        source: 'auto',
        sourceUri: s.sourceUri,
        origin: s.origin,
      });
    }
    // Prune auto-discovered skills that have disappeared from the scan.
    this.memory.reconcileAutoSkills(new Set(discovered.map((s) => s.id)));
  }

  private async scan(): Promise<DiscoveredSkill[]> {
    return this.scanFilesystemSkills();
  }

  private async scanFilesystemSkills(): Promise<DiscoveredSkill[]> {
    const out: DiscoveredSkill[] = [];
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      out.push(...(await this.scanClaudeSkills(folder)));
      out.push(...(await this.scanClaudeCommands(folder)));
      out.push(...(await this.scanCursorSkills(folder)));
    }
    return out;
  }

  private async scanClaudeSkills(folder: vscode.WorkspaceFolder): Promise<DiscoveredSkill[]> {
    const pattern = new vscode.RelativePattern(folder, '.claude/skills/**/SKILL.md');
    const uris = await vscode.workspace.findFiles(pattern, undefined, 200);
    const out: DiscoveredSkill[] = [];
    for (const uri of uris) {
      if (await isAicbGenerated(uri.fsPath)) {
        continue;
      }
      const skillFolder = path.basename(path.dirname(uri.fsPath));
      const id = `claude-skill.${skillFolder}`;
      const meta = await readMarkdownMeta(uri.fsPath);
      const name = meta.title ?? skillFolder;
      const description = meta.description;
      const status: SkillStatus = RISKY.test(skillFolder) || (description && RISKY.test(description))
        ? 'ASK'
        : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'claude-skill' });
    }
    return out;
  }

  private async scanClaudeCommands(folder: vscode.WorkspaceFolder): Promise<DiscoveredSkill[]> {
    const pattern = new vscode.RelativePattern(folder, '.claude/commands/**/*.md');
    const uris = await vscode.workspace.findFiles(pattern, undefined, 200);
    const out: DiscoveredSkill[] = [];
    for (const uri of uris) {
      if (await isAicbGenerated(uri.fsPath)) {
        continue;
      }
      const base = path.basename(uri.fsPath, '.md');
      const id = `claude-command.${base}`;
      const meta = await readMarkdownMeta(uri.fsPath);
      const name = `/${base}`;
      const description = meta.description ?? meta.title;
      const status: SkillStatus = RISKY.test(base) || (description && RISKY.test(description))
        ? 'ASK'
        : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'claude-command' });
    }
    return out;
  }

  private async scanCursorSkills(folder: vscode.WorkspaceFolder): Promise<DiscoveredSkill[]> {
    const out: DiscoveredSkill[] = [];
    const rulesPattern = new vscode.RelativePattern(folder, '.cursor/rules/**/*.{md,mdc}');
    const skillsPattern = new vscode.RelativePattern(folder, '.cursor/skills/**/*.md');
    const ruleUris = await vscode.workspace.findFiles(rulesPattern, undefined, 200);
    const skillUris = await vscode.workspace.findFiles(skillsPattern, undefined, 200);

    for (const uri of ruleUris) {
      const base = path.basename(uri.fsPath).replace(/\.(md|mdc)$/i, '');
      // Skip AICB-generated mirror files (they have `aicb-` prefix or marker).
      if (base.startsWith('aicb-') || (await isAicbGenerated(uri.fsPath))) {
        continue;
      }
      const meta = await readMarkdownMeta(uri.fsPath);
      const id = `cursor-rule.${base}`;
      const name = meta.title ?? base;
      const description = meta.description;
      const status: SkillStatus = RISKY.test(base) || (description && RISKY.test(description))
        ? 'ASK'
        : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'cursor-rule' });
    }

    for (const uri of skillUris) {
      const base = path.basename(uri.fsPath, '.md');
      if (base.startsWith('aicb-') || (await isAicbGenerated(uri.fsPath))) {
        continue;
      }
      const meta = await readMarkdownMeta(uri.fsPath);
      const id = `cursor-skill.${base}`;
      const name = meta.title ?? base;
      const description = meta.description;
      const status: SkillStatus = RISKY.test(base) || (description && RISKY.test(description))
        ? 'ASK'
        : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'cursor-skill' });
    }

    return out;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

interface MarkdownMeta {
  title?: string;
  description?: string;
}

async function readMarkdownMeta(filePath: string): Promise<MarkdownMeta> {
  try {
    const buf = await fs.promises.readFile(filePath, 'utf8');
    const head = buf.slice(0, 8000);
    let title: string | undefined;
    let description: string | undefined;

    // YAML frontmatter
    const fm = head.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fm) {
      const yaml = fm[1];
      title = title ?? matchField(yaml, 'name') ?? matchField(yaml, 'title');
      description = description ?? matchField(yaml, 'description');
    }

    // First H1
    const body = fm ? head.slice(fm[0].length) : head;
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1 && !title) {
      title = h1[1].trim();
    }

    // First non-empty paragraph
    if (!description) {
      const lines = body.split('\n');
      let started = false;
      const para: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!started) {
          if (trimmed.startsWith('#') || trimmed.length === 0) {
            continue;
          }
          started = true;
        }
        if (trimmed.length === 0) {
          break;
        }
        para.push(trimmed);
      }
      if (para.length) {
        description = para.join(' ').slice(0, 240);
      }
    }
    return { title, description };
  } catch {
    return {};
  }
}

function matchField(yaml: string, key: string): string | undefined {
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'mi');
  const m = yaml.match(re);
  if (!m) return undefined;
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}

async function isAicbGenerated(filePath: string): Promise<boolean> {
  try {
    const buf = await fs.promises.readFile(filePath, 'utf8');
    return buf.slice(0, 1000).includes(AICB_GENERATED_MARKER);
  } catch {
    return false;
  }
}
