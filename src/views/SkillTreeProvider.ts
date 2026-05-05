import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { Skill, SkillScope, SkillStatus } from '../memory/types';

type Node = GroupNode | SkillNode;

export class SkillTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly memory: MemoryManager) {
    memory.onDidChange((c) => {
      if (c.kind === 'skill' || c.kind === 'bulk') {
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
    const state = this.memory.getState();
    const skills = state.skills.slice().sort((a, b) => a.name.localeCompare(b.name));

    if (parent instanceof GroupNode) {
      return skills
        .filter((s) => scopeOf(s) === parent.scope)
        .map((s) => new SkillNode(s));
    }

    const hasWorkspace = skills.some((s) => scopeOf(s) === 'workspace');
    const hasGlobal = skills.some((s) => scopeOf(s) === 'global');

    if (hasWorkspace && hasGlobal) {
      return [
        new GroupNode('workspace', skills.filter((s) => scopeOf(s) === 'workspace').length),
        new GroupNode('global', skills.filter((s) => scopeOf(s) === 'global').length),
      ];
    }

    return skills.map((s) => new SkillNode(s));
  }
}

function scopeOf(skill: Skill): SkillScope {
  return skill.scope ?? 'workspace';
}

export class GroupNode {
  constructor(
    readonly scope: SkillScope,
    readonly count: number,
  ) {}

  toTreeItem(): vscode.TreeItem {
    const label = this.scope === 'global' ? 'Global (~/.claude, ~/.cursor, ~/.gemini)' : 'Workspace';
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `scope:${this.scope}`;
    item.contextValue = 'skillGroup';
    item.description = String(this.count);
    item.iconPath = new vscode.ThemeIcon(this.scope === 'global' ? 'globe' : 'folder');
    return item;
  }
}

export class SkillNode {
  constructor(readonly skill: Skill) {}

  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.skill.name, vscode.TreeItemCollapsibleState.None);
    item.id = this.skill.id;
    item.contextValue = 'skill';
    item.description = this.skill.status;
    item.tooltip = buildTooltip(this.skill);
    item.iconPath = statusIcon(this.skill.status);
    return item;
  }
}

function buildTooltip(skill: Skill): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = false;
  md.appendMarkdown(`**${skill.name}**\n\n`);
  if (skill.description) {
    md.appendMarkdown(`${skill.description}\n\n`);
  }
  md.appendMarkdown(`- Status: \`${skill.status}\`\n`);
  if (skill.scope) {
    md.appendMarkdown(`- Scope: \`${skill.scope}\`\n`);
  }
  if (skill.origin) {
    md.appendMarkdown(`- Origin: \`${skill.origin}\`\n`);
  }
  if (skill.ownerModelId) {
    md.appendMarkdown(`- Owner model: \`${skill.ownerModelId}\`\n`);
  }
  md.appendMarkdown(`- Updated: ${new Date(skill.updatedAt).toLocaleString()}\n`);
  return md;
}

function statusIcon(status: SkillStatus): vscode.ThemeIcon {
  switch (status) {
    case 'ENABLED':
      return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
    case 'DISABLED':
      return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('errorForeground'));
    case 'ASK':
      return new vscode.ThemeIcon('question', new vscode.ThemeColor('charts.yellow'));
  }
}
