export type SkillStatus = 'ENABLED' | 'DISABLED' | 'ASK';

export interface Thought {
  id: string;
  modelId: string;
  text: string;
  timestamp: number;
  sourceReference?: string;
  tags?: string[];
  parentId?: string;
}

export type PinSource = 'recent-edit' | 'dwell' | 'spec' | 'manual';
export type PinRole = 'spec' | 'working';

export interface PinnedFile {
  path: string;
  pinnedAt: number;
  pinnedBy: string;
  note?: string;
  auto?: Exclude<PinSource, 'manual'>;
  expiresAt?: number;
  role?: PinRole;
}

export type SkillSource = 'auto' | 'manual';
export type SkillScope = 'workspace' | 'global';

export interface Skill {
  id: string;
  name: string;
  description?: string;
  status: SkillStatus;
  ownerModelId?: string;
  updatedAt: number;
  source?: SkillSource;
  sourceUri?: string;
  origin?: 'claude-skill' | 'claude-command' | 'cursor-rule' | 'cursor-skill' | 'gemini-skill';
  scope?: SkillScope;
}

export type McpHost =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'gemini'
  | 'windsurf'
  | 'vscode'
  | 'kilocode';

export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown';

export interface McpServer {
  id: string;
  name: string;
  host: McpHost;
  scope: SkillScope;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  disabled?: boolean;
  sourceUri: string;
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: number;
  state: PersistedState;
}

export interface PersistedState {
  version: 1;
  thoughts: Thought[];
  pinnedFiles: PinnedFile[];
  skills: Skill[];
  killSwitchEngaged: boolean;
  updatedAt: number;
}

export const EMPTY_STATE: PersistedState = {
  version: 1,
  thoughts: [],
  pinnedFiles: [],
  skills: [],
  killSwitchEngaged: false,
  updatedAt: 0,
};
