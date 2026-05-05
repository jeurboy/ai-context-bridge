import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { Skill } from '../memory/types';

const GENERATED_MARKER = 'AICB:GENERATED';

interface AdapterTarget {
  /** Workspace-relative directory to write generated files into. */
  dir: string;
  /** Filename builder: returns just the filename (no directory). */
  filename: (skill: Skill) => string;
  /** Format the body. Includes the generated-marker comment header. */
  format: (skill: Skill, sourceBody: string) => string;
}

const TARGETS: AdapterTarget[] = [
  {
    dir: '.cursor/rules',
    filename: (s) => `aicb-${slug(s.id)}.mdc`,
    format: (s, body) => formatCursor(s, body),
  },
  {
    dir: '.gemini/skills',
    filename: (s) => `aicb-${slug(s.id)}.md`,
    format: (s, body) => formatGeneric(s, body, 'gemini'),
  },
];

export class SkillAdapterWriter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private flushHandle: NodeJS.Timeout | undefined;

  constructor(private readonly memory: MemoryManager) {}

  start(): void {
    this.disposables.push(
      this.memory.onDidChange((c) => {
        if (c.kind === 'skill' || c.kind === 'killSwitch' || c.kind === 'bulk') {
          this.scheduleFlush();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('aiContextBridge.mirrorSkillsToOtherAgents')) {
          this.scheduleFlush();
        }
      }),
    );
  }

  private cfg() {
    const c = vscode.workspace.getConfiguration('aiContextBridge');
    return {
      enabled: c.get<boolean>('mirrorSkillsToOtherAgents', false),
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

    // Mirror only Claude-origin skills; never re-mirror cursor-* origins (would loop).
    const mirrorable = this.memory
      .getState()
      .skills.filter((s) => s.sourceUri && (s.origin === 'claude-skill' || s.origin === 'claude-command'));

    const expectedByDir = new Map<string, Set<string>>();
    for (const target of TARGETS) {
      expectedByDir.set(target.dir, new Set());
    }

    for (const skill of mirrorable) {
      let sourceBody = '';
      try {
        sourceBody = await fs.promises.readFile(skill.sourceUri!, 'utf8');
      } catch {
        skipped.push(skill.id);
        continue;
      }
      for (const target of TARGETS) {
        const filename = target.filename(skill);
        expectedByDir.get(target.dir)!.add(filename);
        const out = path.join(root, target.dir, filename);
        const content = target.format(skill, sourceBody);
        try {
          await fs.promises.mkdir(path.dirname(out), { recursive: true });
          const existing = await safeRead(out);
          if (existing === content) {
            continue;
          }
          if (existing && !existing.includes(GENERATED_MARKER)) {
            // Don't overwrite a hand-authored file at the same path.
            skipped.push(path.join(target.dir, filename));
            continue;
          }
          await atomicWrite(out, content);
          written.push(path.join(target.dir, filename));
        } catch {
          skipped.push(path.join(target.dir, filename));
        }
      }
    }

    // Prune previously-mirrored files whose source skill is gone.
    for (const target of TARGETS) {
      const dirAbs = path.join(root, target.dir);
      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(dirAbs);
      } catch {
        continue;
      }
      const expected = expectedByDir.get(target.dir)!;
      for (const entry of entries) {
        if (!entry.startsWith('aicb-')) {
          continue;
        }
        if (expected.has(entry)) {
          continue;
        }
        const fileAbs = path.join(dirAbs, entry);
        const body = await safeRead(fileAbs);
        if (!body || !body.includes(GENERATED_MARKER)) {
          continue;
        }
        try {
          await fs.promises.unlink(fileAbs);
          pruned.push(path.join(target.dir, entry));
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
