import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { HandoffPromptBuilder } from './HandoffPromptBuilder';

/**
 * Resolve an entry from `aiContextBridge.agentFiles` to an absolute path.
 * - "~/foo" or "$CODEX_HOME/foo" → home- or env-rooted absolute path
 * - "/abs/path" → as-is
 * - any other string → joined under the workspace folder
 */
export function resolveAgentFilePath(entry: string, workspaceFolder: string): string {
  let s = entry;
  if (s.startsWith('$CODEX_HOME/') || s === '$CODEX_HOME') {
    const home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
    s = s === '$CODEX_HOME' ? home : path.join(home, s.slice('$CODEX_HOME/'.length));
    return s;
  }
  if (s.startsWith('~/') || s === '~') {
    return s === '~' ? os.homedir() : path.join(os.homedir(), s.slice(2));
  }
  if (path.isAbsolute(s)) {
    return s;
  }
  return path.join(workspaceFolder, s);
}

const BEGIN_PREFIX = '<!-- AICB:BEGIN';
const END = '<!-- AICB:END -->';

const DEFAULT_AGENT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'AGENT.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];

export interface BridgeFlushResult {
  written: string[];
  skipped: string[];
  repaired: string[];
  conflicts: string[];
  preservedManual: string[];
  warnings: string[];
}

interface ManagedBlock {
  start: number;
  end: number;
  marker: string;
  rawBody: string;
}

interface MergeOutcome {
  content: string;
  repaired: boolean;
  conflict: boolean;
  preservedManual: boolean;
  warning: boolean;
}

export class AgentBridgeWriter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private flushHandle: NodeJS.Timeout | undefined;

  constructor(
    private readonly memory: MemoryManager,
    private readonly builder: HandoffPromptBuilder,
  ) {}

  start(): void {
    this.disposables.push(memory_listen(this.memory, () => this.scheduleFlush()));
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('aiContextBridge.exportToAgentFiles') ||
          e.affectsConfiguration('aiContextBridge.agentFiles')
        ) {
          this.scheduleFlush();
        }
      }),
    );
  }

  private cfg() {
    const c = vscode.workspace.getConfiguration('aiContextBridge');
    return {
      enabled: c.get<boolean>('exportToAgentFiles', false),
      files: c.get<string[]>('agentFiles') ?? DEFAULT_AGENT_FILES,
      onlyExisting: c.get<boolean>('agentFilesOnlyExisting', true),
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

  async flushNow(opts?: { force?: boolean }): Promise<BridgeFlushResult> {
    const cfg = this.cfg();
    const written: string[] = [];
    const skipped: string[] = [];
    const repaired: string[] = [];
    const conflicts: string[] = [];
    const preservedManual: string[] = [];
    const warnings: string[] = [];
    if (!cfg.enabled && !opts?.force) {
      return { written, skipped, repaired, conflicts, preservedManual, warnings };
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      return { written, skipped, repaired, conflicts, preservedManual, warnings };
    }
    const content = this.builder.build(8, { includeGeneratedAt: false });
    for (const rel of cfg.files) {
      const target = resolveAgentFilePath(rel, folder);
      try {
        const exists = await pathExists(target);
        if (!exists && cfg.onlyExisting) {
          skipped.push(rel);
          continue;
        }
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const original = exists ? await fs.promises.readFile(target, 'utf8') : '';
        const merged = mergeBlock(original, content, rel, opts?.force === true);
        if (merged.preservedManual) {
          skipped.push(rel);
          preservedManual.push(rel);
          continue;
        }
        if (merged.content === original) {
          continue;
        }
        await atomicWrite(target, merged.content);
        written.push(rel);
        if (merged.repaired) repaired.push(rel);
        if (merged.conflict) conflicts.push(rel);
        if (merged.warning) warnings.push(rel);
      } catch {
        skipped.push(rel);
      }
    }
    return { written, skipped, repaired, conflicts, preservedManual, warnings };
  }

  dispose(): void {
    if (this.flushHandle) {
      clearTimeout(this.flushHandle);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

function wrap(content: string, target: string): string {
  const metadata = {
    version: 1,
    target,
    generatedAt: new Date().toISOString(),
    hash: hashContent(content),
  };
  return `${BEGIN_PREFIX} ${JSON.stringify(metadata)} -->\n${content}\n${END}`;
}

function mergeBlock(
  original: string,
  content: string,
  target: string,
  force: boolean,
): MergeOutcome {
  const nextBlock = wrap(content, target);
  const found = findManagedBlocks(original);
  const blocks = found.blocks;
  const hasWarning = found.malformedCount > 0;

  if (blocks.length > 0) {
    const hasManualEdit = blocks.some((b) => isManuallyEdited(b));
    if (hasManualEdit && !force) {
      return {
        content: original,
        repaired: false,
        conflict: false,
        preservedManual: true,
        warning: hasWarning,
      };
    }

    const current = blocks.length === 1 ? normalizeBlockBody(blocks[0].rawBody) : undefined;
    if (!hasManualEdit && blocks.length === 1 && hashContent(current ?? '') === hashContent(content)) {
      return {
        content: original,
        repaired: false,
        conflict: false,
        preservedManual: false,
        warning: hasWarning,
      };
    }

    return {
      content: replaceManagedBlocks(original, blocks, nextBlock),
      repaired: blocks.length > 1,
      conflict: hasManualEdit,
      preservedManual: false,
      warning: hasWarning,
    };
  }

  if (original.length === 0) {
    return {
      content: nextBlock + '\n',
      repaired: false,
      conflict: false,
      preservedManual: false,
      warning: hasWarning,
    };
  }
  return {
    content: original.replace(/\s*$/, '') + '\n\n' + nextBlock + '\n',
    repaired: false,
    conflict: false,
    preservedManual: false,
    warning: hasWarning,
  };
}

function findManagedBlocks(original: string): { blocks: ManagedBlock[]; malformedCount: number } {
  const blocks: ManagedBlock[] = [];
  let malformedCount = 0;
  let cursor = 0;

  while (cursor < original.length) {
    const start = original.indexOf(BEGIN_PREFIX, cursor);
    if (start < 0) break;

    const markerEnd = original.indexOf('-->', start);
    if (markerEnd < 0) {
      malformedCount++;
      break;
    }

    const bodyStart = markerEnd + '-->'.length;
    const nextStart = original.indexOf(BEGIN_PREFIX, bodyStart);
    const endStart = original.indexOf(END, bodyStart);
    if (endStart < 0) {
      malformedCount++;
      cursor = bodyStart;
      continue;
    }
    if (nextStart >= 0 && nextStart < endStart) {
      malformedCount++;
      cursor = nextStart;
      continue;
    }

    blocks.push({
      start,
      end: endStart + END.length,
      marker: original.slice(start, markerEnd + '-->'.length),
      rawBody: original.slice(bodyStart, endStart),
    });
    cursor = endStart + END.length;
  }

  return { blocks, malformedCount };
}

function replaceManagedBlocks(original: string, blocks: ManagedBlock[], nextBlock: string): string {
  let out = '';
  let cursor = 0;

  blocks.forEach((block, index) => {
    const between = original.slice(cursor, block.start);
    if (index === 0 || between.trim().length > 0) {
      out += between;
    }
    if (index === 0) {
      out += nextBlock;
    }
    cursor = block.end;
  });

  out += original.slice(cursor);
  return out;
}

function isManuallyEdited(block: ManagedBlock): boolean {
  const metadata = parseMetadata(block.marker);
  if (!metadata?.hash) {
    return false;
  }
  return metadata.hash !== hashContent(normalizeBlockBody(block.rawBody));
}

function parseMetadata(marker: string): { hash?: string } | undefined {
  const jsonStart = marker.indexOf('{');
  const jsonEnd = marker.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(marker.slice(jsonStart, jsonEnd + 1));
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    const hash = (parsed as { hash?: unknown }).hash;
    return typeof hash === 'string' ? { hash } : undefined;
  } catch {
    return { hash: 'invalid-metadata' };
  }
}

function normalizeBlockBody(raw: string): string {
  let body = raw;
  if (body.startsWith('\r\n')) {
    body = body.slice(2);
  } else if (body.startsWith('\n')) {
    body = body.slice(1);
  }

  if (body.endsWith('\r\n')) {
    body = body.slice(0, -2);
  } else if (body.endsWith('\n')) {
    body = body.slice(0, -1);
  }
  return body;
}

function hashContent(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const tmp = `${target}.aicb.tmp`;
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, target);
}

function memory_listen(memory: MemoryManager, fn: () => void): vscode.Disposable {
  return memory.onDidChange((c) => {
    if (c.kind === 'thought' || c.kind === 'pinned' || c.kind === 'skill' || c.kind === 'bulk') {
      fn();
    }
  });
}
