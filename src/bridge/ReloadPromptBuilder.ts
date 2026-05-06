import * as path from 'path';
import * as vscode from 'vscode';
import { McpDiscovery } from '../discovery/McpDiscovery';
import { MemoryManager } from '../memory/MemoryManager';

/**
 * Builds a "context has shifted — re-read it" prompt for an agent switch
 * mid-session. Different from BootstrapPrompt (first-time, full file map)
 * and HandoffPrompt (inlined snapshot): this nudges an agent that already
 * worked here to refresh from the live blackboard so it doesn't act on
 * stale assumptions after another agent edited state.
 */
export class ReloadPromptBuilder {
  constructor(
    private readonly memory: MemoryManager,
    private readonly mcpDiscovery: McpDiscovery,
  ) {}

  build(): string {
    const state = this.memory.getState();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const statePath = root ? path.join(root, '.aicb', 'state.json') : '.aicb/state.json';
    const lines: string[] = [];

    lines.push('# Reload bridged context');
    lines.push('');
    lines.push(
      'Another agent has been working on this project since you last had context. **Do not rely on what you remember** — re-read the sources below before answering or editing anything.',
    );
    lines.push('');
    if (root) {
      lines.push(`Workspace root: \`${root}\``);
    }
    lines.push(`Reloaded at: ${new Date().toISOString()}`);
    lines.push('');

    // ---- 1. Blackboard state ----
    lines.push('## 1. Refresh from the blackboard');
    lines.push('');
    lines.push(`- \`${statePath}\` — single source of truth (thoughts, pinned files, skills, snapshots)`);
    lines.push('');

    // ---- 2. Spec / context files ----
    const specs = state.pinnedFiles.filter((f) => f.role === 'spec' || f.auto === 'spec');
    const working = state.pinnedFiles.filter((f) => !(f.role === 'spec' || f.auto === 'spec'));

    if (specs.length > 0) {
      lines.push('## 2. Re-read spec / context files');
      lines.push('');
      for (const f of specs) {
        lines.push(`- \`${f.path}\`${f.note ? ` — ${f.note}` : ''}`);
      }
      lines.push('');
    }

    if (working.length > 0) {
      lines.push('## 3. Working files (current focus)');
      lines.push('');
      for (const f of working) {
        lines.push(`- \`${f.path}\`${f.note ? ` — ${f.note}` : ''}`);
      }
      lines.push('');
    }

    // ---- 4. Recent thoughts (what the previous agent did) ----
    const thoughts = state.thoughts
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
    if (thoughts.length > 0) {
      lines.push('## 4. Recent decisions by other agents');
      lines.push('');
      lines.push('Read these to understand what changed since you last had context:');
      lines.push('');
      for (const t of thoughts) {
        const ts = new Date(t.timestamp).toISOString().slice(0, 19).replace('T', ' ');
        const ref = t.sourceReference ? ` _(${t.sourceReference})_` : '';
        lines.push(`- **[${t.modelId}]** ${ts}${ref} — ${t.text.replace(/\n/g, ' ')}`);
      }
      lines.push('');
    }

    // ---- 5. Skill statuses (binding) ----
    if (state.skills.length > 0) {
      const byStatus = new Map<string, string[]>();
      for (const s of state.skills) {
        const arr = byStatus.get(s.status) ?? [];
        arr.push(s.name || s.id);
        byStatus.set(s.status, arr);
      }
      lines.push('## 5. Current skill statuses (binding)');
      lines.push('');
      for (const status of ['ENABLED', 'ASK', 'DISABLED'] as const) {
        const list = byStatus.get(status);
        if (!list || list.length === 0) {
          continue;
        }
        lines.push(`- **${status}** — ${list.sort((a, b) => a.localeCompare(b)).join(', ')}`);
      }
      lines.push('');
      lines.push(
        '`ENABLED` use freely · `ASK` confirm before each invocation · `DISABLED` must not run.',
      );
      lines.push('');
    }

    // ---- 6. MCP servers ----
    const servers = this.mcpDiscovery.getServers();
    if (servers.length > 0) {
      const fileSet = new Set<string>();
      for (const s of servers) fileSet.add(s.sourceUri);
      lines.push('## 6. MCP servers available');
      lines.push('');
      lines.push(
        `${servers.length} server${servers.length === 1 ? '' : 's'} across ${fileSet.size} config file${fileSet.size === 1 ? '' : 's'}. Re-read whichever apply to your runtime:`,
      );
      lines.push('');
      for (const f of fileSet) {
        const matching = servers.filter((s) => s.sourceUri === f);
        const names = matching.map((s) => s.name).join(', ');
        lines.push(`- \`${f}\` — ${names}`);
      }
      lines.push('');
    }

    // ---- Closing ----
    lines.push('---');
    lines.push('');
    lines.push('## After reloading');
    lines.push('');
    lines.push('1. Summarise what changed since your last context (cite recent thoughts).');
    lines.push('2. Flag any decision in your prior plan that is now invalid.');
    lines.push('3. Wait for the user to confirm before resuming work.');

    return lines.join('\n');
  }
}
