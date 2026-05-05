import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { Skill } from '../memory/types';

const GENERATED_MARKER = 'AICB:GENERATED';

export type MirrorHost = 'cursor' | 'gemini' | 'claude' | 'kilocode' | 'codex' | 'agent';

interface AdapterTarget {
  /** Host this target represents. Filtered against aiContextBridge.skillMirrorHosts. */
  host: MirrorHost;
  /** Workspace-relative directory for workspace-scope skills. */
  workspaceDir: string;
  /** Absolute directory under user home for global-scope skills. */
  globalDir: string;
  /** Filename builder: returns the filename (or subpath) inside the chosen directory. */
  filename: (skill: Skill) => string;
  /** Format the body. Includes the generated-marker comment header. */
  format: (skill: Skill, sourceBody: string) => string;
  /** Only mirror skills with one of these origins into this target. */
  forOrigins: NonNullable<Skill['origin']>[];
  /** Match generated entries during prune (folder or filename prefix). Defaults to "aicb-". */
  prunePrefix?: string;
}

const HOME = os.homedir();
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(HOME, '.codex');

const TARGETS: AdapterTarget[] = [
  {
    host: 'cursor',
    workspaceDir: '.cursor/rules',
    globalDir: path.join(HOME, '.cursor', 'rules'),
    filename: (s) => `aicb-${slug(s.id)}.mdc`,
    format: (s, body) => formatCursor(s, body),
    forOrigins: ['claude-skill', 'claude-command', 'gemini-skill'],
  },
  {
    host: 'gemini',
    workspaceDir: '.gemini/skills',
    globalDir: path.join(HOME, '.gemini', 'skills'),
    filename: (s) => `aicb-${slug(s.id)}.md`,
    format: (s, body) => formatGeneric(s, body, 'gemini'),
    forOrigins: ['claude-skill', 'claude-command'],
  },
  {
    host: 'claude',
    workspaceDir: '.claude/commands',
    globalDir: path.join(HOME, '.claude', 'commands'),
    filename: (s) => `aicb-${slug(s.id)}.md`,
    format: (s, body) => formatGeneric(s, body, 'claude'),
    forOrigins: ['gemini-skill'],
  },
  {
    host: 'kilocode',
    workspaceDir: '.kilocode/skills',
    globalDir: path.join(HOME, '.kilocode', 'skills'),
    filename: (s) => path.join(`aicb-${slug(s.id)}`, 'SKILL.md'),
    format: (s, body) => formatGeneric(s, body, 'kilocode'),
    forOrigins: ['claude-skill', 'claude-command', 'gemini-skill', 'codex-skill', 'agent-skill'],
    prunePrefix: 'aicb-',
  },
  {
    host: 'codex',
    workspaceDir: '.codex/skills',
    globalDir: path.join(CODEX_HOME, 'skills'),
    filename: (s) => path.join(`aicb-${slug(s.id)}`, 'SKILL.md'),
    format: (s, body) => formatGeneric(s, body, 'codex'),
    forOrigins: ['claude-skill', 'claude-command', 'gemini-skill', 'agent-skill'],
    prunePrefix: 'aicb-',
  },
  {
    host: 'agent',
    workspaceDir: '.agent/skills',
    globalDir: path.join(HOME, '.agent', 'skills'),
    filename: (s) => path.join(`aicb-${slug(s.id)}`, 'SKILL.md'),
    format: (s, body) => formatGeneric(s, body, 'agent'),
    forOrigins: ['claude-skill', 'claude-command', 'gemini-skill', 'codex-skill'],
    prunePrefix: 'aicb-',
  },
];

const ALL_HOSTS: MirrorHost[] = ['cursor', 'gemini', 'claude', 'kilocode', 'codex', 'agent'];

const MIRRORABLE_ORIGINS: ReadonlySet<NonNullable<Skill['origin']>> = new Set([
  'claude-skill',
  'claude-command',
  'gemini-skill',
  'codex-skill',
  'agent-skill',
]);

export class SkillAdapterWriter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private flushHandle: NodeJS.Timeout | undefined;

  constructor(private readonly memory: MemoryManager) {}

  start(): void {
    this.disposables.push(
      this.memory.onDidChange((c) => {
        if (c.kind === 'skill' || c.kind === 'bulk') {
          this.scheduleFlush();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('aiContextBridge.mirrorSkillsToOtherAgents') ||
          e.affectsConfiguration('aiContextBridge.skillMirrorHosts') ||
          e.affectsConfiguration('aiContextBridge.mirrorGlobalSkills')
        ) {
          this.scheduleFlush();
        }
      }),
    );
  }

  private cfg() {
    const c = vscode.workspace.getConfiguration('aiContextBridge');
    const rawHosts = c.get<string[]>('skillMirrorHosts', ALL_HOSTS);
    const hosts = new Set<MirrorHost>(
      ALL_HOSTS.filter((h) => rawHosts.includes(h)),
    );
    return {
      enabled: c.get<boolean>('mirrorSkillsToOtherAgents', false),
      includeGlobal: c.get<boolean>('mirrorGlobalSkills', false),
      hosts,
    };
  }

  private scheduleFlush(): void {
    if (this.flushHandle) {
      clearTimeout(this.flushHandle);
    }
    this.flushHandle = setTimeout(() => {
      void this.flushNow();
    }, 1500);
  }

  async flushNow(opts?: { force?: boolean }): Promise<{
    written: string[];
    skipped: string[];
    pruned: string[];
  }> {
    const cfg = this.cfg();
    const written: string[] = [];
    const skipped: string[] = [];
    const pruned: string[] = [];
    if (!cfg.enabled && !opts?.force) {
      return { written, skipped, pruned };
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return { written, skipped, pruned };
    }
    const activeTargets = TARGETS.filter((t) => cfg.hosts.has(t.host));

    // Skills are mirrored at the SAME scope as their source:
    //   workspace skill   → workspace agent dirs (.cursor/rules, .gemini/skills, …)
    //   global    skill   → user-global agent dirs (~/.cursor/rules, ~/.gemini/skills, …)
    // This way a skill installed once at ~/.claude/skills/foo becomes visible to every
    // agent in every project, without polluting individual workspaces.
    const mirrorable = this.memory
      .getState()
      .skills.filter((s) => {
        if (!s.sourceUri || !s.origin || !MIRRORABLE_ORIGINS.has(s.origin)) return false;
        const scope = s.scope ?? 'workspace';
        if (scope === 'global' && !cfg.includeGlobal) return false;
        return true;
      });

    // expectedByDir keyed by ABSOLUTE directory (workspace and global produce different abs paths).
    const expectedByDir = new Map<string, Set<string>>();
    const dirToTarget = new Map<string, AdapterTarget>();
    const registerDir = (dirAbs: string, target: AdapterTarget) => {
      if (!expectedByDir.has(dirAbs)) {
        expectedByDir.set(dirAbs, new Set());
        dirToTarget.set(dirAbs, target);
      }
    };

    // Always seed workspace target dirs so they get pruned on host-uncheck.
    for (const target of activeTargets) {
      registerDir(path.join(root, target.workspaceDir), target);
      if (cfg.includeGlobal) {
        registerDir(target.globalDir, target);
      }
    }

    for (const skill of mirrorable) {
      let sourceBody = '';
      try {
        sourceBody = await fs.promises.readFile(skill.sourceUri!, 'utf8');
      } catch {
        skipped.push(skill.id);
        continue;
      }
      const scope = skill.scope ?? 'workspace';
      for (const target of activeTargets) {
        if (!skill.origin || !target.forOrigins.includes(skill.origin)) {
          continue;
        }
        const dirAbs = scope === 'global' ? target.globalDir : path.join(root, target.workspaceDir);
        const filename = target.filename(skill);
        registerDir(dirAbs, target);
        expectedByDir.get(dirAbs)!.add(filename);
        const out = path.join(dirAbs, filename);
        const content = target.format(skill, sourceBody);
        try {
          await fs.promises.mkdir(path.dirname(out), { recursive: true });
          const existing = await safeRead(out);
          if (existing === content) {
            continue;
          }
          if (existing && !existing.includes(GENERATED_MARKER)) {
            // Don't overwrite a hand-authored file at the same path.
            skipped.push(out);
            continue;
          }
          await atomicWrite(out, content);
          written.push(out);
        } catch {
          skipped.push(out);
        }
      }
    }

    // Prune previously-mirrored files/folders whose source skill is gone OR
    // whose host was just disabled. We always sweep ALL targets (not just
    // activeTargets) so unchecking a host removes its mirrored files. Sweep
    // both workspace and global dirs (when includeGlobal is on).
    const sweepDirs: { dirAbs: string; target: AdapterTarget }[] = [];
    for (const target of TARGETS) {
      sweepDirs.push({ dirAbs: path.join(root, target.workspaceDir), target });
      if (cfg.includeGlobal) {
        sweepDirs.push({ dirAbs: target.globalDir, target });
      }
    }
    for (const { dirAbs, target } of sweepDirs) {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
      } catch {
        continue;
      }
      const expectedSet = expectedByDir.get(dirAbs) ?? new Set<string>();
      const expectedRoots = new Set(
        Array.from(expectedSet).map((rel) => rel.split(path.sep)[0]),
      );
      const prefix = target.prunePrefix ?? 'aicb-';
      for (const entry of entries) {
        if (!entry.name.startsWith(prefix)) continue;
        if (expectedRoots.has(entry.name)) continue;
        const entryAbs = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) {
          let containsMarker = false;
          try {
            const inner = await fs.promises.readdir(entryAbs);
            for (const f of inner) {
              const body = await safeRead(path.join(entryAbs, f));
              if (body && body.includes(GENERATED_MARKER)) {
                containsMarker = true;
                break;
              }
            }
          } catch {
            // ignore
          }
          if (!containsMarker) continue;
          try {
            await fs.promises.rm(entryAbs, { recursive: true, force: true });
            pruned.push(entryAbs);
          } catch {
            // ignore
          }
          continue;
        }
        const body = await safeRead(entryAbs);
        if (!body || !body.includes(GENERATED_MARKER)) continue;
        try {
          await fs.promises.unlink(entryAbs);
          pruned.push(entryAbs);
        } catch {
          // ignore
        }
      }
    }

    return { written, skipped, pruned };
  }

  dispose(): void {
    if (this.flushHandle) {
      clearTimeout(this.flushHandle);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

function formatCursor(skill: Skill, sourceBody: string): string {
  const stripped = stripFrontmatter(sourceBody);
  const desc = (skill.description ?? '').replace(/\n/g, ' ').replace(/"/g, '\\"');
  const front = [
    '---',
    `description: "${desc}"`,
    'globs: ["**/*"]',
    'alwaysApply: false',
    '---',
  ].join('\n');
  return `${header(skill)}\n${front}\n\n# ${skill.name}\n\n${stripped.trim()}\n`;
}

function formatGeneric(skill: Skill, sourceBody: string, _agent: string): string {
  const stripped = stripFrontmatter(sourceBody);
  return `${header(skill)}\n# ${skill.name}\n\n${stripped.trim()}\n`;
}

function header(skill: Skill): string {
  const src = skill.sourceUri ?? '(unknown source)';
  return [
    `<!-- ${GENERATED_MARKER} by AI Context Bridge — do not edit. -->`,
    `<!-- Source of truth: ${src} -->`,
    `<!-- Skill id: ${skill.id} · status: ${skill.status} -->`,
  ].join('\n');
}

function stripFrontmatter(body: string): string {
  return body.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

function slug(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function safeRead(file: string): Promise<string | undefined> {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const tmp = `${target}.aicb.tmp`;
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, target);
}
