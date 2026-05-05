import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { SkillScope, SkillStatus } from '../memory/types';

const RISKY = /(exec|run|delete|remove|terminal|shell|kill|format|install|publish|push|commit|deploy|apply|rebuild|reset|clean)/i;

interface DiscoveredSkill {
  id: string;
  name: string;
  description?: string;
  status: SkillStatus;
  sourceUri: string;
  origin:
    | 'claude-skill'
    | 'claude-command'
    | 'cursor-rule'
    | 'cursor-skill'
    | 'gemini-skill'
    | 'codex-skill'
    | 'agent-skill';
  scope: SkillScope;
}

const AICB_GENERATED_MARKER = 'AICB:GENERATED';

export class SkillDiscovery implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly memory: MemoryManager) {}

  start(): void {
    void this.runScan();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('aiContextBridge.autoDiscoverSkills') ||
          e.affectsConfiguration('aiContextBridge.scanGlobalSkills')
        ) {
          void this.runScan();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.runScan()),
    );
    const fsWatcher = vscode.workspace.createFileSystemWatcher(
      '{**/.claude/skills/**/SKILL.md,**/.claude/commands/**/*.md,**/.cursor/skills/**/*.md,**/.cursor/rules/**/*.{md,mdc},**/.gemini/skills/**/*.md,**/.codex/skills/**/SKILL.md,**/.agent/skills/**/SKILL.md}',
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
        const sourceChanged =
          prior.sourceUri !== s.sourceUri ||
          prior.origin !== s.origin ||
          prior.scope !== s.scope;
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
            scope: s.scope,
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
        scope: s.scope,
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
      out.push(...(await this.scanGeminiSkills(folder)));
      out.push(...(await this.scanGenericFolderSkills(folder, '.codex', 'codex-skill')));
      out.push(...(await this.scanGenericFolderSkills(folder, '.agent', 'agent-skill')));
    }
    if (this.scanGlobalEnabled()) {
      out.push(...(await this.scanGlobalSkills()));
    }
    return out;
  }

  private scanGlobalEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('aiContextBridge')
      .get<boolean>('scanGlobalSkills', true);
  }

  private async scanGlobalSkills(): Promise<DiscoveredSkill[]> {
    const home = os.homedir();
    if (!home) {
      return [];
    }
    const out: DiscoveredSkill[] = [];

    // ~/.claude/skills/<folder>/SKILL.md
    const claudeSkillsRoot = path.join(home, '.claude', 'skills');
    for (const dir of await listSubdirs(claudeSkillsRoot)) {
      const skillFile = path.join(claudeSkillsRoot, dir, 'SKILL.md');
      if (!(await fileExists(skillFile))) continue;
      if (await isAicbGenerated(skillFile)) continue;
      out.push(await buildSkill(skillFile, dir, 'claude-skill', 'global', dir));
    }

    // ~/.claude/commands/**/*.md
    for (const file of await walkMarkdown(path.join(home, '.claude', 'commands'), ['.md'])) {
      const base = path.basename(file, '.md');
      if (base.startsWith('aicb-')) continue;
      if (await isAicbGenerated(file)) continue;
      out.push(await buildSkill(file, base, 'claude-command', 'global', `/${base}`));
    }

    // ~/.cursor/rules/**/*.{md,mdc}
    for (const file of await walkMarkdown(path.join(home, '.cursor', 'rules'), ['.md', '.mdc'])) {
      const base = path.basename(file).replace(/\.(md|mdc)$/i, '');
      if (base.startsWith('aicb-')) continue;
      if (await isAicbGenerated(file)) continue;
      out.push(await buildSkill(file, base, 'cursor-rule', 'global'));
    }

    // ~/.cursor/skills/**/*.md
    for (const file of await walkMarkdown(path.join(home, '.cursor', 'skills'), ['.md'])) {
      const base = path.basename(file, '.md');
      if (base.startsWith('aicb-')) continue;
      if (await isAicbGenerated(file)) continue;
      out.push(await buildSkill(file, base, 'cursor-skill', 'global'));
    }

    // ~/.gemini/skills/**/*.md
    for (const file of await walkMarkdown(path.join(home, '.gemini', 'skills'), ['.md'])) {
      const base = path.basename(file, '.md');
      if (base.startsWith('aicb-')) continue;
      if (await isAicbGenerated(file)) continue;
      out.push(await buildSkill(file, base, 'gemini-skill', 'global'));
    }

    // ~/.codex/skills/<folder>/SKILL.md (or $CODEX_HOME/skills) and ~/.agent/skills/<folder>/SKILL.md
    const codexHome = process.env.CODEX_HOME ?? path.join(home, '.codex');
    const genericRoots: { skillsRoot: string; origin: 'codex-skill' | 'agent-skill' }[] = [
      { skillsRoot: path.join(codexHome, 'skills'), origin: 'codex-skill' },
      { skillsRoot: path.join(home, '.agent', 'skills'), origin: 'agent-skill' },
    ];
    for (const { skillsRoot, origin } of genericRoots) {
      for (const dir of await listSubdirs(skillsRoot)) {
        const skillFile = path.join(skillsRoot, dir, 'SKILL.md');
        if (!(await fileExists(skillFile))) continue;
        if (await isAicbGenerated(skillFile)) continue;
        out.push(await buildSkill(skillFile, dir, origin, 'global', dir));
      }
    }

    return out;
  }

  private async scanGenericFolderSkills(
    folder: vscode.WorkspaceFolder,
    rootDir: string,
    origin: 'codex-skill' | 'agent-skill',
  ): Promise<DiscoveredSkill[]> {
    const pattern = new vscode.RelativePattern(folder, `${rootDir}/skills/**/SKILL.md`);
    const uris = await vscode.workspace.findFiles(pattern, undefined, 200);
    const out: DiscoveredSkill[] = [];
    for (const uri of uris) {
      if (await isAicbGenerated(uri.fsPath)) continue;
      const skillFolder = path.basename(path.dirname(uri.fsPath));
      const id = `${origin}.${skillFolder}`;
      const meta = await readMarkdownMeta(uri.fsPath);
      const name = meta.title ?? skillFolder;
      const description = meta.description;
      const status: SkillStatus =
        RISKY.test(skillFolder) || (description && RISKY.test(description)) ? 'ASK' : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin, scope: 'workspace' });
    }
    return out;
  }

  private async scanGeminiSkills(folder: vscode.WorkspaceFolder): Promise<DiscoveredSkill[]> {
    const pattern = new vscode.RelativePattern(folder, '.gemini/skills/**/*.md');
    const uris = await vscode.workspace.findFiles(pattern, undefined, 200);
    const out: DiscoveredSkill[] = [];
    for (const uri of uris) {
      const base = path.basename(uri.fsPath, '.md');
      if (base.startsWith('aicb-') || (await isAicbGenerated(uri.fsPath))) {
        continue;
      }
      const meta = await readMarkdownMeta(uri.fsPath);
      const id = `gemini-skill.${base}`;
      const name = meta.title ?? base;
      const description = meta.description;
      const status: SkillStatus = RISKY.test(base) || (description && RISKY.test(description))
        ? 'ASK'
        : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'gemini-skill', scope: 'workspace' });
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
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'claude-skill', scope: 'workspace' });
    }
    return out;
  }

  private async scanClaudeCommands(folder: vscode.WorkspaceFolder): Promise<DiscoveredSkill[]> {
    const pattern = new vscode.RelativePattern(folder, '.claude/commands/**/*.md');
    const uris = await vscode.workspace.findFiles(pattern, undefined, 200);
    const out: DiscoveredSkill[] = [];
    for (const uri of uris) {
      const base = path.basename(uri.fsPath, '.md');
      if (base.startsWith('aicb-') || (await isAicbGenerated(uri.fsPath))) {
        continue;
      }
      const id = `claude-command.${base}`;
      const meta = await readMarkdownMeta(uri.fsPath);
      const name = `/${base}`;
      const description = meta.description ?? meta.title;
      const status: SkillStatus = RISKY.test(base) || (description && RISKY.test(description))
        ? 'ASK'
        : 'ENABLED';
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'claude-command', scope: 'workspace' });
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
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'cursor-rule', scope: 'workspace' });
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
      out.push({ id, name, description, status, sourceUri: uri.fsPath, origin: 'cursor-skill', scope: 'workspace' });
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

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.promises.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function walkMarkdown(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (exts.includes(ext)) {
        out.push(full);
      }
    }
    if (out.length > 1000) break; // safety cap
  }
  return out;
}

async function buildSkill(
  filePath: string,
  base: string,
  origin: DiscoveredSkill['origin'],
  scope: SkillScope,
  displayName?: string,
): Promise<DiscoveredSkill> {
  const meta = await readMarkdownMeta(filePath);
  const idPrefix = scope === 'global' ? 'global:' : '';
  const id = `${idPrefix}${origin}.${base}`;
  const name = displayName ?? meta.title ?? base;
  const description = meta.description ?? meta.title;
  const status: SkillStatus =
    RISKY.test(base) || (description && RISKY.test(description)) ? 'ASK' : 'ENABLED';
  return { id, name, description, status, sourceUri: filePath, origin, scope };
}
