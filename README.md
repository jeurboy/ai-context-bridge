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
- **Decide which AI capabilities are allowed** — every "skill" has a 3-state toggle: ✅ Enabled / ❓ Ask / ⛔ Disabled.
- **Sync targets without hunting through views** — Quick Actions includes one Target Settings picker for skill mirrors, context bridge files, and MCP copy targets.
- **Repair generated context blocks** — `Sync All Now` deduplicates AICB-managed blocks while leaving user-written text outside the markers alone.
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
code --install-extension ai-context-bridge-0.6.0.vsix

# Cursor
cursor --install-extension ai-context-bridge-0.6.0.vsix

# Windsurf
windsurf --install-extension ai-context-bridge-0.6.0.vsix

# VSCodium
codium --install-extension ai-context-bridge-0.6.0.vsix
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

1. **Open the sidebar.** Click the 🧠 **AI Context Bridge** icon in the Activity Bar. You'll see five views: **Quick Actions**, **Skills**, **Pinned Files**, **Snapshots**, **MCP Servers**.
2. **Let auto-discovery do its thing.** Skills under `.claude/skills/`, `.cursor/`, `.gemini/`, `.codex/`, `.agent/` (and their `~/...` global counterparts when enabled) are detected automatically. Spec files (CLAUDE.md, AGENTS.md, .cursorrules, README, ARCHITECTURE.md, plans/, rfcs/, …) are pinned to the **Spec / context** group on activation. MCP servers are pulled from each host's config file (`.mcp.json`, `~/.claude.json`, Claude Desktop, Cursor, Gemini, Windsurf, VS Code, Kilocode, Codex).
3. **Hit Sync All Now.** The big button in the Quick Actions panel writes the AICB block into every configured agent file (CLAUDE.md, AGENTS.md, .cursorrules, …), mirrors skills cross-agent, and refreshes the MCP inventory in one click. The same button also lives on the Pinned Files and Snapshots toolbars, plus the status bar.
4. **Hand off when needed.** Use **Copy Bootstrap Prompt** in Quick Actions to copy a paths-only prompt into agents that read files themselves (Codex CLI, Aider). For agents in a chat box that don't have file access, the Skill API also exposes `copyHandoffPrompt` programmatically.
5. **(Optional) Tune the targets.** Use **Target Settings** in Quick Actions to choose skill mirror targets, context bridge files, and default MCP copy targets in one picker.

> **This extension is sync-only — it does not manage skill state.** Skill statuses (`ENABLED` / `ASK` / `DISABLED`) are determined automatically by name/description (skills with `exec`/`run`/`delete`/`push`/etc. become `ASK`). The UI displays them; you cannot edit them. To exclude a skill, remove it at the source (delete from `.claude/skills/...`).

---

## Daily usage

### The sidebar

Open the 🧠 icon in the Activity Bar.

**Skills view** — every AI capability auto-discovered for this workspace (read-only).
- Toolbar: 🔁 Rescan skills · "..." overflow (timeline, mirror, configure mirror targets)
- Status (✅ Enabled / ❓ Ask / ⛔ Disabled) is determined automatically from each skill's name/description; the UI **displays** it but does not let you edit it. Risky-looking skills (anything matching `exec | run | delete | push | …`) default to **Ask**.
- A skill set to **Ask** triggers a HITL modal when an agent calls the public `hitl.authorize()` API: **Allow once** / **Allow this session** / **Deny**

**Pinned Files view** — files in working memory, split into:
- **Spec / context** — auto-imported, never expire (CLAUDE.md, AGENTS.md, .cursorrules, README, plans/, …)
- **Working memory** — recent edits, dwell-pins, and files you pinned manually
- Toolbar: 📌 Pin current file · 📋 Copy handoff prompt · 🔄 Rescan specs · ↔️ Bridge to agent files now
- Right-click → Unpin to remove

**Snapshots view** — points-in-time of the whole memory state.
- Toolbar: 💾 Create snapshot
- Click ↩️ to restore, 🗑️ to delete

### The status bar (bottom-left)

- 🧠 **N skills · M pinned · K thoughts** — quick stats; click to **Force Sync** to disk
- 🕒 **Timeline** — click to open the Thought Timeline

### Pinning a file

- **From the editor:** click the 📌 icon in the editor title bar
- **From a tab:** look for the 📌 badge — present means pinned
- **Auto:** files you save (or that you keep open for `autoPinDwellMinutes`) get auto-pinned and expire after `autoPinExpireMinutes` of inactivity. Manual pins never expire.

### Handing off to another AI

The fastest way: click the **Copy Handoff Prompt** button on the Pinned Files view title bar → paste into the next chat.

The "always-on" way: enable `aiContextBridge.exportToAgentFiles`. The extension writes a managed `<!-- AICB:BEGIN ... AICB:END -->` block inside whichever convention files exist (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, GEMINI.md, .github/copilot-instructions.md). Edit the rest of those files freely — only the marked block is touched.

By default, files outside the marked block are never created. Set `agentFilesOnlyExisting: false` if you want missing convention files auto-created.

### Per-editor convention files

When `exportToAgentFiles` is on, this is what each AI reads automatically:

- **Claude Code / Claude Desktop** → `CLAUDE.md`
- **Cursor** → `.cursorrules`, `.cursor/rules/**/*.{md,mdc}`
- **Windsurf** → `.windsurfrules`
- **GitHub Copilot** → `.github/copilot-instructions.md`
- **OpenAI Codex** → `AGENTS.md` at repo root (project guidance), `~/.codex/AGENTS.md` (global guidance — opt-in via `aiContextBridge.agentFiles`)
- **Agents SDK / legacy** → `AGENT.md`
- **Google Gemini / Antigravity** → `GEMINI.md`
- **Kilocode** → `.kilocoderules`, `.kilocode/rules/aicb.md`
- **Generic agent (`.agent`)** → `.agent/AGENTS.md`, `.agent/rules/aicb.md`

Tweak the list with the `aiContextBridge.agentFiles` and `aiContextBridge.specPatterns` settings.

---

### Agent path reference

The full map of where AI Context Bridge **reads from** (discovery) and **writes to** (mirror / sync) for each host. Workspace paths are relative to the project root; global paths are under the user's home directory.

#### Skill discovery + mirror

| Host | Workspace skills (read) | Global skills (read) | Mirror target (write) |
| --- | --- | --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md`, `.claude/commands/<name>.md` | `~/.claude/skills/<name>/SKILL.md`, `~/.claude/commands/<name>.md` | `.claude/commands/aicb-<id>.md` (mirrors **from** Gemini origin) |
| Cursor | `.cursor/skills/**/*.md`, `.cursor/rules/**/*.{md,mdc}` | `~/.cursor/skills/**`, `~/.cursor/rules/**` | `.cursor/rules/aicb-<id>.mdc` |
| Gemini | `.gemini/skills/**/*.md` | `~/.gemini/skills/**/*.md` | `.gemini/skills/aicb-<id>.md` |
| Kilocode | (no read scan yet — uses workspace skills via mirror) | — | `.kilocode/skills/aicb-<id>/SKILL.md` |
| Codex | `.codex/skills/<name>/SKILL.md` (non-standard — Codex itself does not specify a skill folder; convention used here for parity with Claude) | `~/.codex/skills/<name>/SKILL.md` (resolved under `$CODEX_HOME` if set) | `.codex/skills/aicb-<id>/SKILL.md` |
| Agent (`.agent`) | `.agent/skills/<name>/SKILL.md` | `~/.agent/skills/<name>/SKILL.md` | `.agent/skills/aicb-<id>/SKILL.md` |
| Claude Desktop / Windsurf / VS Code Copilot | _(not applicable — these hosts don't expose skill folders)_ | — | — |

Mirror targets are gated by the `aiContextBridge.mirrorSkillsToOtherAgents` setting. Generated files carry an `AICB:GENERATED` marker — they're auto-pruned when the source disappears, and AICB will never overwrite a hand-authored file at the same path.

#### MCP server discovery + sync

| Host | Workspace config | Global config | JSON key |
| --- | --- | --- | --- |
| Claude Code | `.mcp.json` | `~/.claude.json` | `mcpServers` |
| Claude Desktop | _(none)_ | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%\Claude\claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `~/.cursor/mcp.json` | `mcpServers` |
| Gemini | `.gemini/settings.json` | `~/.gemini/settings.json` | `mcpServers` |
| Windsurf | _(none)_ | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| VS Code Copilot | `.vscode/mcp.json` | _(use VS Code user setting)_ | `servers` |
| Kilocode | `.kilocode/mcp.json` | `~/Library/Application Support/Code/User/globalStorage/kilocode.kilo-code/settings/mcp_settings.json` (and Cursor / Code-Insiders variants on the corresponding OS path) | `mcpServers` |
| Codex | `.codex/mcp.json` | `~/.codex/mcp.json` (override with `$CODEX_HOME`) | `mcpServers` |
| Agent (`.agent`) | `.agent/mcp.json` | `~/.agent/mcp.json` | `mcpServers` |

Per-server copy uses these exact files as targets. Synced entries are tagged with `_aicbGenerated: true` + `_aicbSource: "<host>:<scope>"` so they're identifiable on the next round-trip. Hand-authored entries with the same name prompt before overwrite.

> **Note (Codex CLI):** the official Codex CLI stores MCP servers in `~/.codex/config.toml` (TOML format). AI Context Bridge currently only reads/writes JSON, so Codex sync uses `.codex/mcp.json` as a parallel JSON file rather than the canonical TOML. Native TOML support is on the roadmap.

#### Handoff context (`.aicb` block)

| Host | Where the bridge writes the handoff block |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenAI Codex | `AGENTS.md` at repo root (project), `~/.codex/AGENTS.md` (global — opt-in). `AGENTS.override.md` takes precedence at any level. Codex concatenates from root down toward CWD; later files override earlier. Customize via `CODEX_HOME` env var. |
| Agents SDK / legacy | `AGENT.md` |
| Gemini / Antigravity | `GEMINI.md` |
| Kilocode | `.kilocoderules`, `.kilocode/rules/aicb.md` |
| Agent (`.agent`) | `.agent/AGENTS.md`, `.agent/rules/aicb.md` |

The bridge only updates content **between** the `<!-- AICB:BEGIN -->` and `<!-- AICB:END -->` markers — anything else in those files is preserved verbatim. Each generated block carries checksum metadata. `Sync All Now` repairs duplicate managed blocks by collapsing them back to one fresh block; background auto-sync preserves checksum-mismatched blocks so user edits inside the managed area are not silently overwritten. Manual duplicate text outside the markers is left untouched for user review, not deleted automatically. By default, only files that already exist are updated (`agentFilesOnlyExisting: true`).

#### Where AI Context Bridge stores its own state

| File | Purpose |
| --- | --- |
| `.aicb/state.json` | Single source of truth — thoughts, pinned files, skills |
| `.aicb/snapshots.json` | Rollback points |

Override the location with the `aiContextBridge.storagePath` setting.

---

## UI controls (no Command Palette needed)

Every action is reachable from a button — the extension is intentionally not exposed in the Command Palette. The 5 views in the activity bar give you everything:

| View | What's on it |
| --- | --- |
| **⚡ Quick Actions** | Big buttons: 🔄 **Sync All Now** (primary) · ⚙ Target Settings · 📂 Copy Bootstrap Prompt |
| **Skills** | _Read-only inventory._ Toolbar: 🔁 Rescan · "..." overflow (timeline, mirror, unified target settings). _No Sync All here — use the big button in Quick Actions._ |
| **Pinned Files** | Toolbar: 🔄 Sync All · 📌 Pin current file · "..." overflow (rescan specs, unified target settings) |
| **Snapshots** | Toolbar: 🔄 Sync All · 💾 Create snapshot |
| **MCP Servers** | Toolbar: 🔁 Rescan · 🚀 Sync All to Kilocode |

| Per-item action | How to reach |
| --- | --- |
| Unpin a file | Inline icon on each pinned file |
| Restore / delete a snapshot | Inline icons on each snapshot |
| Copy MCP server to another host | Inline icon on each MCP server, or right-click |
| Pin the active editor file | The pin icon in the editor title bar |
| Force Sync (persist state.json) | Click the state-counter chip in the status bar |
| Sync All Now (global) | Click the **AICB ⟳ Sync All** chip in the status bar |
| Open thought timeline | Click the **AICB Timeline** chip in the status bar |

---

## Settings

| Setting | Default | What it controls |
| --- | --- | --- |
| `aiContextBridge.storagePath` | `""` | Where `state.json` lives. Empty = `<workspace>/.aicb/state.json` |
| `aiContextBridge.autoSync` | `true` | Save on every change. Off = click **Force Sync** when you want to persist |
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
| `aiContextBridge.skillMirrorHosts` | cursor, gemini, … | Which agents receive mirrored skills |
| `aiContextBridge.mcpCopyTargets` | `[]` | Default MCP config targets preselected by copy/sync pickers |

---

## Tips

- **Don't see your skills?** Click 🔄 **Rescan Skills** on the Skills view, or check that `.claude/skills/<name>/SKILL.md` files exist.
- **Status bar shows wrong counts?** Click the 🧠 status item to **Force Sync**.
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
