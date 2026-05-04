import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { PinnedFile, Skill, Thought } from '../memory/types';

export class HandoffPromptBuilder {
  constructor(private readonly memory: MemoryManager) {}

  build(thoughtLimit = 8): string {
    const state = this.memory.getState();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const lines: string[] = [];

    lines.push('# AI Context Bridge — Handoff');
    lines.push('');
    if (root) {
      lines.push(`Workspace: \`${root}\``);
    }
    lines.push(`Generated: ${new Date().toISOString()}`);
    if (state.killSwitchEngaged) {
      lines.push('Kill switch: **ENGAGED** (treat all skills as DISABLED)');
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
