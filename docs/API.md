# AI Context Bridge — Developer API

For end-user docs see [README.md](../README.md). This page is for extension authors and tool integrators who want to read or write the blackboard.

## Public extension API

When the extension activates it returns a small object you can drive from any other extension running in the same host:

```ts
import * as vscode from 'vscode';

const ext = vscode.extensions.getExtension('jeurboy.ai-context-bridge');
const api = await ext?.activate(); // ContextBridgeApi

api.memory.addThought({
  modelId: 'claude-opus-4-7',
  text: 'Refactored auth/middleware.ts; next: write integration tests.',
  sourceReference: '/abs/path/auth/middleware.ts',
});

api.memory.pinFile({
  path: '/abs/path/auth/middleware.ts',
  pinnedBy: 'claude-opus-4-7',
  note: 'in active rewrite',
});

const { enabled, ask, disabled } = api.toolFilter.filter(myToolDefs);

const decision = await api.hitl.authorize({
  skillId: 'shell.exec',
  skillName: 'Shell exec',
  modelId: 'gpt-5',
  summary: 'rm -rf node_modules',
});
// decision: 'allow-once' | 'allow-session' | 'deny'

const handoff = api.handoff.build(); // markdown bundle
```

### Surface

```ts
interface ContextBridgeApi {
  memory: MemoryManager;       // single source of truth — all writes go through this
  toolFilter: ToolFilter;      // partition a tool[] by ENABLED/ASK/DISABLED
  hitl: HITLManager;           // modal: allow once / allow session / deny
  handoff: HandoffPromptBuilder; // build a paste-ready handoff markdown
}
```

`MemoryManager` exposes `addThought`, `pinFile`, `unpinFile`, `registerSkill`, `setSkillStatus`, `createSnapshot`, `restoreSnapshot`, `forceSync`, plus `onDidChange` for subscribing to state changes. Read full state with `getState()`.

## State file

You can also bypass the API and read/write `<workspace>/.aicb/state.json` directly. The extension's file watcher will pick up changes and re-render every view.

```jsonc
{
  "version": 1,
  "thoughts": [
    {
      "id": "…",
      "modelId": "claude-opus-4-7",
      "text": "…",
      "timestamp": 1730000000000,
      "sourceReference": "/abs/path/file.ts",
      "tags": ["refactor"]
    }
  ],
  "pinnedFiles": [
    { "path": "/abs/path/file.ts", "pinnedBy": "gpt-5", "pinnedAt": 1730000000000 }
  ],
  "skills": [
    { "id": "shell.exec", "name": "Shell exec", "status": "ASK", "updatedAt": 1730000000000 }
  ],
  "killSwitchEngaged": false,
  "updatedAt": 1730000000000
}
```

Override the location with the `aiContextBridge.storagePath` setting. Snapshots live in `<workspace>/.aicb/snapshots.json`.

### Conventions when writing directly

- **Don't write `state.json` from multiple processes simultaneously.** The extension serializes writes through an internal queue and uses atomic `.tmp` → rename. External writers should do the same.
- **`updatedAt` is set on every mutation** by the extension; if you write directly, update it too so consumers can detect change.
- **Skill IDs are stable** (`shell.exec`, `fs.write`). Display names are mutable; IDs are not.
- **`source: 'auto'`** marks skills registered by auto-discovery — they get pruned on rescan if the source file disappears. Don't set this on skills you register manually.

## Development

```bash
npm install
npm run compile     # one-shot tsc
npm run watch       # tsc -w
# F5 in VS Code (or Cursor / Windsurf / VSCodium / Antigravity) → Extension Development Host
```

The Extension Development Host launches whichever editor you press F5 from, so you can develop and test against any VS Code-based host you have installed.

`tsconfig` is strict. Don't loosen it. If types are awkward, fix the types — don't add `any`.

## Architecture sketch

```
.aicb/
├─ state.json       ← single source of truth (PersistedState)
└─ snapshots.json   ← rollback points

src/
├─ memory/                ← MemoryManager (atomic write queue + EventEmitter)
├─ views/                 ← Skill / Pinned / Snapshot tree views, Thought timeline webview
├─ discovery/             ← Skill scan, auto-pin, spec import
├─ bridge/                ← Handoff prompt + agent-file writer
├─ safety/                ← ToolFilter, HITLManager
└─ extension.ts           ← activation + command wiring
```

`MemoryManager` is the only writer. Everything else subscribes to `onDidChange` and re-renders.
