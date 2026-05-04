import { MemoryManager } from '../memory/MemoryManager';
import { SkillStatus } from '../memory/types';

export interface ToolDefinition {
  name: string;
  [key: string]: unknown;
}

export interface FilterResult<T extends ToolDefinition> {
  enabled: T[];
  ask: T[];
  disabled: T[];
}

export class ToolFilter {
  constructor(private readonly memory: MemoryManager) {}

  filter<T extends ToolDefinition>(tools: T[]): FilterResult<T> {
    const enabled: T[] = [];
    const ask: T[] = [];
    const disabled: T[] = [];
    for (const tool of tools) {
      const status = this.statusFor(tool.name);
      if (status === 'DISABLED') {
        disabled.push(tool);
      } else if (status === 'ASK') {
        ask.push(tool);
      } else {
        enabled.push(tool);
      }
    }
    return { enabled, ask, disabled };
  }

  statusFor(skillId: string): SkillStatus {
    return this.memory.effectiveStatus(skillId) ?? 'ENABLED';
  }
}
