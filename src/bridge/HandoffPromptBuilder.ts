import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { PinnedFile, Skill, Thought } from '../memory/types';

const SKILL_EXCERPT_CHARS = 600;
const SKILL_EXCERPT_LIMIT = 8;

export class HandoffPromptBuilder {
  constructor(private readonly memory: MemoryManager) {}

  build(thoughtLimit = 8, opts?: { includeGeneratedAt?: boolean }): string {
    const state = this.memory.getState();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const lines: string[] = [];

    lines.push('# AI Context Bridge — Handoff');
    lines.push('');
    if (root) {
      lines.push(`Workspace: \`${root}\``);
    }
    if (opts?.includeGeneratedAt !== false) {
      lines.push(`Generated: ${new Date().toISOString()}`);
    }
    lines.push('');

    const specs = state.pinnedFiles.filter((f) => f.role === 'spec' || f.auto === 'spec');
    const working = state.pinnedFiles.filter((f) => !(f.role === 'spec' || f.auto === 'spec'));

    if (specs.length > 0) {
      lines.push('## Spec / context files (read these first)');
      for (const f of specs) {
        lines.push(`- ${this.formatPin(f, root)}`);
      }
      lines.push('');
    }

    if (working.length > 0) {
      lines.push('## Working files (current focus)');
      for (const f of working) {
        lines.push(`- ${this.formatPin(f, root)}`);
      }
      lines.push('');
    }

    const recentThoughts = state.thoughts
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, thoughtLimit);
    if (recentThoughts.length > 0) {
      lines.push(`## Recent thoughts (last ${recentThoughts.length})`);
      for (const t of recentThoughts) {
        lines.push(this.formatThought(t, root));
      }
      lines.push('');
    }

    const skillsByStatus = groupBy(state.skills, (s) => s.status);
    if (state.skills.length > 0) {
      lines.push('## Skills');
      for (const status of ['ENABLED', 'ASK', 'DISABLED'] as const) {
        const list = skillsByStatus.get(status) ?? [];
        if (list.length === 0) {
          continue;
        }
        const names = list.map((s) => s.name || s.id).join(', ');
        lines.push(`- **${status}** — ${names}`);
      }
      lines.push('');

      const enabled = (skillsByStatus.get('ENABLED') ?? []).filter((s) => s.sourceUri);
      const ask = (skillsByStatus.get('ASK') ?? []).filter((s) => s.sourceUri);
      const candidates = [...enabled, ...ask].slice(0, SKILL_EXCERPT_LIMIT);
      if (candidates.length > 0) {
        lines.push('## Skill instructions (excerpts)');
        lines.push(
          '_The full content lives at the path shown. Read the source file before invoking._',
        );
        lines.push('');
        for (const skill of candidates) {
          const excerpt = readExcerpt(skill.sourceUri!);
          if (!excerpt) {
            continue;
          }
          const rel = root ? path.relative(root, skill.sourceUri!) : skill.sourceUri!;
          lines.push(`### ${skill.name || skill.id} _(${skill.status})_`);
          lines.push(`Source: \`${rel}\``);
          lines.push('');
          lines.push(excerpt);
          lines.push('');
        }
      }
    }

    lines.push('## How to use this handoff');
    lines.push('1. Read every file under "Spec / context files" before acting.');
    lines.push('2. Continue the work described in the most recent thought.');
    lines.push('3. Honor skill statuses: `ENABLED` use freely, `ASK` require explicit user confirmation each time, `DISABLED` must not be used.');
    lines.push('4. When you reach a non-trivial decision, append a thought to `.aicb/state.json` (modelId + text + sourceReference if relevant).');

    return lines.join('\n');
  }

  private formatPin(f: PinnedFile, root: string | undefined): string {
    const rel = root ? path.relative(root, f.path) : f.path;
    const tag = f.role === 'spec' || f.auto === 'spec' ? ' _(spec)_' : f.auto ? ` _(auto:${f.auto})_` : '';
    const note = f.note ? ` — ${f.note}` : '';
    return `\`${rel}\`${tag}${note}`;
  }

  private formatThought(t: Thought, root: string | undefined): string {
    const ts = new Date(t.timestamp).toISOString().replace('T', ' ').slice(0, 19);
    const ref = t.sourceReference
      ? ` _(${root ? path.relative(root, t.sourceReference) : t.sourceReference})_`
      : '';
    return `- **[${t.modelId}]** ${ts}${ref}\n  > ${t.text.replace(/\n/g, '\n  > ')}`;
  }
}

function readExcerpt(filePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip YAML frontmatter to skip metadata that already appears in the skill list.
    const stripped = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
    const trimmed = stripped.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.length <= SKILL_EXCERPT_CHARS) {
      return trimmed;
    }
    return trimmed.slice(0, SKILL_EXCERPT_CHARS).replace(/\s+\S*$/, '') + '\n\n…_(truncated)_';
  } catch {
    return undefined;
  }
}

function groupBy<T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = out.get(key) ?? [];
    arr.push(item);
    out.set(key, arr);
  }
  return out;
}
