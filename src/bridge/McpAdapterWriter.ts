import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { kilocodeGlobalRoots } from '../discovery/McpDiscovery';
import { McpHost, McpServer, SkillScope } from '../memory/types';

export interface CopyTarget {
  id: string;
  host: McpHost;
  scope: SkillScope;
  filePath: string;
  configKey: 'mcpServers' | 'servers';
  label: string;
}

export type CopyStatus =
  | 'written'
  | 'overwrote-aicb'
  | 'overwrote-handauthored'
  | 'skipped'
  | 'error';

export interface CopyResult {
  target: CopyTarget;
  status: CopyStatus;
  error?: string;
}

export type ConfirmOverwrite = (
  prior: Record<string, unknown>,
  target: CopyTarget,
) => Promise<boolean>;

export const AICB_MARKER_KEY = '_aicbGenerated';
export const AICB_SOURCE_KEY = '_aicbSource';

type CopyTargetDraft = Omit<CopyTarget, 'id'> & { id?: string };

export class McpAdapterWriter {
  listTargets(excluding?: { host: McpHost; scope: SkillScope }): CopyTarget[] {
    const home = os.homedir();
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const targets: CopyTargetDraft[] = [];

    if (ws) {
      targets.push({
        host: 'claude-code',
        scope: 'workspace',
        filePath: path.join(ws, '.mcp.json'),
        configKey: 'mcpServers',
        label: 'Claude Code · workspace (.mcp.json)',
      });
      targets.push({
        host: 'cursor',
        scope: 'workspace',
        filePath: path.join(ws, '.cursor', 'mcp.json'),
        configKey: 'mcpServers',
        label: 'Cursor · workspace (.cursor/mcp.json)',
      });
      targets.push({
        host: 'vscode',
        scope: 'workspace',
        filePath: path.join(ws, '.vscode', 'mcp.json'),
        configKey: 'servers',
        label: 'VS Code Copilot · workspace (.vscode/mcp.json)',
      });
      targets.push({
        host: 'gemini',
        scope: 'workspace',
        filePath: path.join(ws, '.gemini', 'settings.json'),
        configKey: 'mcpServers',
        label: 'Gemini · workspace (.gemini/settings.json)',
      });
      targets.push({
        host: 'kilocode',
        scope: 'workspace',
        filePath: path.join(ws, '.kilocode', 'mcp.json'),
        configKey: 'mcpServers',
        label: 'Kilocode · workspace (.kilocode/mcp.json)',
      });
      targets.push({
        host: 'codex',
        scope: 'workspace',
        filePath: path.join(ws, '.codex', 'mcp.json'),
        configKey: 'mcpServers',
        label: 'Codex · workspace (.codex/mcp.json)',
      });
      targets.push({
        host: 'agent',
        scope: 'workspace',
        filePath: path.join(ws, '.agent', 'mcp.json'),
        configKey: 'mcpServers',
        label: 'Agent · workspace (.agent/mcp.json)',
      });
    }

    if (home) {
      targets.push({
        host: 'claude-code',
        scope: 'global',
        filePath: path.join(home, '.claude.json'),
        configKey: 'mcpServers',
        label: 'Claude Code · global (~/.claude.json)',
      });
      targets.push({
        host: 'cursor',
        scope: 'global',
        filePath: path.join(home, '.cursor', 'mcp.json'),
        configKey: 'mcpServers',
        label: 'Cursor · global (~/.cursor/mcp.json)',
      });
      targets.push({
        host: 'gemini',
        scope: 'global',
        filePath: path.join(home, '.gemini', 'settings.json'),
        configKey: 'mcpServers',
        label: 'Gemini · global (~/.gemini/settings.json)',
      });
      targets.push({
        host: 'windsurf',
        scope: 'global',
        filePath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
        configKey: 'mcpServers',
        label: 'Windsurf · global (~/.codeium/windsurf/mcp_config.json)',
      });
      for (const root of kilocodeGlobalRoots(home)) {
        const flavor = path.basename(path.dirname(root));
        targets.push({
          id: `kilocode:global:${slugId(flavor)}`,
          host: 'kilocode',
          scope: 'global',
          filePath: path.join(root, 'globalStorage', 'kilocode.kilo-code', 'settings', 'mcp_settings.json'),
          configKey: 'mcpServers',
          label: `Kilocode · global (${flavor})`,
        });
      }
      const codexHome = process.env.CODEX_HOME ?? path.join(home, '.codex');
      targets.push({
        host: 'codex',
        scope: 'global',
        filePath: path.join(codexHome, 'mcp.json'),
        configKey: 'mcpServers',
        label: `Codex · global (${codexHome}/mcp.json)`,
      });
      targets.push({
        host: 'agent',
        scope: 'global',
        filePath: path.join(home, '.agent', 'mcp.json'),
        configKey: 'mcpServers',
        label: 'Agent · global (~/.agent/mcp.json)',
      });

      if (process.platform === 'darwin') {
        targets.push({
          host: 'claude-desktop',
          scope: 'global',
          filePath: path.join(
            home,
            'Library',
            'Application Support',
            'Claude',
            'claude_desktop_config.json',
          ),
          configKey: 'mcpServers',
          label: 'Claude Desktop · global (macOS Application Support)',
        });
      } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA;
        if (appData) {
          targets.push({
            host: 'claude-desktop',
            scope: 'global',
            filePath: path.join(appData, 'Claude', 'claude_desktop_config.json'),
            configKey: 'mcpServers',
            label: 'Claude Desktop · global (%APPDATA%\\Claude)',
          });
        }
      } else {
        targets.push({
          host: 'claude-desktop',
          scope: 'global',
          filePath: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
          configKey: 'mcpServers',
          label: 'Claude Desktop · global (~/.config/Claude)',
        });
      }
    }

    const withIds = targets.map(normalizeTarget);
    if (excluding) {
      return withIds.filter((t) => !(t.host === excluding.host && t.scope === excluding.scope));
    }
    return withIds;
  }

  async copyServer(
    server: McpServer,
    targets: CopyTarget[],
    confirmOverwrite: ConfirmOverwrite,
  ): Promise<CopyResult[]> {
    const payload = buildPayload(server);
    const results: CopyResult[] = [];
    for (const target of targets) {
      results.push(await this.copyOne(server, target, payload, confirmOverwrite));
    }
    return results;
  }

  private async copyOne(
    server: McpServer,
    target: CopyTarget,
    payload: Record<string, unknown>,
    confirmOverwrite: ConfirmOverwrite,
  ): Promise<CopyResult> {
    try {
      const existing = await readJson(target.filePath);
      const obj =
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as Record<string, unknown>)
          : {};
      const rawMap = obj[target.configKey];
      const map =
        rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
          ? (rawMap as Record<string, unknown>)
          : {};
      const prior = map[server.name];
      let status: CopyStatus = 'written';
      if (prior && typeof prior === 'object' && !Array.isArray(prior)) {
        const priorObj = prior as Record<string, unknown>;
        const isAicb = priorObj[AICB_MARKER_KEY] === true;
        if (isAicb) {
          status = 'overwrote-aicb';
        } else {
          const ok = await confirmOverwrite(priorObj, target);
          if (!ok) {
            return { target, status: 'skipped' };
          }
          status = 'overwrote-handauthored';
        }
      }
      map[server.name] = {
        ...payload,
        [AICB_MARKER_KEY]: true,
        [AICB_SOURCE_KEY]: `${server.host}:${server.scope}`,
      };
      obj[target.configKey] = map;
      await atomicWriteJson(target.filePath, obj);
      return { target, status };
    } catch (err) {
      return {
        target,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function normalizeTarget(target: CopyTargetDraft): CopyTarget {
  return {
    ...target,
    id: target.id ?? `${target.host}:${target.scope}`,
  };
}

function slugId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default';
}

function buildPayload(s: McpServer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.url) out.url = s.url;
  if (s.command) out.command = s.command;
  if (s.args && s.args.length) out.args = s.args;
  if (s.env && Object.keys(s.env).length) out.env = s.env;
  if (s.transport === 'http' || s.transport === 'sse') {
    out.type = s.transport;
  } else if (s.transport === 'stdio' && !s.command) {
    out.type = 'stdio';
  }
  if (s.disabled === true) out.disabled = true;
  return out;
}

async function readJson(p: string): Promise<unknown> {
  try {
    const raw = await fs.promises.readFile(p, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

async function atomicWriteJson(p: string, obj: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fs.promises.rename(tmp, p);
}
