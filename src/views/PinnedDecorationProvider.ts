import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';

export class PinnedDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly memory: MemoryManager) {
    this.subscription = memory.onDidChange((c) => {
      if (c.kind === 'pinned' || c.kind === 'bulk') {
        this.emitter.fire(undefined);
      }
    });
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }
    if (!this.memory.isPinned(uri.fsPath)) {
      return undefined;
    }
    return {
      badge: '📌',
      tooltip: 'Pinned to AI Context Bridge memory',
      color: new vscode.ThemeColor('charts.yellow'),
      propagate: false,
    };
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
