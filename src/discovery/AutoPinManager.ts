import * as fs from 'fs';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';

const PINNED_BY = 'auto:editor';
const PINNED_BY_BACKFILL = 'auto:backfill';
const CLEANUP_INTERVAL_MS = 60_000;
const BACKFILL_EXCLUDE =
  '{**/node_modules/**,**/.git/**,**/.aicb/**,**/out/**,**/dist/**,**/build/**,**/.next/**,**/.cache/**,**/coverage/**,**/*.lock,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml,**/*.vsix,**/*.{png,jpg,jpeg,gif,webp,ico,svg,pdf,zip,tgz}}';
const BACKFILL_MAX_SCAN = 2000;

export class AutoPinManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly dwellTimers = new Map<string, NodeJS.Timeout>();
  private cleanupHandle: NodeJS.Timeout | undefined;

  constructor(private readonly memory: MemoryManager) {}

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSave(doc)),
      vscode.window.onDidChangeActiveTextEditor((ed) => this.onActiveEditor(ed)),
    );
    // Re-evaluate the currently open editor on startup.
    this.onActiveEditor(vscode.window.activeTextEditor);
    this.scheduleCleanup();
    void this.backfillFromRecentFiles();
  }

  private cfg() {
    const c = vscode.workspace.getConfiguration('aiContextBridge');
    return {
      onSave: c.get<boolean>('autoPinRecentEdits', true),
      dwellMin: Math.max(0, c.get<number>('autoPinDwellMinutes', 5)),
      expireMin: Math.max(1, c.get<number>('autoPinExpireMinutes', 60)),
      backfillCount: Math.max(0, c.get<number>('autoPinBackfillCount', 8)),
    };
  }

  private async backfillFromRecentFiles(): Promise<void> {
    const cfg = this.cfg();
    if (!cfg.onSave || cfg.backfillCount === 0) {
      return;
    }
    if (this.memory.getState().pinnedFiles.length > 0) {
      return; // user or earlier session already populated working memory
    }
    if (!vscode.workspace.workspaceFolders?.length) {
      return;
    }
    let candidates: vscode.Uri[];
    try {
      candidates = await vscode.workspace.findFiles('**/*', BACKFILL_EXCLUDE, BACKFILL_MAX_SCAN);
    } catch {
      return;
    }
    const ranked = (
      await Promise.all(
        candidates.map(async (uri) => {
          try {
            const stat = await fs.promises.stat(uri.fsPath);
            return { uri, mtime: stat.mtimeMs };
          } catch {
            return undefined;
          }
        }),
      )
    ).filter((x): x is { uri: vscode.Uri; mtime: number } => !!x);

    ranked.sort((a, b) => b.mtime - a.mtime);
    const top = ranked.slice(0, cfg.backfillCount);
    if (top.length === 0) {
      return;
    }
    const expiresAt = Date.now() + cfg.expireMin * 60_000;
    for (const { uri } of top) {
      const filePath = uri.fsPath;
      if (this.memory.isPinned(filePath)) {
        continue;
      }
      this.memory.pinFile({
        path: filePath,
        pinnedBy: PINNED_BY_BACKFILL,
        auto: 'recent-edit',
        expiresAt,
      });
    }
  }

  private onSave(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const cfg = this.cfg();
    if (!cfg.onSave) {
      return;
    }
    this.pin(doc.uri.fsPath, 'recent-edit', cfg.expireMin);
  }

  private onActiveEditor(editor: vscode.TextEditor | undefined): void {
    // Cancel timers for any editor that lost focus.
    for (const [path, handle] of this.dwellTimers) {
      if (!editor || editor.document.uri.fsPath !== path) {
        clearTimeout(handle);
        this.dwellTimers.delete(path);
      }
    }
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }
    const cfg = this.cfg();
    if (cfg.dwellMin === 0) {
      return;
    }
    const filePath = editor.document.uri.fsPath;
    if (this.dwellTimers.has(filePath)) {
      return;
    }
    if (this.memory.isPinned(filePath)) {
      // Already pinned — refresh expiry instead of starting a fresh timer.
      this.refreshExpiry(filePath, cfg.expireMin);
      return;
    }
    const handle = setTimeout(() => {
      this.dwellTimers.delete(filePath);
      this.pin(filePath, 'dwell', cfg.expireMin);
    }, cfg.dwellMin * 60_000);
    this.dwellTimers.set(filePath, handle);
  }

  private pin(filePath: string, source: 'recent-edit' | 'dwell', expireMin: number): void {
    const existing = this.memory.getState().pinnedFiles.find((f) => f.path === filePath);
    if (existing && !existing.auto) {
      // Manual pin — leave it alone.
      return;
    }
    this.memory.pinFile({
      path: filePath,
      pinnedBy: PINNED_BY,
      auto: source,
      expiresAt: Date.now() + expireMin * 60_000,
    });
  }

  private refreshExpiry(filePath: string, expireMin: number): void {
    const existing = this.memory.getState().pinnedFiles.find((f) => f.path === filePath);
    if (!existing || !existing.auto) {
      return;
    }
    this.memory.pinFile({
      path: filePath,
      pinnedBy: PINNED_BY,
      auto: existing.auto,
      expiresAt: Date.now() + expireMin * 60_000,
    });
  }

  private scheduleCleanup(): void {
    const tick = () => {
      this.memory.cleanupExpiredAutoPins();
      this.cleanupHandle = setTimeout(tick, CLEANUP_INTERVAL_MS);
    };
    this.cleanupHandle = setTimeout(tick, CLEANUP_INTERVAL_MS);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    for (const handle of this.dwellTimers.values()) {
      clearTimeout(handle);
    }
    this.dwellTimers.clear();
    if (this.cleanupHandle) {
      clearTimeout(this.cleanupHandle);
    }
  }
}
