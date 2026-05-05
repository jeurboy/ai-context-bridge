import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  EMPTY_STATE,
  PersistedState,
  PinnedFile,
  Skill,
  SkillStatus,
  Snapshot,
  Thought,
} from './types';

type ChangeKind =
  | 'thought'
  | 'pinned'
  | 'skill'
  | 'snapshot'
  | 'bulk';

export interface MemoryChange {
  kind: ChangeKind;
  state: PersistedState;
}

export class MemoryManager implements vscode.Disposable {
  private state: PersistedState = { ...EMPTY_STATE };
  private snapshots: Snapshot[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly emitter = new vscode.EventEmitter<MemoryChange>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly storagePath: string,
    private readonly snapshotPath: string,
  ) {}

  static async create(context: vscode.ExtensionContext): Promise<MemoryManager> {
    const folder = MemoryManager.resolveStorageDir(context);
    await fs.promises.mkdir(folder, { recursive: true });
    const statePath = path.join(folder, 'state.json');
    const snapshotsPath = path.join(folder, 'snapshots.json');
    const mgr = new MemoryManager(statePath, snapshotsPath);
    await mgr.load();
    return mgr;
  }

  private static resolveStorageDir(context: vscode.ExtensionContext): string {
    const cfg = vscode.workspace.getConfiguration('aiContextBridge');
    const custom = cfg.get<string>('storagePath');
    if (custom && custom.trim().length > 0) {
      return custom;
    }
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (ws) {
      return path.join(ws.uri.fsPath, '.aicb');
    }
    return path.join(context.globalStorageUri.fsPath, 'aicb');
  }

  private async load(): Promise<void> {
    this.state = await this.readJson<PersistedState>(this.storagePath, {
      ...EMPTY_STATE,
    });
    if (!this.state.version) {
      this.state = { ...EMPTY_STATE, ...this.state, version: 1 };
    }
    this.snapshots = await this.readJson<Snapshot[]>(this.snapshotPath, []);
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.promises.readFile(file, 'utf8');
      if (!raw.trim()) {
        return fallback;
      }
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return fallback;
      }
      throw err;
    }
  }

  getState(): PersistedState {
    return this.state;
  }

  getSnapshots(): Snapshot[] {
    return this.snapshots;
  }

  getStoragePath(): string {
    return this.storagePath;
  }

  // ---------- Thought ----------

  addThought(input: Omit<Thought, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): Thought {
    const thought: Thought = {
      id: input.id ?? cryptoRandomId(),
      modelId: input.modelId,
      text: input.text,
      timestamp: input.timestamp ?? Date.now(),
      sourceReference: input.sourceReference,
      tags: input.tags,
      parentId: input.parentId,
    };
    this.state.thoughts.push(thought);
    this.touch();
    this.persist('thought');
    return thought;
  }

  clearThoughts(): void {
    this.state.thoughts = [];
    this.touch();
    this.persist('thought');
  }

  // ---------- Pinned files ----------

  pinFile(file: Omit<PinnedFile, 'pinnedAt'> & { pinnedAt?: number }): PinnedFile {
    const existing = this.state.pinnedFiles.find((f) => f.path === file.path);
    if (existing) {
      // Manual pin always wins over auto — don't downgrade.
      const promoting = existing.auto && !file.auto;
      existing.pinnedBy = file.pinnedBy;
      if (file.note !== undefined) {
        existing.note = file.note;
      }
      existing.pinnedAt = file.pinnedAt ?? Date.now();
      if (promoting) {
        delete existing.auto;
        delete existing.expiresAt;
      } else if (file.auto) {
        existing.auto = file.auto;
        existing.expiresAt = file.expiresAt;
      }
      if (file.role !== undefined) {
        existing.role = file.role;
      }
      this.touch();
      this.persist('pinned');
      return existing;
    }
    const pinned: PinnedFile = {
      path: file.path,
      pinnedBy: file.pinnedBy,
      note: file.note,
      pinnedAt: file.pinnedAt ?? Date.now(),
      auto: file.auto,
      expiresAt: file.expiresAt,
      role: file.role,
    };
    this.state.pinnedFiles.push(pinned);
    this.touch();
    this.persist('pinned');
    return pinned;
  }

  cleanupExpiredAutoPins(now: number = Date.now()): number {
    const before = this.state.pinnedFiles.length;
    this.state.pinnedFiles = this.state.pinnedFiles.filter(
      (f) => !(f.auto && f.expiresAt && f.expiresAt <= now),
    );
    const removed = before - this.state.pinnedFiles.length;
    if (removed > 0) {
      this.touch();
      this.persist('pinned');
    }
    return removed;
  }

  unpinFile(filePath: string): boolean {
    const before = this.state.pinnedFiles.length;
    this.state.pinnedFiles = this.state.pinnedFiles.filter((f) => f.path !== filePath);
    if (this.state.pinnedFiles.length === before) {
      return false;
    }
    this.touch();
    this.persist('pinned');
    return true;
  }

  isPinned(filePath: string): boolean {
    return this.state.pinnedFiles.some((f) => f.path === filePath);
  }

  // ---------- Skills ----------

  registerSkill(skill: Omit<Skill, 'updatedAt'> & { updatedAt?: number }): Skill {
    const existing = this.state.skills.find((s) => s.id === skill.id);
    if (existing) {
      existing.name = skill.name;
      existing.description = skill.description;
      existing.ownerModelId = skill.ownerModelId;
      if (skill.sourceUri !== undefined) {
        existing.sourceUri = skill.sourceUri;
      }
      if (skill.origin !== undefined) {
        existing.origin = skill.origin;
      }
      if (skill.scope !== undefined) {
        existing.scope = skill.scope;
      }
      // Manual registration always wins — promote auto → manual, never demote.
      if (skill.source === 'manual' || !existing.source) {
        existing.source = skill.source ?? 'manual';
      }
      existing.updatedAt = Date.now();
      this.touch();
      this.persist('skill');
      return existing;
    }
    const created: Skill = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      status: skill.status,
      ownerModelId: skill.ownerModelId,
      source: skill.source ?? 'manual',
      sourceUri: skill.sourceUri,
      origin: skill.origin,
      scope: skill.scope,
      updatedAt: Date.now(),
    };
    this.state.skills.push(created);
    this.touch();
    this.persist('skill');
    return created;
  }

  reconcileAutoSkills(presentIds: Set<string>): number {
    const before = this.state.skills.length;
    // Treat legacy skills (no `source` field) as auto so stale entries
    // from older versions get pruned. Only `source: 'manual'` survives.
    this.state.skills = this.state.skills.filter((s) => {
      const isAuto = s.source !== 'manual';
      if (!isAuto) {
        return true;
      }
      return presentIds.has(s.id);
    });
    const removed = before - this.state.skills.length;
    if (removed > 0) {
      this.touch();
      this.persist('skill');
    }
    return removed;
  }

  setSkillStatus(skillId: string, status: SkillStatus): Skill | undefined {
    const skill = this.state.skills.find((s) => s.id === skillId);
    if (!skill) {
      return undefined;
    }
    if (skill.status === status) {
      return skill;
    }
    skill.status = status;
    skill.updatedAt = Date.now();
    this.touch();
    this.persist('skill');
    return skill;
  }

  removeSkill(skillId: string): boolean {
    const before = this.state.skills.length;
    this.state.skills = this.state.skills.filter((s) => s.id !== skillId);
    if (this.state.skills.length === before) {
      return false;
    }
    this.touch();
    this.persist('skill');
    return true;
  }

  effectiveStatus(skillId: string): SkillStatus | undefined {
    return this.state.skills.find((s) => s.id === skillId)?.status;
  }

  // ---------- Snapshots ----------

  createSnapshot(label: string): Snapshot {
    const snap: Snapshot = {
      id: cryptoRandomId(),
      label,
      createdAt: Date.now(),
      state: structuredClone(this.state),
    };
    this.snapshots.unshift(snap);
    void this.persistSnapshots();
    this.emitter.fire({ kind: 'snapshot', state: this.state });
    return snap;
  }

  restoreSnapshot(snapshotId: string): boolean {
    const snap = this.snapshots.find((s) => s.id === snapshotId);
    if (!snap) {
      return false;
    }
    this.state = structuredClone(snap.state);
    this.touch();
    this.persist('bulk');
    return true;
  }

  deleteSnapshot(snapshotId: string): boolean {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((s) => s.id !== snapshotId);
    if (this.snapshots.length === before) {
      return false;
    }
    void this.persistSnapshots();
    this.emitter.fire({ kind: 'snapshot', state: this.state });
    return true;
  }

  // ---------- Persistence ----------

  async forceSync(): Promise<void> {
    await this.flush('bulk');
    await this.persistSnapshots();
  }

  private touch(): void {
    this.state.updatedAt = Date.now();
  }

  private persist(kind: ChangeKind): void {
    const cfg = vscode.workspace.getConfiguration('aiContextBridge');
    const auto = cfg.get<boolean>('autoSync', true);
    if (auto) {
      void this.flush(kind);
    } else {
      this.emitter.fire({ kind, state: this.state });
    }
  }

  private flush(kind: ChangeKind): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const tmp = `${this.storagePath}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
        await fs.promises.rename(tmp, this.storagePath);
        this.emitter.fire({ kind, state: this.state });
      });
    return this.writeQueue;
  }

  private async persistSnapshots(): Promise<void> {
    const tmp = `${this.snapshotPath}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(this.snapshots, null, 2), 'utf8');
    await fs.promises.rename(tmp, this.snapshotPath);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

function cryptoRandomId(): string {
  // 12-byte random hex; avoids Node 'crypto' import for portability
  const bytes = new Uint8Array(12);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
