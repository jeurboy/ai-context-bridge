import * as fs from 'fs';
import * as vscode from 'vscode';
import { AgentBridgeWriter } from './bridge/AgentBridgeWriter';
import { HandoffPromptBuilder } from './bridge/HandoffPromptBuilder';
import { McpAdapterWriter, CopyTarget } from './bridge/McpAdapterWriter';
import { SkillAdapterWriter } from './bridge/SkillAdapterWriter';
import { AutoPinManager } from './discovery/AutoPinManager';
import { McpDiscovery } from './discovery/McpDiscovery';
import { SkillDiscovery } from './discovery/SkillDiscovery';
import { SpecImporter } from './discovery/SpecImporter';
import { MemoryManager } from './memory/MemoryManager';
import { McpServer, SkillStatus } from './memory/types';
import { McpTreeProvider } from './views/McpTreeProvider';
import { PinnedDecorationProvider } from './views/PinnedDecorationProvider';
import { PinnedFilesProvider } from './views/PinnedFilesProvider';
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

  // Sync kill switch state into config so it survives reloads
  syncKillSwitchFromConfig(memory);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiContextBridge.killSwitchEngaged')) {
        syncKillSwitchFromConfig(memory);
      }
    }),
  );

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

  // Status bar — three separate clickable items
  const killBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
  killBar.command = 'aiContextBridge.killSwitch';
  const syncBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  syncBar.command = 'aiContextBridge.forceSync';
  const timelineBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  timelineBar.command = 'aiContextBridge.openTimeline';
  context.subscriptions.push(killBar, syncBar, timelineBar);

  const updateStatus = () => {
    const s = memory.getState();
    const skills = s.skills.length;
    const pinned = s.pinnedFiles.length;
    const thoughts = s.thoughts.length;

    killBar.text = s.killSwitchEngaged ? '$(stop-circle) KILL' : '$(shield) Live';
    killBar.tooltip = new vscode.MarkdownString(
      `**Kill Switch:** ${s.killSwitchEngaged ? 'ENGAGED — all skills disabled' : 'off'}\n\nClick to toggle.`,
    );
    killBar.backgroundColor = s.killSwitchEngaged
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;

    syncBar.text = `$(brain) ${skills} skills · ${pinned} pinned · ${thoughts} thoughts`;
    syncBar.tooltip = new vscode.MarkdownString(
      `**AI Context Bridge**\n\n- Last synced: ${s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : 'never'}\n\nClick to force sync.`,
    );

    timelineBar.text = '$(timeline-view-icon) Timeline';
    timelineBar.tooltip = 'Open Thought Timeline';
  };
  updateStatus();
  killBar.show();
  syncBar.show();
  timelineBar.show();
  context.subscriptions.push(memory.onDidChange(updateStatus));

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aiContextBridge.openTimeline', () => timeline.show()),
    vscode.commands.registerCommand('aiContextBridge.killSwitch', () => toggleKillSwitch(memory)),
    vscode.commands.registerCommand('aiContextBridge.forceSync', async () => {
      await memory.forceSync();
      vscode.window.setStatusBarMessage('AI Context Bridge: synced', 1500);
    }),
    vscode.commands.registerCommand('aiContextBridge.toggleSkill', async (idOrCtx: unknown) => {
      if (!(await guardKillSwitch(memory))) return;
      cycleSkill(memory, resolveSkillId(idOrCtx));
    }),
    vscode.commands.registerCommand('aiContextBridge.setSkillEnabled', async (idOrCtx: unknown) => {
      if (!(await guardKillSwitch(memory))) return;
      memory.setSkillStatus(resolveSkillId(idOrCtx) ?? '', 'ENABLED');
    }),
    vscode.commands.registerCommand('aiContextBridge.setSkillDisabled', async (idOrCtx: unknown) => {
      if (!(await guardKillSwitch(memory))) return;
      memory.setSkillStatus(resolveSkillId(idOrCtx) ?? '', 'DISABLED');
    }),
    vscode.commands.registerCommand('aiContextBridge.setSkillAsk', async (idOrCtx: unknown) => {
      if (!(await guardKillSwitch(memory))) return;
      memory.setSkillStatus(resolveSkillId(idOrCtx) ?? '', 'ASK');
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
    vscode.commands.registerCommand('aiContextBridge.registerSkill', () => registerSkillPrompt(memory)),
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
    vscode.commands.registerCommand('aiContextBridge.bridgeNow', async () => {
      const cfg = vscode.workspace.getConfiguration('aiContextBridge');
      let force = false;
      if (!cfg.get<boolean>('exportToAgentFiles', false)) {
        const choice = await vscode.window.showInformationMessage(
          'Auto-export to agent files is off. Enable now?',
          'Enable & bridge',
          'Bridge once',
          'Cancel',
        );
        if (choice === 'Cancel' || !choice) {
          return;
        }
        if (choice === 'Enable & bridge') {
          try {
            await cfg.update('exportToAgentFiles', true, vscode.ConfigurationTarget.Workspace);
          } catch (err) {
            vscode.window.showWarningMessage(
              `Couldn't persist setting (${err instanceof Error ? err.message : String(err)}). Bridging once — reload the window and try again to enable auto-sync.`,
            );
            force = true;
          }
        } else {
          force = true;
        }
      }
      const result = await bridgeWriter.flushNow({ force });
      if (result.written.length === 0 && result.skipped.length === 0) {
        vscode.window.showInformationMessage('Bridge: no agent files to update.');
      } else if (result.written.length === 0) {
        vscode.window.showWarningMessage(
          `Bridge: 0 written, ${result.skipped.length} skipped (file missing or unreadable).`,
        );
      } else {
        vscode.window.showInformationMessage(
          `Bridge: updated ${result.written.length} agent file${result.written.length === 1 ? '' : 's'} — ${result.written.join(', ')}.`,
        );
      }
    }),
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

function syncKillSwitchFromConfig(memory: MemoryManager): void {
  const cfg = vscode.workspace.getConfiguration('aiContextBridge');
  memory.setKillSwitch(cfg.get<boolean>('killSwitchEngaged', false));
}

async function toggleKillSwitch(memory: MemoryManager): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aiContextBridge');
  const current = cfg.get<boolean>('killSwitchEngaged', false);
  await cfg.update('killSwitchEngaged', !current, vscode.ConfigurationTarget.Workspace);
  vscode.window.showWarningMessage(
    !current
      ? 'AI Context Bridge: Kill switch ENGAGED — all skills are now DISABLED.'
      : 'AI Context Bridge: Kill switch released.',
  );
}

function resolveSkillId(input: unknown): string | undefined {
  if (typeof input === 'string') {
    return input;
  }
  if (input && typeof input === 'object') {
    const obj = input as { skill?: { id?: string }; id?: string };
    return obj.skill?.id ?? obj.id;
  }
  return undefined;
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
  const items = kilocodeTargets.map((t) => ({
    label: t.label,
    description: existsHint(t),
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
    lines.push(`Context: ${ctx.written.length} written, ${ctx.skipped.length} skipped`);
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
  const items = targets.map((t) => ({
    label: t.label,
    description: existsHint(t),
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

async function guardKillSwitch(memory: MemoryManager): Promise<boolean> {
  if (!memory.getState().killSwitchEngaged) {
    return true;
  }
  const RELEASE = 'Release Kill Switch';
  const KEEP = 'Keep Engaged';
  const choice = await vscode.window.showWarningMessage(
    'Kill Switch is engaged — every skill is forced to DISABLED regardless of its individual status. Status changes you make now will be saved but have no effect until the kill switch is released.',
    { modal: true },
    RELEASE,
    KEEP,
  );
  if (choice === RELEASE) {
    const cfg = vscode.workspace.getConfiguration('aiContextBridge');
    await cfg.update('killSwitchEngaged', false, vscode.ConfigurationTarget.Workspace);
    memory.setKillSwitch(false);
    return true;
  }
  if (choice === KEEP) {
    return true;
  }
  return false;
}

async function cycleSkill(memory: MemoryManager, skillId: string | undefined): Promise<void> {
  if (!skillId) {
    return;
  }
  const skill = memory.getState().skills.find((s) => s.id === skillId);
  if (!skill) {
    return;
  }
  const order: SkillStatus[] = ['ENABLED', 'ASK', 'DISABLED'];
  const next = order[(order.indexOf(skill.status) + 1) % order.length];
  memory.setSkillStatus(skillId, next);
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

async function registerSkillPrompt(memory: MemoryManager): Promise<void> {
  const id = await vscode.window.showInputBox({
    prompt: 'Skill id (stable identifier)',
    placeHolder: 'e.g. shell.exec',
  });
  if (!id) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'Display name',
    value: id,
  });
  if (!name) {
    return;
  }
  const status = await vscode.window.showQuickPick<{
    label: string;
    description: string;
    value: SkillStatus;
  }>(
    [
      { label: 'Enabled', description: 'AI can use this skill freely', value: 'ENABLED' },
      { label: 'Ask', description: 'AI must ask before each use', value: 'ASK' },
      { label: 'Disabled', description: 'Hidden from AI tool list', value: 'DISABLED' },
    ],
    { placeHolder: 'Initial status' },
  );
  if (!status) {
    return;
  }
  memory.registerSkill({ id, name, status: status.value });
}
