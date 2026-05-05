import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { Snapshot } from '../memory/types';

export class SnapshotProvider implements vscode.TreeDataProvider<SnapshotNode> {
  private readonly emitter = new vscode.EventEmitter<SnapshotNode | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly memory: MemoryManager) {
    memory.onDidChange((c) => {
      if (c.kind === 'snapshot' || c.kind === 'bulk') {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: SnapshotNode): vscode.TreeItem {
    return node.toTreeItem();
  }

  async getChildren(): Promise<SnapshotNode[]> {
    return this.memory.getSnapshots().map((s) => new SnapshotNode(s));
  }
}

export class SnapshotNode {
  constructor(readonly snapshot: Snapshot) {}

  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.snapshot.label, vscode.TreeItemCollapsibleState.None);
    item.id = this.snapshot.id;
    item.contextValue = 'snapshot';
    item.description = new Date(this.snapshot.createdAt).toLocaleString();
    item.iconPath = new vscode.ThemeIcon('save');
    const s = this.snapshot.state;
    item.tooltip = new vscode.MarkdownString(
      `**${this.snapshot.label}**\n\n- Thoughts: ${s.thoughts.length}\n- Pinned files: ${s.pinnedFiles.length}\n- Skills: ${s.skills.length}`,
    );
    return item;
  }
}
