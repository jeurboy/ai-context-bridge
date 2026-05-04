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

export interface Skill {
  id: string;
  name: string;
  description?: string;
  status: SkillStatus;
  ownerModelId?: string;
  updatedAt: number;
  source?: SkillSource;
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
