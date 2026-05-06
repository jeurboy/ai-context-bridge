import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentBridgeWriter, BridgeFlushResult, resolveAgentFilePath } from './bridge/AgentBridgeWriter';
import { BootstrapPromptBuilder } from './bridge/BootstrapPromptBuilder';
import { HandoffPromptBuilder } from './bridge/HandoffPromptBuilder';
import { ReloadPromptBuilder } from './bridge/ReloadPromptBuilder';
import { McpAdapterWriter, CopyTarget } from './bridge/McpAdapterWriter';
import { SkillAdapterWriter } from './bridge/SkillAdapterWriter';
import { AutoPinManager } from './discovery/AutoPinManager';
import { McpDiscovery } from './discovery/McpDiscovery';
import { SkillDiscovery } from './discovery/SkillDiscovery';
import { SpecImporter } from './discovery/SpecImporter';
import { MemoryManager } from './memory/MemoryManager';
import { McpServer } from './memory/types';
import { McpTreeProvider } from './views/McpTreeProvider';
import { PinnedDecorationProvider } from './views/PinnedDecorationProvider';
import { PinnedFilesProvider } from './views/PinnedFilesProvider';
import { QuickActionsView } from './views/QuickActionsView';
import { SkillTreeProvider } from './views/SkillTreeProvider';
import { SnapshotProvider } from './views/SnapshotProvider';
import { ThoughtTimelineView } from './views/ThoughtTimelineView';
import { HITLManager } from './safety/HITLManager';
import { ToolFilter } from './safety/ToolFilter';

export interface ContextBridgeApi {
  memory: MemoryManager;
  toolFilter: ToolFilter;
  hitl: HITLManager;
  handoff: HandoffPromptBuilder;
}

export async function activate(context: vscode.ExtensionContext): Promise<ContextBridgeApi> {
  const memory = await MemoryManager.create(context);
  context.subscriptions.push(memory);

  const toolFilter = new ToolFilter(memory);
  const hitl = new HITLManager(memory);

  // MCP discovery (used by tree provider below)
  const mcpDiscovery = new McpDiscovery();
  mcpDiscovery.start();
  context.subscriptions.push(mcpDiscovery);

  // Tree views
  const skillTree = new SkillTreeProvider(memory);
  const pinnedTree = new PinnedFilesProvider(memory);
  const snapshotTree = new SnapshotProvider(memory);
  const mcpTree = new McpTreeProvider(mcpDiscovery);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QuickActionsView.viewId, new QuickActionsView()),
    vscode.window.registerTreeDataProvider('aiContextBridge.skills', skillTree),
    vscode.window.registerTreeDataProvider('aiContextBridge.pinned', pinnedTree),
    vscode.window.registerTreeDataProvider('aiContextBridge.snapshots', snapshotTree),
    vscode.window.registerTreeDataProvider('aiContextBridge.mcp', mcpTree),
  );

  // Decorations
  const decorations = new PinnedDecorationProvider(memory);
  context.subscriptions.push(decorations);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorations));

  // Webview
  const timeline = new ThoughtTimelineView(memory, context.extensionUri);
  context.subscriptions.push({ dispose: () => timeline.dispose() });

  // Auto-discovery
  const skillDiscovery = new SkillDiscovery(memory);
  skillDiscovery.start();
  context.subscriptions.push(skillDiscovery);

  const autoPin = new AutoPinManager(memory);
  autoPin.start();
  context.subscriptions.push(autoPin);

  const specImporter = new SpecImporter(memory);
  specImporter.start();
  context.subscriptions.push(specImporter);

  // Bridge
  const handoff = new HandoffPromptBuilder(memory);
  const bridgeWriter = new AgentBridgeWriter(memory, handoff);
  bridgeWriter.start();
  context.subscriptions.push(bridgeWriter);

  const skillAdapter = new SkillAdapterWriter(memory);
  skillAdapter.start();
  context.subscriptions.push(skillAdapter);

  // Status bar — global controls visible everywhere
  const syncAllBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
  syncAllBar.command = 'aiContextBridge.syncAllNow';
  const syncBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  syncBar.command = 'aiContextBridge.forceSync';
  const timelineBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  timelineBar.command = 'aiContextBridge.openTimeline';
  context.subscriptions.push(syncAllBar, syncBar, timelineBar);

  const updateStatus = () => {
    const s = memory.getState();
    const skills = s.skills.length;
    const pinned = s.pinnedFiles.length;
    const thoughts = s.thoughts.length;

    syncAllBar.text = '$(sync) Sync All';
    syncAllBar.tooltip = new vscode.MarkdownString(
      '**Sync All Now** — bridge context md, mirror skills cross-agent, refresh MCP inventory.\n\nClick to run.',
    );

    syncBar.text = `$(brain) ${skills} skills · ${pinned} pinned · ${thoughts} thoughts`;
    syncBar.tooltip = new vscode.MarkdownString(
      `**AI Context Bridge**\n\n- Last synced: ${s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : 'never'}\n\nClick to force-persist state.json.`,
    );

    timelineBar.text = '$(timeline-view-icon) Timeline';
    timelineBar.tooltip = 'Open Thought Timeline';
  };
  updateStatus();
  syncAllBar.show();
  syncBar.show();
  timelineBar.show();
  context.subscriptions.push(memory.onDidChange(updateStatus));

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aiContextBridge.openTimeline', () => timeline.show()),
    vscode.commands.registerCommand('aiContextBridge.forceSync', async () => {
      await memory.forceSync();
      vscode.window.setStatusBarMessage('AI Context Bridge: synced', 1500);
    }),
    vscode.commands.registerCommand('aiContextBridge.pinFile', (uri?: vscode.Uri) =>
      pinCurrentFile(memory, uri),
    ),
    vscode.commands.registerCommand('aiContextBridge.unpinFile', (target: unknown) =>
      unpinCommand(memory, target),
    ),
    vscode.commands.registerCommand('aiContextBridge.addThought', () => addThoughtPrompt(memory)),
    vscode.commands.registerCommand('aiContextBridge.createSnapshot', () => createSnapshotPrompt(memory)),
    vscode.commands.registerCommand('aiContextBridge.restoreSnapshot', (target: unknown) =>
      restoreSnapshotCommand(memory, target),
    ),
    vscode.commands.registerCommand('aiContextBridge.deleteSnapshot', (target: unknown) =>
      deleteSnapshotCommand(memory, target),
    ),
    vscode.commands.registerCommand('aiContextBridge.copyContext', async (id: string) => {
      const t = memory.getState().thoughts.find((x) => x.id === id);
      if (t) {
        await vscode.env.clipboard.writeText(t.text);
      }
    }),
    vscode.commands.registerCommand('aiContextBridge.copyHandoffPrompt', async () => {
      const md = handoff.build();
      await vscode.env.clipboard.writeText(md);
      vscode.window.showInformationMessage(
        'Handoff prompt copied — paste into your next agent to bridge context.',
      );
    }),
    vscode.commands.registerCommand('aiContextBridge.copyBootstrapPrompt', async () => {
      const md = new BootstrapPromptBuilder(memory, mcpDiscovery).build();
      await vscode.env.clipboard.writeText(md);
      vscode.window.showInformationMessage(
        'Bootstrap prompt copied — paste into an agent that needs to read the context/skill/MCP files itself (Codex CLI, Aider, etc.).',
      );
    }),
    vscode.commands.registerCommand('aiContextBridge.copyReloadPrompt', async () => {
      const md = new ReloadPromptBuilder(memory, mcpDiscovery).build();
      await vscode.env.clipboard.writeText(md);
      vscode.window.showInformationMessage(
        'Reload prompt copied — paste into the new agent to refresh bridged context after a switch.',
      );
    }),
    vscode.commands.registerCommand('aiContextBridge.bridgeNow', () =>
      runSyncAllNow(bridgeWriter, skillAdapter, mcpDiscovery),
    ),
    vscode.commands.registerCommand('aiContextBridge.syncAllNow', () =>
      runSyncAllNow(bridgeWriter, skillAdapter, mcpDiscovery),
    ),
    vscode.commands.registerCommand('aiContextBridge.rescanSpecs', async () => {
      await specImporter.scan();
      vscode.window.setStatusBarMessage('AI Context Bridge: spec rescan complete', 2000);
    }),
    vscode.commands.registerCommand('aiContextBridge.rescanSkills', async () => {
      const count = await skillDiscovery.rescan();
      vscode.window.setStatusBarMessage(
        `AI Context Bridge: rescanned skills (${count} found)`,
        2000,
      );
    }),
    vscode.commands.registerCommand('aiContextBridge.rescanMcp', async () => {
      const count = await mcpDiscovery.rescan();
      vscode.window.setStatusBarMessage(
        `AI Context Bridge: rescanned MCP servers (${count} found)`,
        2000,
      );
    }),
    vscode.commands.registerCommand('aiContextBridge.copyMcpServer', async (ctx: unknown) => {
      const server = resolveMcpServer(ctx, mcpDiscovery.getServers());
      if (!server) {
        vscode.window.showInformationMessage(
          'Select an MCP server in the MCP Servers view first.',
        );
        return;
      }
      await runCopyMcpServer(server, mcpDiscovery);
    }),
    vscode.commands.registerCommand('aiContextBridge.syncAllToKilocode', () =>
      runSyncAllToKilocode(memory, mcpDiscovery, skillAdapter, bridgeWriter),
    ),
    vscode.commands.registerCommand('aiContextBridge.configureTargets', () =>
      runConfigureTargets(),
    ),
    vscode.commands.registerCommand('aiContextBridge.configureSkillMirrorHosts', () =>
      runConfigureSkillMirrorHosts(),
    ),
    vscode.commands.registerCommand('aiContextBridge.configureContextHosts', () =>
      runConfigureContextHosts(),
    ),
    vscode.commands.registerCommand('aiContextBridge.mirrorSkillsNow', async () => {
      const cfg = vscode.workspace.getConfiguration('aiContextBridge');
      let force = false;
      if (!cfg.get<boolean>('mirrorSkillsToOtherAgents', false)) {
        const choice = await vscode.window.showInformationMessage(
          'Mirror skills across .claude/commands, .cursor/rules, and .gemini/skills?',
          'Enable & mirror',
          'Mirror once',
          'Cancel',
        );
        if (choice === 'Cancel' || !choice) {
          return;
        }
        if (choice === 'Enable & mirror') {
          try {
            await cfg.update(
              'mirrorSkillsToOtherAgents',
              true,
              vscode.ConfigurationTarget.Workspace,
            );
          } catch (err) {
            vscode.window.showWarningMessage(
              `Couldn't persist setting (${err instanceof Error ? err.message : String(err)}). Mirroring once.`,
            );
            force = true;
          }
        } else {
          force = true;
        }
      }
      const result = await skillAdapter.flushNow({ force });
      const parts: string[] = [];
      if (result.written.length > 0) {
        parts.push(`wrote ${result.written.length}`);
      }
      if (result.pruned.length > 0) {
        parts.push(`pruned ${result.pruned.length}`);
      }
      if (result.skipped.length > 0) {
        parts.push(`skipped ${result.skipped.length}`);
      }
      vscode.window.showInformationMessage(
        parts.length === 0
          ? 'Skill mirror: nothing to do.'
          : `Skill mirror: ${parts.join(', ')}.`,
      );
    }),
  );

  return { memory, toolFilter, hitl, handoff };
}

export function deactivate(): void {
  // disposables run automatically
}

const SKILL_MIRROR_HOSTS = [
  { id: 'cursor', label: 'Cursor', detail: 'writes .cursor/rules/aicb-*.mdc' },
  { id: 'gemini', label: 'Gemini', detail: 'writes .gemini/skills/aicb-*.md' },
  { id: 'claude', label: 'Claude (commands)', detail: 'writes .claude/commands/aicb-*.md (Gemini → Claude only)' },
  { id: 'kilocode', label: 'Kilocode', detail: 'writes .kilocode/skills/aicb-<id>/SKILL.md' },
  { id: 'codex', label: 'Codex', detail: 'writes .codex/skills/aicb-<id>/SKILL.md' },
  { id: 'agent', label: 'Agent (.agent)', detail: 'writes .agent/skills/aicb-<id>/SKILL.md' },
];

async function runConfigureSkillMirrorHosts(): Promise<void> {
  await runConfigureTargets();
}

const CONTEXT_HOST_FILES: { id: string; label: string; files: string[]; detail: string }[] = [
  { id: 'claude', label: 'Claude Code / Desktop', files: ['CLAUDE.md'], detail: 'CLAUDE.md' },
  {
    id: 'codex-project',
    label: 'OpenAI Codex (project AGENTS.md)',
    files: ['AGENTS.md'],
    detail: 'AGENTS.md at repo root — Codex spec',
  },
  {
    id: 'codex-global',
    label: 'OpenAI Codex (global guidance)',
    files: ['$CODEX_HOME/AGENTS.md'],
    detail: '~/.codex/AGENTS.md — applies to every project Codex sees on this machine',
  },
  {
    id: 'agents-sdk',
    label: 'Agents SDK / generic AGENTS.md',
    files: ['AGENT.md'],
    detail: 'AGENT.md (legacy / non-Codex agents)',
  },
  { id: 'gemini', label: 'Gemini', files: ['GEMINI.md'], detail: 'GEMINI.md' },
  { id: 'cursor', label: 'Cursor', files: ['.cursorrules'], detail: '.cursorrules' },
  { id: 'windsurf', label: 'Windsurf', files: ['.windsurfrules'], detail: '.windsurfrules' },
  { id: 'copilot', label: 'GitHub Copilot', files: ['.github/copilot-instructions.md'], detail: '.github/copilot-instructions.md' },
  { id: 'kilocode', label: 'Kilocode', files: ['.kilocoderules', '.kilocode/rules/aicb.md'], detail: '.kilocoderules + .kilocode/rules/aicb.md' },
  { id: 'agent', label: 'Agent (.agent)', files: ['.agent/AGENTS.md', '.agent/rules/aicb.md'], detail: '.agent/AGENTS.md + .agent/rules/aicb.md' },
];

type TargetPickerKind = 'skill' | 'context' | 'mcp';

type TargetPickerItem = vscode.QuickPickItem & {
  targetKind?: TargetPickerKind;
  id?: string;
  files?: string[];
  mcpTarget?: CopyTarget;
};

async function runConfigureTargets(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aiContextBridge');
  const currentSkillHosts = cfg.get<string[]>(
    'skillMirrorHosts',
    SKILL_MIRROR_HOSTS.map((h) => h.id),
  );
  const currentAgentFiles = cfg.get<string[]>('agentFiles', []);
  const currentAgentFileSet = new Set(currentAgentFiles);
  const currentMcpTargets = cfg.get<string[]>('mcpCopyTargets', []);
  const currentMcpTargetSet = new Set(currentMcpTargets);
  const mcpTargets = new McpAdapterWriter().listTargets();

  const items: TargetPickerItem[] = [
    { label: 'Skill mirror targets', kind: vscode.QuickPickItemKind.Separator },
    ...SKILL_MIRROR_HOSTS.map((h) => ({
      label: `$(tools) Skill · ${h.label}`,
      description: h.id,
      detail: h.detail,
      picked: currentSkillHosts.includes(h.id),
      targetKind: 'skill' as const,
      id: h.id,
    })),
    { label: 'Context bridge targets', kind: vscode.QuickPickItemKind.Separator },
    ...CONTEXT_HOST_FILES.map((h) => ({
      label: `$(file-code) Context · ${h.label}`,
      description: h.id,
      detail: h.detail,
      picked: h.files.some((f) => currentAgentFileSet.has(f)),
      targetKind: 'context' as const,
      id: h.id,
      files: h.files,
    })),
    { label: 'MCP copy targets', kind: vscode.QuickPickItemKind.Separator },
    ...mcpTargets.map((t) => ({
      label: `$(server) MCP · ${t.label}`,
      description: existsHint(t),
      detail: t.filePath,
      picked: currentMcpTargetSet.has(t.id),
      targetKind: 'mcp' as const,
      id: t.id,
      mcpTarget: t,
    })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'AI Context Bridge: Target Settings',
    placeHolder: 'Select skill mirror, context bridge, and MCP copy targets',
  });
  if (!picked) return;

  const selected = picked.filter(isTargetPickerItem);
  const nextSkillHosts = selected
    .filter((p) => p.targetKind === 'skill')
    .map((p) => p.id);
  const knownContextFiles = new Set(CONTEXT_HOST_FILES.flatMap((h) => h.files));
  const customContextFiles = currentAgentFiles.filter((f) => !knownContextFiles.has(f));
  const selectedContextTargets = selected.filter((p) => p.targetKind === 'context');
  const selectedContextFiles = selectedContextTargets.flatMap((p) => p.files ?? []);
  const nextAgentFiles = Array.from(
    new Set([...selectedContextFiles, ...customContextFiles]),
  );
  const nextMcpTargets = selected
    .filter((p) => p.targetKind === 'mcp')
    .map((p) => p.id);
  const skillTargetsChanged = !sameStringSet(currentSkillHosts, nextSkillHosts);
  const contextTargetsChanged = !sameStringSet(currentAgentFiles, nextAgentFiles);
  const mcpTargetsChanged = !sameStringSet(currentMcpTargets, nextMcpTargets);

  if (skillTargetsChanged) {
    await cfg.update('skillMirrorHosts', nextSkillHosts, vscode.ConfigurationTarget.Workspace);
  }
  if (contextTargetsChanged) {
    await cfg.update('agentFiles', nextAgentFiles, vscode.ConfigurationTarget.Workspace);
  }
  if (mcpTargetsChanged) {
    await cfg.update('mcpCopyTargets', nextMcpTargets, vscode.ConfigurationTarget.Workspace);
  }

  await maybeEnableSelectedTargetFeatures(cfg, nextSkillHosts, nextAgentFiles, {
    skillTargetsChanged,
    contextTargetsChanged,
  });
  if (contextTargetsChanged) {
    await maybeCreateContextStubs(nextAgentFiles);
  }

  const customSuffix =
    customContextFiles.length > 0 ? ` (+${customContextFiles.length} custom)` : '';
  vscode.window.showInformationMessage(
    `Target settings saved — Skills: ${nextSkillHosts.length}; Context: ${selectedContextTargets.length}${customSuffix}; MCP: ${nextMcpTargets.length}.`,
  );
}

function isTargetPickerItem(
  item: TargetPickerItem,
): item is TargetPickerItem & { targetKind: TargetPickerKind; id: string } {
  return typeof item.targetKind === 'string' && typeof item.id === 'string';
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((value) => left.has(value));
}

async function maybeEnableSelectedTargetFeatures(
  cfg: vscode.WorkspaceConfiguration,
  skillHosts: string[],
  agentFiles: string[],
  changed: { skillTargetsChanged: boolean; contextTargetsChanged: boolean },
): Promise<void> {
  const off: string[] = [];
  if (
    changed.skillTargetsChanged &&
    skillHosts.length > 0 &&
    !cfg.get<boolean>('mirrorSkillsToOtherAgents', false)
  ) {
    off.push('skill mirroring');
  }
  if (
    changed.contextTargetsChanged &&
    agentFiles.length > 0 &&
    !cfg.get<boolean>('exportToAgentFiles', false)
  ) {
    off.push('context export');
  }
  if (off.length === 0) return;

  const choice = await vscode.window.showInformationMessage(
    `Selected targets include ${off.join(' and ')}, but that feature is currently OFF. Turn it on now?`,
    'Turn On',
    'Leave Off',
  );
  if (choice !== 'Turn On') return;

  if (skillHosts.length > 0) {
    await cfg.update('mirrorSkillsToOtherAgents', true, vscode.ConfigurationTarget.Workspace);
  }
  if (agentFiles.length > 0) {
    await cfg.update('exportToAgentFiles', true, vscode.ConfigurationTarget.Workspace);
  }
}

async function maybeCreateContextStubs(agentFiles: string[]): Promise<void> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws || agentFiles.length === 0) return;

  const missing: string[] = [];
  for (const f of agentFiles) {
    const abs = resolveAgentFilePath(f, ws);
    try {
      await fs.promises.access(abs);
    } catch {
      missing.push(f);
    }
  }
  if (missing.length === 0) return;

  const choice = await vscode.window.showInformationMessage(
    `${missing.length} target file(s) don't exist yet:\n${missing.join('\n')}\n\nWith 'agentFilesOnlyExisting: true', the bridge skips missing files. Create empty stubs so they receive the handoff block?`,
    { modal: true },
    'Create stubs',
    'Skip',
  );
  if (choice !== 'Create stubs') return;

  for (const f of missing) {
    const abs = resolveAgentFilePath(f, ws);
    try {
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, '', 'utf8');
    } catch {
      // ignore individual failures (permission etc.)
    }
  }
}

async function runSyncAllNow(
  bridgeWriter: AgentBridgeWriter,
  skillAdapter: SkillAdapterWriter,
  mcpDiscovery: McpDiscovery,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aiContextBridge');
  const exportOn = cfg.get<boolean>('exportToAgentFiles', false);
  const mirrorOn = cfg.get<boolean>('mirrorSkillsToOtherAgents', false);

  if (!exportOn || !mirrorOn) {
    const offSettings: string[] = [];
    if (!exportOn) offSettings.push('exportToAgentFiles');
    if (!mirrorOn) offSettings.push('mirrorSkillsToOtherAgents');
    const choice = await vscode.window.showInformationMessage(
      `Sync All needs auto-export turned on:\n  • ${offSettings.join('\n  • ')}\n\nEnable and continue, or sync once without changing settings?`,
      { modal: true },
      'Enable & sync',
      'Sync once',
      'Cancel',
    );
    if (!choice || choice === 'Cancel') return;
    if (choice === 'Enable & sync') {
      try {
        if (!exportOn) {
          await cfg.update('exportToAgentFiles', true, vscode.ConfigurationTarget.Workspace);
        }
        if (!mirrorOn) {
          await cfg.update('mirrorSkillsToOtherAgents', true, vscode.ConfigurationTarget.Workspace);
        }
      } catch {
        // fall through and force-sync once
      }
    }
  }

  const lines: string[] = [];

  // ---- 1. Context md (with create-stubs flow on missing) ----
  let bridgeRes = await bridgeWriter.flushNow({ force: true });
  await reportBridgeResult(bridgeRes, async () => {
    bridgeRes = await bridgeWriter.flushNow({ force: true });
    return bridgeRes;
  }, { silent: true });
  lines.push(`Context: ${formatBridgeSummary(bridgeRes)}`);

  // ---- 2. Skills mirror (workspace + global per setting) ----
  const skillRes = await skillAdapter.flushNow({ force: true });
  lines.push(
    `Skills: ${skillRes.written.length} written, ${skillRes.skipped.length} skipped, ${skillRes.pruned.length} pruned`,
  );

  // ---- 3. MCP — optional, since bulk propagation is destructive ----
  const servers = mcpDiscovery.getServers();
  await mcpDiscovery.rescan();
  lines.push(
    `MCP: ${servers.length} server(s) discovered (use the MCP Servers panel to copy across hosts)`,
  );

  vscode.window.showInformationMessage(`Sync All:\n${lines.join('\n')}`, { modal: false });
}

async function reportBridgeResult(
  result: BridgeFlushResult,
  rerun: () => Promise<BridgeFlushResult>,
  opts?: { silent?: boolean },
): Promise<void> {
  if (result.written.length === 0 && result.skipped.length === 0) {
    if (!opts?.silent) {
      vscode.window.showInformationMessage('Bridge: no agent files to update.');
    }
    return;
  }

  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const missing: string[] = [];
  if (ws) {
    for (const rel of result.skipped) {
      const abs = resolveAgentFilePath(rel, ws);
      try {
        await fs.promises.access(abs);
      } catch {
        missing.push(rel);
      }
    }
  }

  const summary = result.written.length
    ? `Bridge: updated ${result.written.length} agent file${result.written.length === 1 ? '' : 's'} — ${result.written.join(', ')}.`
    : `Bridge: 0 written, ${result.skipped.length} skipped.`;

  if (missing.length === 0) {
    if (opts?.silent) return;
    if (result.written.length === 0) {
      vscode.window.showWarningMessage(`${summary} (skipped: ${result.skipped.join(', ')})`);
    } else {
      vscode.window.showInformationMessage(summary);
    }
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `${summary}\n\n${missing.length} target file(s) don't exist yet — bridge skipped them because 'agentFilesOnlyExisting' is true:\n${missing.join('\n')}\n\nCreate empty stubs and bridge again?`,
    { modal: true },
    'Create stubs & retry',
    'Skip',
  );
  if (choice !== 'Create stubs & retry') return;

  if (!ws) return;
  const created: string[] = [];
  for (const rel of missing) {
    const abs = resolveAgentFilePath(rel, ws);
    try {
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, '', 'utf8');
      created.push(rel);
    } catch {
      // ignore individual failures
    }
  }
  const after = await rerun();
  vscode.window.showInformationMessage(
    `Created ${created.length} stub${created.length === 1 ? '' : 's'}. Bridge: updated ${after.written.length} agent file${after.written.length === 1 ? '' : 's'}.`,
  );
}

function formatBridgeSummary(result: BridgeFlushResult): string {
  const parts = [
    `${result.written.length} written`,
    `${result.skipped.length} skipped`,
  ];
  if (result.repaired.length > 0) {
    parts.push(`${result.repaired.length} repaired`);
  }
  if (result.conflicts.length > 0) {
    parts.push(`${result.conflicts.length} manual block overwritten`);
  }
  if (result.preservedManual.length > 0) {
    parts.push(`${result.preservedManual.length} manual block preserved`);
  }
  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} malformed marker warning`);
  }
  return parts.join(', ');
}

async function runConfigureContextHosts(): Promise<void> {
  await runConfigureTargets();
}

async function runSyncAllToKilocode(
  memory: MemoryManager,
  mcpDiscovery: McpDiscovery,
  skillAdapter: SkillAdapterWriter,
  bridgeWriter: AgentBridgeWriter,
): Promise<void> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) {
    vscode.window.showWarningMessage('Open a workspace first — Kilocode sync writes into the workspace.');
    return;
  }
  const writer = new McpAdapterWriter();
  const allTargets = writer.listTargets();
  const kilocodeTargets = allTargets.filter((t) => t.host === 'kilocode');
  const configuredMcpTargets = new Set(
    vscode.workspace.getConfiguration('aiContextBridge').get<string[]>('mcpCopyTargets', []),
  );
  const items = kilocodeTargets.map((t) => ({
    label: t.label,
    description: existsHint(t),
    picked: configuredMcpTargets.has(t.id),
    target: t,
  }));
  const pickedTargets = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Sync All → Kilocode: pick destinations',
    placeHolder: 'Workspace target is recommended; global targets only if Kilocode is installed',
  });
  if (!pickedTargets || pickedTargets.length === 0) return;

  const confirm = await vscode.window.showWarningMessage(
    'This will:\n' +
      `  • copy ALL ${mcpDiscovery.getServers().length} MCP servers (incl. plaintext env vars) into the selected Kilocode config(s)\n` +
      '  • mirror all workspace skills into .kilocode/skills/\n' +
      '  • write the AICB handoff section into .kilocoderules and .kilocode/rules/aicb.md\n\n' +
      'Continue?',
    { modal: true },
    'Sync',
    'Cancel',
  );
  if (confirm !== 'Sync') return;

  const lines: string[] = [];

  // ---- 1. MCP servers ----
  const servers = dedupeByName(mcpDiscovery.getServers());
  let mcpWritten = 0;
  let mcpSkipped = 0;
  let mcpError = 0;
  for (const server of servers) {
    const results = await writer.copyServer(
      server,
      pickedTargets.map((p) => p.target),
      async () => true, // overwrite hand-authored silently in bulk mode
    );
    for (const r of results) {
      if (r.status === 'error') mcpError++;
      else if (r.status === 'skipped') mcpSkipped++;
      else mcpWritten++;
    }
  }
  lines.push(
    `MCP: ${mcpWritten} written, ${mcpSkipped} skipped, ${mcpError} error · across ${pickedTargets.length} target(s)`,
  );

  // ---- 2. Skills mirror (workspace) ----
  const skillResult = await skillAdapter.flushNow({ force: true });
  lines.push(
    `Skills: ${skillResult.written.length} written, ${skillResult.skipped.length} skipped, ${skillResult.pruned.length} pruned`,
  );

  // ---- 3. Handoff context to .kilocoderules + .kilocode/rules/aicb.md ----
  const cfg = vscode.workspace.getConfiguration('aiContextBridge');
  const agentFiles = cfg.get<string[]>('agentFiles', []);
  const ensure = ['.kilocoderules', '.kilocode/rules/aicb.md'];
  let updatedList = false;
  const merged = agentFiles.slice();
  for (const f of ensure) {
    if (!merged.includes(f)) {
      merged.push(f);
      updatedList = true;
    }
  }
  if (updatedList) {
    await cfg.update('agentFiles', merged, vscode.ConfigurationTarget.Workspace);
  }
  // Allow auto-creation just for this sync so missing files get created.
  const onlyExisting = cfg.get<boolean>('agentFilesOnlyExisting', true);
  if (onlyExisting) {
    await cfg.update('agentFilesOnlyExisting', false, vscode.ConfigurationTarget.Workspace);
  }
  try {
    const ctx = await bridgeWriter.flushNow({ force: true });
    lines.push(`Context: ${formatBridgeSummary(ctx)}`);
  } finally {
    if (onlyExisting) {
      await cfg.update('agentFilesOnlyExisting', true, vscode.ConfigurationTarget.Workspace);
    }
  }

  await mcpDiscovery.rescan();
  memory.addThought({
    modelId: 'aicb',
    text: `Sync All → Kilocode\n${lines.join('\n')}`,
  });
  vscode.window.showInformationMessage(`Kilocode sync complete:\n${lines.join('\n')}`, { modal: false });
}

function dedupeByName(servers: McpServer[]): McpServer[] {
  const out: McpServer[] = [];
  const seen = new Set<string>();
  // Prefer workspace > global so workspace overrides win when names collide.
  const sorted = servers
    .slice()
    .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'workspace' ? -1 : 1));
  for (const s of sorted) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

function resolveMcpServer(input: unknown, all: McpServer[]): McpServer | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as { server?: McpServer; id?: string };
  if (obj.server && obj.server.id) return obj.server;
  if (typeof obj.id === 'string') return all.find((s) => s.id === obj.id);
  return undefined;
}

async function runCopyMcpServer(server: McpServer, mcpDiscovery: McpDiscovery): Promise<void> {
  const writer = new McpAdapterWriter();
  const targets = writer.listTargets({ host: server.host, scope: server.scope });
  if (targets.length === 0) {
    vscode.window.showInformationMessage('No copy targets available.');
    return;
  }
  const configuredMcpTargets = new Set(
    vscode.workspace.getConfiguration('aiContextBridge').get<string[]>('mcpCopyTargets', []),
  );
  const items = targets.map((t) => ({
    label: t.label,
    description: existsHint(t),
    picked: configuredMcpTargets.has(t.id),
    target: t,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `Copy MCP server "${server.name}" to…`,
    placeHolder: 'Select one or more target host configs',
  });
  if (!picked || picked.length === 0) return;

  const hasSecrets =
    server.env && Object.keys(server.env).some((k) => /(KEY|TOKEN|SECRET|PASS|CREDENTIAL)/i.test(k));
  if (hasSecrets) {
    const choice = await vscode.window.showWarningMessage(
      `"${server.name}" contains environment variables that look like secrets. They will be written in plaintext to ${picked.length} target file(s). Continue?`,
      { modal: true },
      'Continue',
      'Cancel',
    );
    if (choice !== 'Continue') return;
  }

  const results = await writer.copyServer(
    server,
    picked.map((p) => p.target),
    async (_prior, target) => {
      const choice = await vscode.window.showWarningMessage(
        `"${server.name}" already exists in:\n${target.label}\n(hand-authored — no AICB marker). Overwrite?`,
        { modal: true },
        'Overwrite',
        'Skip',
      );
      return choice === 'Overwrite';
    },
  );

  const lines = results.map((r) => {
    const tag =
      r.status === 'written'
        ? '✓ written'
        : r.status === 'overwrote-aicb'
        ? '✓ updated (aicb)'
        : r.status === 'overwrote-handauthored'
        ? '✓ overwrote'
        : r.status === 'skipped'
        ? '— skipped'
        : `✗ error${r.error ? `: ${r.error}` : ''}`;
    return `${tag} · ${r.target.label}`;
  });
  await mcpDiscovery.rescan();
  vscode.window.showInformationMessage(`Copy "${server.name}":\n${lines.join('\n')}`, { modal: false });
}

function existsHint(t: CopyTarget): string {
  try {
    return fs.existsSync(t.filePath) ? 'exists' : 'will create';
  } catch {
    return '';
  }
}


async function pinCurrentFile(memory: MemoryManager, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target || target.scheme !== 'file') {
    vscode.window.showInformationMessage('Open a file before pinning.');
    return;
  }
  if (memory.isPinned(target.fsPath)) {
    memory.unpinFile(target.fsPath);
    vscode.window.setStatusBarMessage(`Unpinned ${target.fsPath}`, 2000);
    return;
  }
  const note = await vscode.window.showInputBox({
    prompt: 'Optional note for the pinned file',
    placeHolder: 'why is this file in working memory?',
  });
  const defaultOwner = inferActiveOwner(memory);
  const pinnedBy =
    (await vscode.window.showInputBox({
      prompt: 'Pinned by which model?',
      value: defaultOwner,
      valueSelection: [0, defaultOwner.length],
    })) ?? defaultOwner;
  memory.pinFile({ path: target.fsPath, pinnedBy, note });
}

function unpinCommand(memory: MemoryManager, target: unknown): void {
  let filePath: string | undefined;
  if (typeof target === 'string') {
    filePath = target;
  } else if (target && typeof target === 'object') {
    const obj = target as { file?: { path?: string }; resourceUri?: vscode.Uri };
    filePath = obj.file?.path ?? obj.resourceUri?.fsPath;
  }
  if (!filePath) {
    return;
  }
  memory.unpinFile(filePath);
}

async function addThoughtPrompt(memory: MemoryManager): Promise<void> {
  const defaultOwner = inferActiveOwner(memory);
  const modelId = await vscode.window.showInputBox({
    prompt: 'Model id (e.g. claude-opus-4-7, gpt-5)',
    value: defaultOwner,
    valueSelection: [0, defaultOwner.length],
  });
  if (!modelId) {
    return;
  }
  const text = await vscode.window.showInputBox({
    prompt: 'Thought text',
    placeHolder: 'what should the next AI know?',
  });
  if (!text) {
    return;
  }
  const sourceReference = vscode.window.activeTextEditor?.document.uri.fsPath;
  memory.addThought({ modelId, text, sourceReference });
}

function inferActiveOwner(memory: MemoryManager): string {
  const thoughts = memory.getState().thoughts;
  if (thoughts.length > 0) {
    return thoughts[thoughts.length - 1].modelId;
  }
  const aiSkill = memory
    .getState()
    .skills.find((s) => /^(anysphere|google\.antigravity|anthropic|openai|github\.copilot|cursor|kilocode|continue|codeium|gemini)/i.test(s.id));
  if (aiSkill?.ownerModelId) {
    return aiSkill.ownerModelId;
  }
  if (aiSkill) {
    return aiSkill.id;
  }
  return 'user';
}

async function createSnapshotPrompt(memory: MemoryManager): Promise<void> {
  const label = await vscode.window.showInputBox({
    prompt: 'Snapshot label',
    value: `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  });
  if (!label) {
    return;
  }
  const snap = memory.createSnapshot(label);
  vscode.window.setStatusBarMessage(`Snapshot saved: ${snap.label}`, 2500);
}

async function restoreSnapshotCommand(memory: MemoryManager, target: unknown): Promise<void> {
  let id: string | undefined;
  if (typeof target === 'string') {
    id = target;
  } else if (target && typeof target === 'object') {
    const obj = target as { snapshot?: { id?: string }; id?: string };
    id = obj.snapshot?.id ?? obj.id;
  }
  if (!id) {
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    'Restoring will overwrite current memory state. Continue?',
    { modal: true },
    'Restore',
  );
  if (choice !== 'Restore') {
    return;
  }
  memory.restoreSnapshot(id);
}

function deleteSnapshotCommand(memory: MemoryManager, target: unknown): void {
  let id: string | undefined;
  if (typeof target === 'string') {
    id = target;
  } else if (target && typeof target === 'object') {
    const obj = target as { snapshot?: { id?: string }; id?: string };
    id = obj.snapshot?.id ?? obj.id;
  }
  if (!id) {
    return;
  }
  memory.deleteSnapshot(id);
}
