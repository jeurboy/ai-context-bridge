import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpDiscovery } from '../discovery/McpDiscovery';
import { MemoryManager } from '../memory/MemoryManager';

/**
 * Builds a "go read these files" prompt — designed for agents that don't auto-load
 * convention files (CLAUDE.md / AGENTS.md / .cursorrules / etc.) but DO have file
 * read access. The prompt lists absolute paths grouped by purpose, so the agent
 * can fetch the actual content itself instead of receiving inlined excerpts.
 *
 * Different from HandoffPromptBuilder which inlines content. Use this when:
 *   - the inlined prompt would exceed the agent's context budget
 *   - you want the agent to read live content (not a snapshot)
 *   - the agent is a CLI tool (Codex, Aider, Continue) that can read files directly
 */
export class BootstrapPromptBuilder {
  constructor(
    private readonly memory: MemoryManager,
    private readonly mcpDiscovery: McpDiscovery,
  ) {}

  build(): string {
    const state = this.memory.getState();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const lines: string[] = [];

    lines.push('# Bootstrap context for this workspace');
    lines.push('');
    lines.push(
      'You are joining an existing project. Before you do any work, **read the files listed below** so you understand the constraints, available tools, and current focus. After reading, briefly summarise what you understood and confirm you are ready.',
    );
    lines.push('');
    if (root) {
      lines.push(`Workspace root: \`${root}\``);
    }
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // ---- 1. Context / spec files ----
    const specs = state.pinnedFiles.filter((f) => f.role === 'spec' || f.auto === 'spec');
    const working = state.pinnedFiles.filter((f) => !(f.role === 'spec' || f.auto === 'spec'));

    if (specs.length > 0) {
      lines.push('## 1. Read these context / spec files first');
      lines.push('');
      for (const f of specs) {
        const exists = safeExists(f.path);
        lines.push(`- \`${f.path}\`${exists ? '' : ' _(missing)_'}${f.note ? ` — ${f.note}` : ''}`);
      }
      lines.push('');
    }

    if (working.length > 0) {
      lines.push('## 2. Working files (current focus)');
      lines.push('');
      for (const f of working) {
        const exists = safeExists(f.path);
        lines.push(`- \`${f.path}\`${exists ? '' : ' _(missing)_'}${f.note ? ` — ${f.note}` : ''}`);
      }
      lines.push('');
    }

    // ---- 3. Skills ----
    const skills = state.skills.filter((s) => s.sourceUri);
    if (skills.length > 0) {
      lines.push('## 3. Skills (read-only — DO NOT INVOKE without honoring status)');
      lines.push('');
      lines.push(
        'Each path below is the source of a skill the user has registered. Read these to understand what the skill does. The status in parens is binding:',
      );
      lines.push('');
      lines.push('- `ENABLED` → you may invoke it without asking');
      lines.push('- `ASK` → confirm with the user **every time** before invoking');
      lines.push('- `DISABLED` → must not be invoked');
      lines.push('');

      const sorted = skills.slice().sort((a, b) => {
        const order = { ENABLED: 0, ASK: 1, DISABLED: 2 } as const;
        return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
      });
      for (const s of sorted) {
        const scope = s.scope === 'global' ? ' · global' : '';
        lines.push(`- \`${s.sourceUri}\` — **${s.name || s.id}** (${s.status}${scope})`);
      }
      lines.push('');
    }

    // ---- 4. MCP servers ----
    const servers = this.mcpDiscovery.getServers();
    if (servers.length > 0) {
      const fileSet = new Set<string>();
      for (const s of servers) fileSet.add(s.sourceUri);
      const filesByHost = new Map<string, string[]>();
      for (const s of servers) {
        const list = filesByHost.get(s.host) ?? [];
        if (!list.includes(s.sourceUri)) list.push(s.sourceUri);
        filesByHost.set(s.host, list);
      }

      lines.push('## 4. MCP server inventory');
      lines.push('');
      lines.push(
        `Available MCP servers come from the config files below (${servers.length} server${servers.length === 1 ? '' : 's'} across ${fileSet.size} file${fileSet.size === 1 ? '' : 's'}). Read whichever apply to your runtime — entries duplicated across hosts are intentional:`,
      );
      lines.push('');
      for (const [host, files] of filesByHost) {
        lines.push(`### ${host}`);
        for (const f of files) {
          const matching = servers.filter((s) => s.sourceUri === f);
          const names = matching.map((s) => s.name).join(', ');
          lines.push(`- \`${f}\` — ${matching.length} server(s): ${names}`);
        }
        lines.push('');
      }
    }

    // ---- 5. Recent thoughts (a hint of current state) ----
    const thoughts = state.thoughts
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
    if (thoughts.length > 0) {
      lines.push('## 5. Most recent thoughts (last few model decisions)');
      lines.push('');
      for (const t of thoughts) {
        const ts = new Date(t.timestamp).toISOString().slice(0, 19).replace('T', ' ');
        lines.push(`- **[${t.modelId}]** ${ts} — ${t.text.replace(/\n/g, ' ')}`);
      }
      lines.push('');
    }

    // ---- Closing ----
    lines.push('---');
    lines.push('');
    lines.push('## After reading');
    lines.push('');
    lines.push('1. Summarise the project, its constraints, and your understanding of the current focus.');
    lines.push('2. List which skills you saw and their statuses.');
    lines.push('3. Acknowledge any DISABLED skills.');
    lines.push('4. Wait for the user\'s instruction before doing any work.');

    return lines.join('\n');
  }
}

function safeExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Keep this import to silence unused-warnings on `path` if future formats need it.
void path;
