import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { PinnedFile } from '../memory/types';

type Node = GroupNode | PinnedNode;

export class PinnedFilesProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly memory: MemoryManager) {
    memory.onDidChange((c) => {
      if (c.kind === 'pinned' || c.kind === 'bulk') {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node.toTreeItem();
  }

  async getChildren(parent?: Node): Promise<Node[]> {
    const all = this.memory.getState().pinnedFiles;
    if (!parent) {
      const specs = all.filter(isSpec);
      const working = all.filter((f) => !isSpec(f));
      const groups: Node[] = [];
      if (specs.length > 0) {
        groups.push(new GroupNode('spec', specs.length));
      }
      if (working.length > 0) {
        groups.push(new GroupNode('working', working.length));
      }
      // Fallback: if both are empty, return nothing so welcome view shows.
      return groups;
    }
    if (parent instanceof GroupNode) {
      const list = (parent.kind === 'spec' ? all.filter(isSpec) : all.filter((f) => !isSpec(f)))
        .slice()
        .sort((a, b) => b.pinnedAt - a.pinnedAt);
      return list.map((f) => new PinnedNode(f));
    }
    return [];
  }
}

function isSpec(f: PinnedFile): boolean {
  return f.role === 'spec' || f.auto === 'spec';
}

class GroupNode {
  constructor(
    readonly kind: 'spec' | 'working',
    readonly count: number,
  ) {}

  toTreeItem(): vscode.TreeItem {
    const label = this.kind === 'spec' ? 'Spec / context' : 'Working memory';
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = `pinnedGroup.${this.kind}`;
    item.description = `${this.count}`;
    item.iconPath = new vscode.ThemeIcon(this.kind === 'spec' ? 'book' : 'edit');
    return item;
  }
}

export class PinnedNode {
  constructor(readonly file: PinnedFile) {}

  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(path.basename(this.file.path), vscode.TreeItemCollapsibleState.None);
    item.id = this.file.path;
    item.contextValue = 'pinnedFile';
    item.resourceUri = vscode.Uri.file(this.file.path);
    const auto = this.file.auto;
    const isSpecFile = isSpec(this.file);
    item.description = isSpecFile
      ? this.file.note ?? 'spec'
      : auto
      ? `auto · ${auto}`
      : this.file.pinnedBy;
    const expires = this.file.expiresAt
      ? `\n\nExpires: ${new Date(this.file.expiresAt).toLocaleString()}`
      : '';
    item.tooltip = new vscode.MarkdownString(
      `**${this.file.path}**\n\nPinned by \`${this.file.pinnedBy}\`${
        auto ? ` (auto: ${auto})` : ''
      } at ${new Date(this.file.pinnedAt).toLocaleString()}${
        this.file.note ? `\n\n${this.file.note}` : ''
      }${expires}`,
    );
    item.iconPath = new vscode.ThemeIcon(
      isSpecFile ? 'book' : auto ? 'sparkle' : 'pin',
    );
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [item.resourceUri],
    };
    return item;
  }
}
