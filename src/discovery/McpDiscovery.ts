import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpHost, McpServer, McpTransport, SkillScope } from '../memory/types';

interface ConfigSource {
  host: McpHost;
  scope: SkillScope;
  filePath: string;
}

export class McpDiscovery implements vscode.Disposable {
  private servers: McpServer[] = [];
  private readonly emitter = new vscode.EventEmitter<McpServer[]>();
  readonly onDidChange = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  start(): void {
    void this.runScan();

    const watchPatterns = [
      '**/.mcp.json',
      '**/.cursor/mcp.json',
      '**/.vscode/mcp.json',
      '**/.gemini/settings.json',
      '**/.kilocode/mcp.json',
    ];
    for (const p of watchPatterns) {
      const w = vscode.workspace.createFileSystemWatcher(p);
      w.onDidCreate(() => void this.runScan());
      w.onDidChange(() => void this.runScan());
      w.onDidDelete(() => void this.runScan());
      this.disposables.push(w);
    }
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.runScan()),
    );
  }

  getServers(): McpServer[] {
    return this.servers;
  }

  async rescan(): Promise<number> {
    await this.runScan();
    return this.servers.length;
  }

  private async runScan(): Promise<void> {
    const sources = this.collectSources();
    const out: McpServer[] = [];
    for (const src of sources) {
      out.push(...(await readMcpFromConfig(src)));
    }
    this.servers = out;
    this.emitter.fire(this.servers);
  }

  private collectSources(): ConfigSource[] {
    const home = os.homedir();
    const sources: ConfigSource[] = [];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = folder.uri.fsPath;
      sources.push({ host: 'claude-code', scope: 'workspace', filePath: path.join(root, '.mcp.json') });
      sources.push({ host: 'cursor', scope: 'workspace', filePath: path.join(root, '.cursor', 'mcp.json') });
      sources.push({ host: 'vscode', scope: 'workspace', filePath: path.join(root, '.vscode', 'mcp.json') });
      sources.push({ host: 'gemini', scope: 'workspace', filePath: path.join(root, '.gemini', 'settings.json') });
      sources.push({ host: 'kilocode', scope: 'workspace', filePath: path.join(root, '.kilocode', 'mcp.json') });
    }

    if (home) {
      sources.push({ host: 'claude-code', scope: 'global', filePath: path.join(home, '.claude.json') });
      sources.push({ host: 'cursor', scope: 'global', filePath: path.join(home, '.cursor', 'mcp.json') });
      sources.push({ host: 'gemini', scope: 'global', filePath: path.join(home, '.gemini', 'settings.json') });
      sources.push({
        host: 'windsurf',
        scope: 'global',
        filePath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      });
      for (const root of kilocodeGlobalRoots(home)) {
        sources.push({
          host: 'kilocode',
          scope: 'global',
          filePath: path.join(root, 'globalStorage', 'kilocode.kilo-code', 'settings', 'mcp_settings.json'),
        });
      }
      if (process.platform === 'darwin') {
        sources.push({
          host: 'claude-desktop',
          scope: 'global',
          filePath: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        });
      } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA;
        if (appData) {
          sources.push({
            host: 'claude-desktop',
            scope: 'global',
            filePath: path.join(appData, 'Claude', 'claude_desktop_config.json'),
          });
        }
      } else {
        sources.push({
          host: 'claude-desktop',
          scope: 'global',
          filePath: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
        });
      }
    }

    return sources;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.emitter.dispose();
  }
}

export function kilocodeGlobalRoots(home: string): string[] {
  const roots: string[] = [];
  if (process.platform === 'darwin') {
    roots.push(path.join(home, 'Library', 'Application Support', 'Code', 'User'));
    roots.push(path.join(home, 'Library', 'Application Support', 'Cursor', 'User'));
    roots.push(path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User'));
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      roots.push(path.join(appData, 'Code', 'User'));
      roots.push(path.join(appData, 'Cursor', 'User'));
      roots.push(path.join(appData, 'Code - Insiders', 'User'));
    }
  } else {
    roots.push(path.join(home, '.config', 'Code', 'User'));
    roots.push(path.join(home, '.config', 'Cursor', 'User'));
    roots.push(path.join(home, '.config', 'Code - Insiders', 'User'));
  }
  return roots;
}

async function readMcpFromConfig(src: ConfigSource): Promise<McpServer[]> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(src.filePath, 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const map = extractServersMap(parsed, src.host);
  if (!map) {
    return [];
  }
  const out: McpServer[] = [];
  for (const [name, raw] of Object.entries(map)) {
    if (!raw || typeof raw !== 'object') continue;
    const cfg = raw as Record<string, unknown>;
    const url = typeof cfg.url === 'string' ? cfg.url : undefined;
    const command = typeof cfg.command === 'string' ? cfg.command : undefined;
    const args = Array.isArray(cfg.args) ? (cfg.args as unknown[]).map((a) => String(a)) : undefined;
    const env =
      cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)
        ? Object.fromEntries(
            Object.entries(cfg.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : undefined;
    const disabled = typeof cfg.disabled === 'boolean' ? cfg.disabled : undefined;
    const declaredType = typeof cfg.type === 'string' ? cfg.type.toLowerCase() : undefined;
    const transport: McpTransport =
      declaredType === 'http' || declaredType === 'sse' || declaredType === 'stdio'
        ? declaredType
        : url
        ? 'http'
        : command
        ? 'stdio'
        : 'unknown';
    out.push({
      id: `${src.host}:${src.scope}:${name}`,
      name,
      host: src.host,
      scope: src.scope,
      transport,
      command,
      args,
      url,
      env,
      disabled,
      sourceUri: src.filePath,
    });
  }
  return out;
}

function extractServersMap(parsed: unknown, host: McpHost): Record<string, unknown> | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const obj = parsed as Record<string, unknown>;

  // VS Code Copilot uses "servers" at the top level of .vscode/mcp.json
  if (host === 'vscode') {
    const servers = obj.servers;
    if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
      return servers as Record<string, unknown>;
    }
  }

  const direct = obj.mcpServers;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  // Claude Code's ~/.claude.json may nest mcpServers under "projects" — skip those for now;
  // top-level mcpServers covers the common case.
  return undefined;
}
