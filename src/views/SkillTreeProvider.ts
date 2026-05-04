import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { Skill, SkillStatus } from '../memory/types';

export class SkillTreeProvider implements vscode.TreeDataProvider<SkillNode> {
  private readonly emitter = new vscode.EventEmitter<SkillNode | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly memory: MemoryManager) {
    memory.onDidChange((c) => {
      if (c.kind === 'skill' || c.kind === 'killSwitch' || c.kind === 'bulk') {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: SkillNode): vscode.TreeItem {
    return node.toTreeItem();
  }

  async getChildren(): Promise<SkillNode[]> {
    const state = this.memory.getState();
    const killed = state.killSwitchEngaged;
    return state.skills
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => new SkillNode(s, killed));
  }
}

export class SkillNode {
  constructor(
    readonly skill: Skill,
    readonly killed: boolean,
  ) {}

  toTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.skill.name, vscode.TreeItemCollapsibleState.None);
    item.id = this.skill.id;
    item.contextValue = 'skill';
    item.description = effectiveLabel(this.skill.status, this.killed);
    item.tooltip = buildTooltip(this.skill, this.killed);
    item.iconPath = statusIcon(this.skill.status, this.killed);
    return item;
  }
}

function effectiveLabel(status: SkillStatus, killed: boolean): string {
  if (killed) {
    return 'KILL SWITCH';
  }
  return status;
}

function buildTooltip(skill: Skill, killed: boolean): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = false;
  md.appendMarkdown(`**${skill.name}**\n\n`);
  if (skill.description) {
    md.appendMarkdown(`${skill.description}\n\n`);
  }
  md.appendMarkdown(`- Status: \`${skill.status}\`\n`);
  if (killed) {
    md.appendMarkdown(`- Kill switch active — effective status \`DISABLED\`\n`);
  }
  if (skill.ownerModelId) {
    md.appendMarkdown(`- Owner model: \`${skill.ownerModelId}\`\n`);
  }
  md.appendMarkdown(`- Updated: ${new Date(skill.updatedAt).toLocaleString()}\n`);
  return md;
}

function statusIcon(status: SkillStatus, killed: boolean): vscode.ThemeIcon {
  if (killed) {
    return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('errorForeground'));
  }
  switch (status) {
    case 'ENABLED':
      return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
    case 'DISABLED':
      return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('errorForeground'));
    case 'ASK':
      return new vscode.ThemeIcon('question', new vscode.ThemeColor('charts.yellow'));
  }
}
