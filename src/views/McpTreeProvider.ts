import * as vscode from 'vscode';
import { McpDiscovery } from '../discovery/McpDiscovery';
import { McpHost, McpServer, SkillScope } from '../memory/types';

type Node = HostNode | ScopeNode | ServerNode;

const HOST_LABEL: Record<McpHost, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
  gemini: 'Gemini',
  windsurf: 'Windsurf',
  vscode: 'VS Code (Copilot)',
  kilocode: 'Kilocode',
  codex: 'Codex',
  agent: 'Agent (.agent)',
};

const HOST_ORDER: McpHost[] = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'gemini',
  'windsurf',
  'vscode',
  'kilocode',
  'codex',
  'agent',
];

const SECRET_KEY = /(KEY|TOKEN|SECRET|PASS|PASSWORD|CREDENTIAL|API)/i;

export class McpTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly discovery: McpDiscovery) {
    discovery.onDidChange(() => this.emitter.fire());
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node.toTreeItem();
  }

  async getChildren(parent?: Node): Promise<Node[]> {
    const all = this.discovery.getServers();
    if (parent instanceof HostNode) {
      const servers = all.filter((s) => s.host === parent.host);
      const hasWs = servers.some((s) => s.scope === 'workspace');
      const hasGl = servers.some((s) => s.scope === 'global');
      if (hasWs && hasGl) {
        return [
          new ScopeNode(parent.host, 'workspace', servers.filter((s) => s.scope === 'workspace').length),
          new ScopeNode(parent.host, 'global', servers.filter((s) => s.scope === 'global').length),
        ];
      }
      return servers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => new ServerNode(s));
    }
    if (parent instanceof ScopeNode) {
      return all
        .filter((s) => s.host === parent.host && s.scope === parent.scope)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => new ServerNode(s));
    }
    const present = new Set(all.map((s) => s.host));
    return HOST_ORDER.filter((h) => present.has(h)).map(
      (h) => new HostNode(h, all.filter((s) => s.host === h).length),
    );
  }
}

class HostNode {
  constructor(
    readonly host: McpHost,
    readonly count: number,
  ) {}
  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(HOST_LABEL[this.host], vscode.TreeItemCollapsibleState.Expanded);
    item.id = `mcp-host:${this.host}`;
    item.contextValue = 'mcpHost';
    item.description = String(this.count);
    item.iconPath = new vscode.ThemeIcon('server');
    return item;
  }
}

class ScopeNode {
  constructor(
    readonly host: McpHost,
    readonly scope: SkillScope,
    readonly count: number,
  ) {}
  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      this.scope === 'global' ? 'Global' : 'Workspace',
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.id = `mcp-scope:${this.host}:${this.scope}`;
    item.contextValue = 'mcpScope';
    item.description = String(this.count);
    item.iconPath = new vscode.ThemeIcon(this.scope === 'global' ? 'globe' : 'folder');
    return item;
  }
}

export class ServerNode {
  constructor(readonly server: McpServer) {}
  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.server.name, vscode.TreeItemCollapsibleState.None);
    item.id = this.server.id;
    item.contextValue = 'mcpServer';
    item.description = describeTransport(this.server);
    item.tooltip = buildTooltip(this.server);
    item.iconPath = new vscode.ThemeIcon(
      this.server.disabled ? 'circle-slash' : this.server.transport === 'http' || this.server.transport === 'sse' ? 'globe' : 'plug',
      this.server.disabled ? new vscode.ThemeColor('errorForeground') : undefined,
    );
    item.command = {
      command: 'vscode.open',
      title: 'Open MCP Config',
      arguments: [vscode.Uri.file(this.server.sourceUri)],
    };
    return item;
  }
}

function describeTransport(s: McpServer): string {
  if (s.disabled) return 'disabled';
  if (s.url) return s.url;
  if (s.command) return [s.command, ...(s.args ?? [])].join(' ').slice(0, 60);
  return s.transport;
}

function buildTooltip(s: McpServer): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = false;
  md.appendMarkdown(`**${s.name}** _(${HOST_LABEL[s.host]} · ${s.scope})_\n\n`);
  md.appendMarkdown(`- Transport: \`${s.transport}\`\n`);
  if (s.url) {
    md.appendMarkdown(`- URL: \`${s.url}\`\n`);
  }
  if (s.command) {
    md.appendMarkdown(`- Command: \`${s.command}\`\n`);
  }
  if (s.args && s.args.length) {
    md.appendMarkdown(`- Args: \`${s.args.join(' ')}\`\n`);
  }
  if (s.env && Object.keys(s.env).length) {
    md.appendMarkdown(`- Env:\n`);
    for (const [k, v] of Object.entries(s.env)) {
      const shown = SECRET_KEY.test(k) ? '••• (redacted)' : v;
      md.appendMarkdown(`  - \`${k}\` = \`${shown}\`\n`);
    }
  }
  if (s.disabled) {
    md.appendMarkdown(`- Status: \`disabled\`\n`);
  }
  md.appendMarkdown(`- Source: \`${s.sourceUri}\`\n`);
  return md;
}
