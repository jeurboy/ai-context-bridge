# Changelog

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
