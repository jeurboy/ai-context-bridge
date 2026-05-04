import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';

export type AskDecision = 'allow-once' | 'allow-session' | 'deny';

export interface AskRequest {
  skillId: string;
  skillName: string;
  modelId: string;
  summary: string;
}

export class HITLManager {
  private readonly sessionAllow = new Set<string>();

  constructor(private readonly memory: MemoryManager) {}

  async authorize(req: AskRequest): Promise<AskDecision> {
    if (this.memory.getState().killSwitchEngaged) {
      return 'deny';
    }
    const status = this.memory.effectiveStatus(req.skillId);
    if (status === 'DISABLED') {
      return 'deny';
    }
    if (status === 'ENABLED') {
      return 'allow-once';
    }
    if (this.sessionAllow.has(req.skillId)) {
      return 'allow-session';
    }
    const choice = await vscode.window.showWarningMessage(
      `${req.modelId} wants to run skill "${req.skillName}".\n\n${req.summary}`,
      { modal: true },
      'Allow once',
      'Allow this session',
      'Deny',
    );
    if (choice === 'Allow once') {
      return 'allow-once';
    }
    if (choice === 'Allow this session') {
      this.sessionAllow.add(req.skillId);
      return 'allow-session';
    }
    return 'deny';
  }

  resetSession(): void {
    this.sessionAllow.clear();
  }
}
