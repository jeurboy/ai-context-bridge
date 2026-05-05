# Changelog

## 0.4.0 — 2026-05-05

- **MCP Servers panel** — new sidebar view that scans MCP server configs across every host you have installed:
  - Workspace: `.mcp.json` (Claude Code), `.cursor/mcp.json`, `.vscode/mcp.json` (Copilot), `.gemini/settings.json`, `.kilocode/mcp.json`
  - Global: `~/.claude.json`, Claude Desktop config (macOS / Windows / Linux), `~/.cursor/mcp.json`, `~/.gemini/settings.json`, `~/.codeium/windsurf/mcp_config.json`, Kilocode `globalStorage`
  - Grouped by **Host → Scope (Workspace / Global)**, tooltip shows transport + command/args + env (secrets matching `KEY|TOKEN|SECRET|PASS|CREDENTIAL` are redacted), click opens the source config file
- **Per-server explicit copy** — right-click any MCP server → "Copy MCP Server to…" → multi-select target hosts. Atomic merge into the destination JSON (preserves all other keys), tagged with `_aicbGenerated: true` + `_aicbSource` for round-trip prune. Hand-authored entries prompt before overwrite; AICB-generated entries are silently refreshed; secret env vars trigger a plaintext-write warning
- **Sync All → Kilocode** (one-click unified handoff) — single command that:
  1. copies every discovered MCP server into the selected Kilocode config(s)
  2. mirrors every workspace skill into `.kilocode/skills/aicb-<id>/SKILL.md`
  3. exports the AICB handoff block into `.kilocoderules` and `.kilocode/rules/aicb.md`
  Available from the MCP Servers view title bar 🚀 or the command palette as `AI Context Bridge: Sync All to Kilocode`
- **Global skill discovery** — skills installed at `~/.claude/skills/`, `~/.claude/commands/`, `~/.cursor/{rules,skills}/`, `~/.gemini/skills/` are now scanned alongside workspace skills. The Skills view automatically groups into **Workspace** and **Global** when both are present. Toggle via `aiContextBridge.scanGlobalSkills` (default true). Global skill IDs are namespaced with `global:` to prevent collisions
- **Kill switch guard** — when the kill switch is engaged, attempting to enable/disable/ask a skill now opens a modal that lets you Release the kill switch in place, Keep it engaged (and save the change for later), or Cancel. No more silent "nothing happens" when every skill is forced to DISABLED
- **Skill mirror prune** — `SkillAdapterWriter` now correctly prunes folder-per-skill targets (e.g. `.kilocode/skills/aicb-<id>/`) by recursively removing AICB-marked directories
- New commands: `Rescan MCP Servers`, `Copy MCP Server to…`, `Sync All to Kilocode (MCP + Skills + Context)`
- New types: `McpServer`, `McpHost` (claude-code · claude-desktop · cursor · gemini · windsurf · vscode · kilocode), `McpTransport`, `SkillScope`
- Settings: `aiContextBridge.scanGlobalSkills`, default `agentFiles` adds `.kilocoderules` and `.kilocode/rules/aicb.md`

## 0.3.0 — 2026-05-05

- **Cross-agent skill mirroring** — opt-in setting `aiContextBridge.mirrorSkillsToOtherAgents` writes a managed adapter file for each Claude/Gemini skill into the conventions of every other agent so all of them see the same instructions:
  - `.cursor/rules/aicb-<id>.mdc` (with `globs` / `alwaysApply` frontmatter)
  - `.gemini/skills/aicb-<id>.md`
  - `.claude/commands/aicb-<id>.md` (for Gemini-origin skills)
  - Generated files carry an `AICB:GENERATED` marker; pruned automatically when the source is removed; never overwrites a hand-authored file at the same path. Source of truth always stays in the original `.claude/` / `.gemini/` location
- **Cursor skill discovery** — scans `.cursor/rules/**/*.{md,mdc}` and `.cursor/skills/**/*.md` and registers them as skills (`cursor-rule.<name>` / `cursor-skill.<name>`)
- **Gemini skill discovery** — scans `.gemini/skills/**/*.md` (`gemini-skill.<name>`)
- **Skill metadata refresh** — auto-discovery now updates `name`, `description`, `sourceUri`, `origin` on every scan without ever overriding the user-set `status`. Manual registrations take precedence over auto.
- New command: `AI Context Bridge: Mirror Skills to Other Agents` (one-shot force flush regardless of the toggle)
- New skill fields: `source` (auto · manual), `sourceUri`, `origin`

## 0.2.2 — 2026-05-05

- **Rescan Skills** button on Skills view title bar — forces a manual `.claude/skills` + `.claude/commands` rescan even when `autoDiscoverSkills` is off; status bar shows the count found
- New command: `AI Context Bridge: Rescan Skills`
- Welcome screen on Skills view gains a "Rescan skills" link

## 0.2.1 — 2026-05-04

- **Filesystem skill discovery:** scan `.claude/skills/*/SKILL.md` and `.claude/commands/*.md` — register as skills (id `claude-skill.<name>` / `claude-command.<name>`) with title/description parsed from YAML frontmatter or first H1 + paragraph
- **More spec patterns:** `plans/`, `plan/`, `roadmap/`, `proposals/`, `rfcs/`, `prd/`, `docs/plans/`, `docs/rfcs/`, root `PLAN.md` / `ROADMAP.md`
- File watcher on `.claude/skills/` and `.claude/commands/` re-scans on file create/delete/change

## 0.2.0 — 2026-05-04

- **Spec auto-import:** scan workspace for CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, .windsurfrules, .github/copilot-instructions.md, README, ARCHITECTURE, SPEC, docs/spec/** — pinned automatically as "Spec / context"
- **Pinned Files split into 2 groups:** Spec / context (auto-imported, never expire) vs Working memory (auto-pinned recent edits + manual)
- **Copy Handoff Prompt** command — generates one markdown bundle (specs + working files + recent thoughts + skill state) ready to paste into any agent
- **Bridge to Agent Files** — opt-in auto-write managed `<!-- AICB:BEGIN ... AICB:END -->` block into CLAUDE.md/AGENTS.md/.cursorrules/etc. so any AI reading its convention file gets the bridge automatically
- New commands: `Copy Handoff Prompt`, `Bridge to Agent Files Now`, `Rescan Spec Files`
- Public API now exposes `handoff` builder

## 0.1.1 — 2026-05-04

- Auto-discovery: skill scan from installed extensions, auto-pin from save / dwell timer / first-run backfill
- Backfill: on activation with empty pinned list, scan workspace and pin top N most-recently modified files (`autoPinBackfillCount`, default 8)
- Sidebar: per-view welcome buttons; status bar split into Kill / Sync / Timeline; pin / add-thought buttons in view title bars
- Pin / Add Thought prompts: default `modelId` from most recent thought owner

## 0.1.0 — 2026-05-04

Initial public release.

- Universal Memory Store (`.aicb/state.json`) with atomic-write queue and `EventEmitter` change feed
- Skill Control Center sidebar — three-state toggle (`ENABLED` / `ASK` / `DISABLED`) with traffic-light icons
- Pinned Files sidebar + 📌 file decoration on tabs and explorer
- Snapshots sidebar — save / restore / delete points-in-time
- Thought Timeline webview — model-tagged cards, handoff hints, copy-as-context
- Global Kill Switch (status bar + workspace setting)
- Public extension API: `memory`, `toolFilter`, `hitl`
- HITL modal: allow once / allow this session / deny
