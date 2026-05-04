# AI Context Bridge

**English** · [ภาษาไทย](README.th.md)

> Shared blackboard memory + skill control center for multi-model AI workflows. Runs in **VS Code** and any VS Code-based editor: **Cursor**, **Windsurf**, **Google Antigravity**, **VSCodium**, **Trae**, **Void**, **code-server**, etc.

When you switch from Claude → GPT → Gemini mid-task, you usually have to re-explain everything. **AI Context Bridge** keeps a small, local JSON blackboard that any agent can read and write — so the next model picks up where the last one left off.

It's pure state management. No API calls. No token math. No cloud sync. Just a transparent, local memory you control.

---

## What you can do with it

- **Hand off work between AIs without re-explaining** — Claude finishes, then GPT picks up exactly where it left off (same pinned files, same recent thoughts, same skill rules).
- **See what every model thought, in order** — a single Thought Timeline with model badges and handoff hints.
- **Pin the files that matter right now** — 📌 badges on tabs and Explorer; auto-pin recent edits; spec files (CLAUDE.md, AGENTS.md, .cursorrules, …) are pinned automatically.
- **Decide which AI capabilities are allowed** — every "skill" has a 3-state toggle: ✅ Enabled / ❓ Ask / ⛔ Disabled. Hit the kill switch to disable everything at once.
- **Roll back if an agent breaks something** — one-click snapshots of the entire memory state.
- **Stay private** — everything is local JSON in your workspace. No telemetry, no cloud, no account.

---

## Install

### VS Code Marketplace

Search **AI Context Bridge** in the Extensions panel, or:

```bash
code --install-extension jeurboy.ai-context-bridge
```

### Open VSX (Cursor / Windsurf / VSCodium / code-server / Theia)

Search **AI Context Bridge** in the Extensions panel — most non-Microsoft editors use Open VSX as their default registry.

### From `.vsix` (any VS Code-based editor)

Download the latest `.vsix` from [Releases](https://github.com/jeurboy/ai-context-bridge/releases), then:

```bash
# VS Code / VS Code Insiders
code --install-extension ai-context-bridge-0.2.2.vsix

# Cursor
cursor --install-extension ai-context-bridge-0.2.2.vsix

# Windsurf
windsurf --install-extension ai-context-bridge-0.2.2.vsix

# VSCodium
codium --install-extension ai-context-bridge-0.2.2.vsix
```

Or via UI on any VS Code-based editor (including **Google Antigravity**, **Trae**, **Void**): Extensions panel → `...` menu → **Install from VSIX...**

---

## Editor compatibility

Uses only the stable VS Code Extension API (`vscode` ^1.85.0), so it works in any VS Code-compatible host:

| Editor | Install | Notes |
| --- | --- | --- |
| **VS Code** / **Insiders** | Marketplace | Primary target |
| **Cursor** | Open VSX / `.vsix` | Composer can read `.aicb/state.json` if you point it there |
| **Windsurf** | Open VSX / `.vsix` | Cascade picks up the bridged block via `.windsurfrules` |
| **Google Antigravity** | `.vsix` | Sidebar + activity bar render normally |
| **VSCodium** | Open VSX | Fully supported |
| **Trae / Void / code-server / Theia / Gitpod / Coder** | `.vsix` or Open VSX | Anything with the standard Extension API works |

---

## First 5 minutes

1. **Open the sidebar.** Click the 🧠 **AI Context Bridge** icon in the Activity Bar. You'll see three views: **Skills**, **Pinned Files**, **Snapshots**.
2. **Let auto-discovery do its thing.** If your project has a `.claude/skills/` or `.claude/commands/` folder, those skills appear automatically. Spec files (CLAUDE.md, AGENTS.md, .cursorrules, README, ARCHITECTURE.md, plans/, rfcs/, …) are pinned to the **Spec / context** group on activation.
3. **Set the rules.** In the Skills view, click the ✅ / ❓ / ⛔ icons next to each skill to toggle Enabled / Ask / Disabled. ❓ Ask means a confirmation modal pops up every time an agent tries to use it.
4. **Hand off context.** When you switch AIs, run **AI Context Bridge: Copy Handoff Prompt** from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`). Paste the result into your next agent — it gets the specs, the pinned files, recent thoughts, and your skill rules in one shot.
5. **(Optional) Auto-bridge.** Turn on `aiContextBridge.exportToAgentFiles` and the extension keeps a managed block inside `CLAUDE.md` / `AGENTS.md` / `.cursorrules` / `.windsurfrules` / `.github/copilot-instructions.md` updated. Any AI that reads its own convention file gets the bridge automatically — no copy-paste needed.

---

## Daily usage

### The sidebar

Open the 🧠 icon in the Activity Bar.

**Skills view** — every AI capability registered for this workspace.
- Toolbar: ➕ Register skill · 🔄 Rescan skills · ⏱️ Open timeline · 💬 Add thought · ⛔ Kill switch
- Click the inline icons next to each skill to toggle ✅ Enabled / ❓ Ask / ⛔ Disabled
- A skill set to **Ask** triggers a modal whenever an agent tries to use it: **Allow once** / **Allow this session** / **Deny**

**Pinned Files view** — files in working memory, split into:
- **Spec / context** — auto-imported, never expire (CLAUDE.md, AGENTS.md, .cursorrules, README, plans/, …)
- **Working memory** — recent edits, dwell-pins, and files you pinned manually
- Toolbar: 📌 Pin current file · 📋 Copy handoff prompt · 🔄 Rescan specs · ↔️ Bridge to agent files now
- Right-click → Unpin to remove

**Snapshots view** — points-in-time of the whole memory state.
- Toolbar: 💾 Create snapshot
- Click ↩️ to restore, 🗑️ to delete

### The status bar (bottom-left)

- 🛡️ **Live** / ⛔ **KILL** — click to toggle the global kill switch (engaged = every skill behaves as Disabled)
- 🧠 **N skills · M pinned · K thoughts** — quick stats; click to **Force Sync** to disk
- 🕒 **Timeline** — click to open the Thought Timeline

### Pinning a file

- **From the editor:** click the 📌 icon in the editor title bar
- **From a tab:** look for the 📌 badge — present means pinned
- **Auto:** files you save (or that you keep open for `autoPinDwellMinutes`) get auto-pinned and expire after `autoPinExpireMinutes` of inactivity. Manual pins never expire.

### Handing off to another AI

The fastest way: **Command Palette → AI Context Bridge: Copy Handoff Prompt** → paste into the next chat.

The "always-on" way: enable `aiContextBridge.exportToAgentFiles`. The extension writes a managed `<!-- AICB:BEGIN ... AICB:END -->` block inside whichever convention files exist (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, GEMINI.md, .github/copilot-instructions.md). Edit the rest of those files freely — only the marked block is touched.

By default, files outside the marked block are never created. Set `agentFilesOnlyExisting: false` if you want missing convention files auto-created.

### Per-editor convention files

When `exportToAgentFiles` is on, this is what each AI reads automatically:

- **Claude Code / Claude Desktop** → `CLAUDE.md`
- **Cursor** → `.cursorrules`, `.cursor/rules/**/*.{md,mdc}`
- **Windsurf** → `.windsurfrules`
- **GitHub Copilot** → `.github/copilot-instructions.md`
- **OpenAI Codex / Agents SDK** → `AGENTS.md`, `AGENT.md`
- **Google Gemini / Antigravity** → `GEMINI.md`

Tweak the list with the `aiContextBridge.agentFiles` and `aiContextBridge.specPatterns` settings.

---

## Commands (Command Palette)

| Command | What it does |
| --- | --- |
| `Open Thought Timeline` | Open the timeline webview |
| `Global Kill Switch` | Toggle disable-all |
| `Force Sync` | Persist the in-memory state to disk now |
| `Register Skill` | Add a skill manually |
| `Rescan Skills` | Re-scan `.claude/skills` and `.claude/commands` |
| `Rescan Spec Files` | Re-scan spec/agent files in the workspace |
| `Pin File to Memory` | Pin the active file |
| `Add Thought` | Append a thought to the timeline |
| `Create Snapshot` | Save a rollback point |
| `Copy Handoff Prompt` | Copy the full handoff bundle to clipboard |
| `Bridge to Agent Files Now` | Write the managed block into agent files immediately |

---

## Settings

| Setting | Default | What it controls |
| --- | --- | --- |
| `aiContextBridge.storagePath` | `""` | Where `state.json` lives. Empty = `<workspace>/.aicb/state.json` |
| `aiContextBridge.autoSync` | `true` | Save on every change. Off = click **Force Sync** when you want to persist |
| `aiContextBridge.killSwitchEngaged` | `false` | Sticky kill switch — disables every skill regardless of individual status |
| `aiContextBridge.autoDiscoverSkills` | `true` | Scan `.claude/skills/**/SKILL.md` and `.claude/commands/**/*.md` automatically |
| `aiContextBridge.autoPinRecentEdits` | `true` | Auto-pin a file when you save it |
| `aiContextBridge.autoPinDwellMinutes` | `5` | Auto-pin after a file has been the active editor this many minutes (`0` = off) |
| `aiContextBridge.autoPinExpireMinutes` | `60` | Auto-pins expire after this many minutes of inactivity (manual pins never expire) |
| `aiContextBridge.autoPinBackfillCount` | `8` | On first activation with no pinned files, pin the N most-recently modified files (`0` = off) |
| `aiContextBridge.autoImportSpecFiles` | `true` | Auto-detect and pin spec/agent files |
| `aiContextBridge.specPatterns` | (long list) | Glob patterns treated as "spec / context" |
| `aiContextBridge.exportToAgentFiles` | `false` | Keep a managed block inside agent convention files |
| `aiContextBridge.agentFiles` | CLAUDE.md, AGENTS.md, … | Which files to bridge into |
| `aiContextBridge.agentFilesOnlyExisting` | `true` | Only update files that already exist (don't auto-create) |

---

## Tips

- **Don't see your skills?** Click 🔄 **Rescan Skills** on the Skills view, or check that `.claude/skills/<name>/SKILL.md` files exist.
- **Status bar shows wrong counts?** Click the 🧠 status item to **Force Sync**.
- **Want to pause everything?** Click the 🛡️ **Live** badge in the status bar — it flips to ⛔ **KILL** and every skill behaves as Disabled. Click again to release.
- **Switching machines?** `state.json` is plain JSON in `<workspace>/.aicb/`. Commit it (or don't) — it's yours.
- **Exporting context to a fresh chat?** Use **Copy Handoff Prompt**. It's the single fastest way to bring a new AI up to speed.

---

## Why this exists

Modern coding flows mix multiple models. Each one has its own scratch context, and human-in-the-loop boundaries get lost between handoffs. AI Context Bridge gives you:

- **Visibility** — see what each model thought, in order, with model badges
- **Control** — gate any tool call behind a modal, or freeze it entirely
- **Continuity** — the next agent reads `state.json` and just keeps going

Everything is local. There is no telemetry, no network sync, no cloud account. Privacy by design.

---

## For extension authors

Other extensions can drive the blackboard via a small public API. See [docs/API.md](docs/API.md) for details, or:

```ts
const ext = vscode.extensions.getExtension('jeurboy.ai-context-bridge');
const api = await ext?.activate();
api.memory.addThought({ modelId: 'claude-opus-4-7', text: '…' });
```

You can also write `<workspace>/.aicb/state.json` directly — every change is picked up automatically.

---

## License

MIT — see [LICENSE](LICENSE).
