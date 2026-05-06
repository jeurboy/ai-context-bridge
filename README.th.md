# AI Context Bridge

[English](README.md) · **ภาษาไทย**

> ระบบ "ความจำกลาง" (Blackboard) + ศูนย์ควบคุมความสามารถ (Skills) สำหรับการทำงานร่วมกันระหว่าง AI หลายตัว ใช้ได้บน **VS Code** และ editor ที่ build บน VS Code ทุกตัว: **Cursor**, **Windsurf**, **Google Antigravity**, **VSCodium**, **Trae**, **Void**, **code-server** ฯลฯ

เวลาสลับจาก Claude → GPT → Gemini กลางทาง ปกติต้องเล่าบริบทใหม่ทุกครั้ง **AI Context Bridge** เก็บ blackboard เป็น JSON ขนาดเล็กไว้ในเครื่อง ที่ AI ทุกตัวอ่าน/เขียนได้ — ตัวถัดไปก็ทำงานต่อจากตัวก่อนได้เลย

เน้น state management อย่างเดียว ไม่เรียก API ไม่นับ token ไม่ sync cloud มีแค่ความจำในเครื่องที่คุณควบคุมเองได้ทั้งหมด

---

## ใช้ทำอะไรได้บ้าง

- **ส่งงานต่อระหว่าง AI โดยไม่ต้องเล่าใหม่** — Claude ทำเสร็จ GPT รับช่วงต่อทันที (ไฟล์ที่ปักหมุด, thoughts ล่าสุด, กฎ skill เหมือนกัน)
- **เห็นว่าทุก model คิดอะไร เรียงตามเวลา** — Thought Timeline เดียว มี badge บอก model + handoff hint
- **ปักหมุดไฟล์ที่กำลังใช้งาน** — มี 📌 บน tab/Explorer; auto-pin ไฟล์ที่เพิ่ง save; ไฟล์ spec (CLAUDE.md, AGENTS.md, .cursorrules, …) ถูกปักหมุดให้อัตโนมัติ
- **ตัดสินใจว่า AI ทำอะไรได้บ้าง** — ทุก "skill" มี 3 สถานะ: ✅ Enabled / ❓ Ask / ⛔ Disabled
- **ตั้งค่า target ได้จากที่เดียว** — Quick Actions มี Target Settings picker เดียวสำหรับ skill mirrors, context bridge files และ MCP copy targets
- **ซ่อม context block ที่ซ้ำกัน** — `Sync All Now` dedupe เฉพาะ AICB-managed block และไม่แตะข้อความที่ user เขียนเองนอก marker
- **ย้อนกลับได้ถ้า agent เผลอเขียนทับ** — Snapshot ของสถานะความจำทั้งหมด คลิกเดียว
- **ข้อมูลทั้งหมดอยู่ในเครื่อง** — JSON ใน workspace ไม่มี telemetry ไม่มี cloud ไม่มี account

---

## ติดตั้ง

### VS Code Marketplace

ค้นหา **AI Context Bridge** ใน Extensions panel หรือ:

```bash
code --install-extension jeurboy.ai-context-bridge
```

### Open VSX (Cursor / Windsurf / VSCodium / code-server / Theia)

ค้นหา **AI Context Bridge** ใน Extensions panel — editor ที่ไม่ใช่ของ Microsoft ส่วนใหญ่ใช้ Open VSX เป็น registry default

### จาก `.vsix` (ใช้ได้กับทุก editor ที่รองรับ VS Code extension)

ดาวน์โหลด `.vsix` ตัวล่าสุดจาก [Releases](https://github.com/jeurboy/ai-context-bridge/releases) แล้วเลือกคำสั่งตาม editor:

```bash
# VS Code / VS Code Insiders
code --install-extension ai-context-bridge-0.6.2.vsix

# Cursor
cursor --install-extension ai-context-bridge-0.6.2.vsix

# Windsurf
windsurf --install-extension ai-context-bridge-0.6.2.vsix

# VSCodium
codium --install-extension ai-context-bridge-0.6.2.vsix
```

หรือผ่าน UI ของ editor (รวม **Google Antigravity**, **Trae**, **Void**): Extensions panel → menu `...` → **Install from VSIX...**

---

## Editor ที่รองรับ

ใช้แต่ VS Code Extension API มาตรฐาน (`vscode` ^1.85.0) — รันได้บนทุก editor ที่ใช้ VS Code engine:

| Editor | ติดตั้ง | หมายเหตุ |
| --- | --- | --- |
| **VS Code** / **Insiders** | Marketplace | Target หลัก |
| **Cursor** | Open VSX / `.vsix` | Composer อ่าน `.aicb/state.json` ได้ถ้าบอกให้อ่าน |
| **Windsurf** | Open VSX / `.vsix` | Cascade อ่าน block bridge ผ่าน `.windsurfrules` ได้เลย |
| **Google Antigravity** | `.vsix` | Sidebar + activity bar ใช้งานได้ปกติ |
| **VSCodium** | Open VSX | รองรับเต็มรูปแบบ |
| **Trae / Void / code-server / Theia / Gitpod / Coder** | `.vsix` หรือ Open VSX | ตัวไหนใช้ Extension API มาตรฐานก็รัน |

---

## 5 นาทีแรก

1. **เปิด sidebar** — คลิกไอคอน 🧠 **AI Context Bridge** ใน Activity Bar จะเห็น 5 view: **Quick Actions**, **Skills**, **Pinned Files**, **Snapshots**, **MCP Servers**
2. **ปล่อยให้ auto-discovery ทำงาน** — skill ใต้ `.claude/skills/`, `.cursor/`, `.gemini/`, `.codex/`, `.agent/` (และ global counterpart `~/.claude/`, `~/.cursor/`, ฯลฯ เมื่อเปิด setting) ถูกตรวจจับอัตโนมัติ. ไฟล์ spec (CLAUDE.md, AGENTS.md, .cursorrules, README, ฯลฯ) ถูก pin เข้า **Spec / context** ตอน activation รวมถึงไฟล์ที่อยู่ใน subproject/dir ย่อย. MCP servers ดึงจาก config ของแต่ละ host (`.mcp.json`, `~/.claude.json`, Claude Desktop, Cursor, Gemini, Windsurf, VS Code, Kilocode, Codex)
3. **กดปุ่มใหญ่ Sync All Now** ใน Quick Actions panel — เขียน AICB block เข้าไฟล์ agent ทุกตัว, mirror skill ข้าม agent, refresh MCP inventory ทีเดียว. ปุ่มเดียวกันยังอยู่บน toolbar ของ Pinned Files และ Snapshots รวมถึงบน status bar
4. **ส่งต่อบริบทเมื่อจำเป็น** — ใช้ปุ่ม **Copy Bootstrap Prompt** ใน Quick Actions เพื่อ copy paths-only prompt ไปยัง agent ที่อ่านไฟล์เองได้ (Codex CLI, Aider). ถ้า**สลับ agent กลางทาง**และ agent ตัวใหม่เคยทำงานในโปรเจกต์นี้แล้ว ใช้ **Copy Reload Prompt** แทน — prompt จะสั่งให้ agent re-read จาก `.aicb/state.json` และ recent thoughts เพื่อไม่ให้ทำงานบน context เก่า. สำหรับ chat-box agent ที่ไม่มี file access สามารถเรียก API `copyHandoffPrompt` ได้แบบ programmatic
5. **(Optional) ปรับ targets** — ใช้ **Target Settings** ใน Quick Actions เพื่อเลือก skill mirror targets, context bridge files และ default MCP copy targets ใน picker เดียว

> **Extension นี้เป็น sync-only — ไม่ใช่ตัวจัดการสถานะ skill.** สถานะ skill (`ENABLED` / `ASK` / `DISABLED`) ถูกกำหนดอัตโนมัติจากชื่อ/description (skill ที่มี `exec`/`run`/`delete`/`push`/ฯลฯ จะเป็น `ASK`). UI โชว์สถานะให้เห็น แต่แก้ไม่ได้. ถ้าจะตัด skill ออก ให้ลบที่ source (เช่น ลบจาก `.claude/skills/...`)

---

## การใช้งานประจำวัน

### Sidebar

เปิดไอคอน 🧠 ใน Activity Bar

**Skills view** — รวม skill ที่ auto-discovered จาก workspace นี้ (อ่านอย่างเดียว, แก้ไม่ได้)
- Toolbar: 🔁 Rescan skills · "..." overflow (timeline, mirror, configure mirror targets)
- สถานะ (✅ Enabled / ❓ Ask / ⛔ Disabled) ถูกตั้งอัตโนมัติจากชื่อ/description ของ skill — UI **โชว์** ให้เห็น แต่แก้ไม่ได้. skill ที่ดูเสี่ยง (match `exec | run | delete | push | …`) จะเป็น **Ask** โดยอัตโนมัติ
- Skill ที่เป็น **Ask** จะ trigger HITL modal เมื่อ external agent เรียก API `hitl.authorize()`: **Allow once** / **Allow this session** / **Deny**

**Pinned Files view** — ไฟล์ในความจำใช้งาน แบ่ง 2 กลุ่ม
- **Spec / context** — auto-import ไม่หมดอายุ (CLAUDE.md, AGENTS.md, .cursorrules, README, plans/, …)
- **Working memory** — ไฟล์ที่เพิ่ง edit, dwell-pin, และที่ pin ด้วยมือ
- Toolbar: 📌 Pin current file · 📋 Copy handoff prompt · 🔄 Rescan specs · ↔️ Bridge to agent files now
- คลิกขวา → Unpin เพื่อเอาออก

**Snapshots view** — สถานะความจำ ณ จุดเวลา
- Toolbar: 💾 Create snapshot
- ↩️ restore, 🗑️ delete

### Status bar (ซ้ายล่าง)

- 🧠 **N skills · M pinned · K thoughts** — สรุปด่วน คลิกเพื่อ **Force Sync** ลงดิสก์
- 🕒 **Timeline** — เปิด Thought Timeline

### ปักหมุดไฟล์

- **จาก editor:** คลิกไอคอน 📌 ที่มุมขวาบนของ editor
- **จาก tab:** เห็น 📌 = ปักหมุดอยู่
- **อัตโนมัติ:** ไฟล์ที่ save (หรือเปิดทิ้งนานเกิน `autoPinDwellMinutes`) จะถูก auto-pin และหมดอายุหลังไม่ใช้งาน `autoPinExpireMinutes` นาที — manual pin ไม่หมดอายุ

### ส่งต่อให้ AI ตัวต่อไป

ทางที่เร็วที่สุด: **กดปุ่ม Copy Handoff Prompt บน title bar ของ panel Pinned Files** → paste ใส่ chat ใหม่

ทางแบบ "เปิดทิ้งไว้": เปิด `aiContextBridge.exportToAgentFiles` ระบบจะเขียน block `<!-- AICB:BEGIN ... AICB:END -->` ในไฟล์ convention ที่มีอยู่ (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, GEMINI.md, .github/copilot-instructions.md) เนื้อหานอก block แก้ได้ปกติ — ระบบแตะแค่ block ที่มาร์กไว้

โดย default ไฟล์ที่ไม่มีอยู่จะไม่สร้างให้ ตั้ง `agentFilesOnlyExisting: false` ถ้าอยากให้สร้างไฟล์ convention ที่ขาดให้

### ไฟล์ convention ของแต่ละ AI

เมื่อเปิด `exportToAgentFiles` AI แต่ละตัวจะอ่านไฟล์เหล่านี้อัตโนมัติ:

- **Claude Code / Claude Desktop** → `CLAUDE.md`
- **Cursor** → `.cursorrules`, `.cursor/rules/**/*.{md,mdc}`
- **Windsurf** → `.windsurfrules`
- **GitHub Copilot** → `.github/copilot-instructions.md`
- **OpenAI Codex** → `AGENTS.md` ที่ root ของ repo (project guidance), `~/.codex/AGENTS.md` (global guidance — เปิดใช้ผ่าน `aiContextBridge.agentFiles`)
- **Agents SDK / legacy** → `AGENT.md`
- **Google Gemini / Antigravity** → `GEMINI.md`
- **Kilocode** → `.kilocoderules`, `.kilocode/rules/aicb.md`
- **Generic agent (`.agent`)** → `.agent/AGENTS.md`, `.agent/rules/aicb.md`

ปรับเพิ่ม/ลด target ได้ที่ setting `aiContextBridge.agentFiles` และ `aiContextBridge.specPatterns`

---

### ตารางอ้างอิง path ของ agent ทุกตัว

แผนที่รวมทุกที่ที่ AI Context Bridge **อ่าน** (discovery) และ **เขียน** (mirror / sync) ของแต่ละ host. workspace path สัมพัทธ์กับ project root, global path อยู่ใต้ home directory ของ user

#### Skill: discovery + mirror

| Host | Workspace skills (อ่าน) | Global skills (อ่าน) | Mirror target (เขียน) |
| --- | --- | --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md`, `.claude/commands/<name>.md` | `~/.claude/skills/<name>/SKILL.md`, `~/.claude/commands/<name>.md` | `.claude/commands/aicb-<id>.md` (mirror **จาก** Gemini origin) |
| Cursor | `.cursor/skills/**/*.md`, `.cursor/rules/**/*.{md,mdc}` | `~/.cursor/skills/**`, `~/.cursor/rules/**` | `.cursor/rules/aicb-<id>.mdc` |
| Gemini | `.gemini/skills/**/*.md` | `~/.gemini/skills/**/*.md` | `.gemini/skills/aicb-<id>.md` |
| Kilocode | _(ยังไม่ scan — รับ skill ผ่าน mirror อย่างเดียว)_ | — | `.kilocode/skills/aicb-<id>/SKILL.md` |
| Codex | `.codex/skills/<name>/SKILL.md`, `.codex/skill/<name>/SKILL.md` (non-standard — Codex ไม่ได้ spec skill folder; ใช้ convention นี้คู่ขนานกับ Claude) | `~/.codex/skills/<name>/SKILL.md`, `~/.codex/skill/<name>/SKILL.md` (resolve ภายใต้ `$CODEX_HOME` ถ้าตั้งไว้) | `.codex/skills/aicb-<id>/SKILL.md` |
| Agent (`.agent`) | `.agent/skills/<name>/SKILL.md`, `.agent/skill/<name>/SKILL.md` | `~/.agent/skills/<name>/SKILL.md`, `~/.agent/skill/<name>/SKILL.md` | `.agent/skills/aicb-<id>/SKILL.md` |
| Claude Desktop / Windsurf / VS Code Copilot | _(ไม่มี skill folder)_ | — | — |

Mirror target ทำงานเมื่อเปิด `aiContextBridge.mirrorSkillsToOtherAgents`. ไฟล์ที่สร้างขึ้นมีหัว `AICB:GENERATED` — auto-prune เมื่อ source หาย และจะไม่ทับไฟล์ที่ user เขียนเองที่ path เดียวกัน

#### MCP server: discovery + sync

| Host | Workspace config | Global config | JSON key |
| --- | --- | --- | --- |
| Claude Code | `.mcp.json` | `~/.claude.json` | `mcpServers` |
| Claude Desktop | _(ไม่มี)_ | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%\Claude\claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `~/.cursor/mcp.json` | `mcpServers` |
| Gemini | `.gemini/settings.json` | `~/.gemini/settings.json` | `mcpServers` |
| Windsurf | _(ไม่มี)_ | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| VS Code Copilot | `.vscode/mcp.json` | _(ใช้ user setting ของ VS Code)_ | `servers` |
| Kilocode | `.kilocode/mcp.json` | `~/Library/Application Support/Code/User/globalStorage/kilocode.kilo-code/settings/mcp_settings.json` (รวม Cursor / Code-Insiders ตาม OS path) | `mcpServers` |
| Codex | `.codex/mcp.json` | `~/.codex/mcp.json` (override ด้วย `$CODEX_HOME`) | `mcpServers` |
| Agent (`.agent`) | `.agent/mcp.json` | `~/.agent/mcp.json` | `mcpServers` |

Per-server copy ใช้ไฟล์ปลายทางตามตารางนี้. entry ที่ sync จะถูก tag ด้วย `_aicbGenerated: true` + `_aicbSource: "<host>:<scope>"` เพื่อให้ track ได้รอบหน้า. entry ที่มีชื่อชนกับ hand-authored จะถาม confirm ก่อนทับ

> **หมายเหตุ (Codex CLI):** Codex CLI ตัวจริงเก็บ MCP ใน `~/.codex/config.toml` (TOML format). Extension อ่าน/เขียน JSON เท่านั้น เลยใช้ `.codex/mcp.json` เป็นไฟล์ JSON คู่ขนาน — รองรับ TOML แท้ยังเป็น roadmap

#### Handoff context (`.aicb` block)

| Host | path ที่ bridge เขียน handoff block |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenAI Codex | `AGENTS.md` ที่ root (project), `~/.codex/AGENTS.md` (global — เปิดเอง). `AGENTS.override.md` ที่ระดับใดๆ จะ override. Codex concat ไฟล์จาก root ลงมาหา CWD, ไฟล์ใกล้กว่า override ไฟล์ไกลกว่า. ปรับ home ได้ผ่าน env `CODEX_HOME` |
| Agents SDK / legacy | `AGENT.md` |
| Gemini / Antigravity | `GEMINI.md` |
| Kilocode | `.kilocoderules`, `.kilocode/rules/aicb.md` |
| Agent (`.agent`) | `.agent/AGENTS.md`, `.agent/rules/aicb.md` |

bridge แตะเฉพาะเนื้อหาระหว่าง `<!-- AICB:BEGIN -->` และ `<!-- AICB:END -->` — ส่วนอื่นในไฟล์อยู่เหมือนเดิม. block ที่สร้างใหม่จะมี checksum metadata. `Sync All Now` จะ repair managed block ที่ซ้ำให้กลับมาเหลือ block สดอันเดียว; ส่วน background auto-sync จะ preserve block ที่ checksum ไม่ตรงไว้ก่อน เพื่อไม่ทับสิ่งที่ user แก้ใน managed area แบบเงียบๆ. ข้อความ context ที่ user copy ไปแปะเองนอก marker จะไม่ถูกลบอัตโนมัติ. โดย default จะอัพเดตเฉพาะไฟล์ที่มีอยู่แล้ว (`agentFilesOnlyExisting: true`)

#### State ของ Extension เอง

| ไฟล์ | หน้าที่ |
| --- | --- |
| `.aicb/state.json` | source of truth — thoughts, pinned files, skills |
| `.aicb/snapshots.json` | rollback points |

เปลี่ยน path ได้ที่ setting `aiContextBridge.storagePath`

---

## UI controls (ไม่ต้องใช้ Command Palette)

ทุก action กดได้จากปุ่มในหน้าต่าง — extension จงใจไม่โผล่ใน Command Palette. 5 view ในแถบ activity bar ครอบคลุมทั้งหมด:

| View | สิ่งที่อยู่ |
| --- | --- |
| **⚡ Quick Actions** | ปุ่มใหญ่: 🔄 **Sync All Now** (primary) · ⚙ Target Settings · 📂 Copy Bootstrap Prompt · ↻ Copy Reload Prompt |
| **Skills** | _Read-only inventory._ Toolbar: 🔁 Rescan · "..." overflow (timeline, mirror, unified target settings). _ไม่มี Sync All ที่นี่ — ใช้ปุ่มใหญ่ใน Quick Actions แทน_ |
| **Pinned Files** | Toolbar: 🔄 Sync All · 📌 Pin current file · "..." overflow (rescan specs, unified target settings) |
| **Snapshots** | Toolbar: 🔄 Sync All · 💾 Create snapshot |
| **MCP Servers** | Toolbar: 🔁 Rescan · 🚀 Sync All to Kilocode |

| Action ต่อรายการ | จุดที่กด |
| --- | --- |
| Unpin ไฟล์ | ไอคอน inline ที่บรรทัด pinned file |
| Restore / Delete snapshot | ไอคอน inline ที่บรรทัด snapshot |
| Copy MCP server ไป host อื่น | ไอคอน inline ที่บรรทัด MCP server หรือคลิกขวา |
| Pin ไฟล์ที่เปิดอยู่ | ไอคอน pin บน title bar ของ editor |
| Force Sync (เขียน state.json) | คลิก chip นับ state บน status bar |
| Sync All Now (global) | คลิก **AICB ⟳ Sync All** chip บน status bar |
| เปิด thought timeline | คลิก **AICB Timeline** chip บน status bar |

---

## การตั้งค่า (Settings)

| Setting | Default | คุมอะไร |
| --- | --- | --- |
| `aiContextBridge.storagePath` | `""` | path ของ `state.json` ปล่อยว่าง = `<workspace>/.aicb/state.json` |
| `aiContextBridge.autoSync` | `true` | บันทึกอัตโนมัติทุกการเปลี่ยนแปลง ถ้า `false` ต้องคลิก **Force Sync** เอง |
| `aiContextBridge.autoPinRecentEdits` | `true` | Auto-pin ไฟล์ตอน save |
| `aiContextBridge.autoPinDwellMinutes` | `5` | Auto-pin หลังเปิดไฟล์เป็น active editor นานเกินกี่นาที (`0` = ปิด) |
| `aiContextBridge.autoPinExpireMinutes` | `60` | Auto-pin หมดอายุหลังไม่ถูกใช้กี่นาที (manual pin ไม่หมดอายุ) |
| `aiContextBridge.autoPinBackfillCount` | `8` | ตอนเปิดครั้งแรก ถ้าไม่มี pinned file pin top N ไฟล์ที่แก้ล่าสุด (`0` = ปิด) |
| `aiContextBridge.autoImportSpecFiles` | `true` | Auto-detect และ pin ไฟล์ spec/agent |
| `aiContextBridge.specPatterns` | (รายการยาว) | Glob ของไฟล์ที่นับเป็น "spec / context" |
| `aiContextBridge.exportToAgentFiles` | `false` | Maintain block ในไฟล์ convention ของ agent ต่างๆ |
| `aiContextBridge.agentFiles` | CLAUDE.md, AGENTS.md, … | ไฟล์ปลายทางที่จะ bridge เข้าไป |
| `aiContextBridge.agentFilesOnlyExisting` | `true` | อัพเดทเฉพาะไฟล์ที่มีอยู่แล้ว (ไม่สร้างใหม่) |
| `aiContextBridge.skillMirrorHosts` | cursor, gemini, … | agent ที่จะรับ mirrored skills |
| `aiContextBridge.mcpCopyTargets` | `[]` | default MCP config targets ที่จะถูก preselect ใน picker ตอน copy/sync |

---

## เคล็ดลับ

- **ไม่เห็น skill?** กด 🔄 **Rescan Skills** บน Skills view หรือเช็คว่าไฟล์ `.claude/skills/<name>/SKILL.md` มีอยู่จริง
- **ตัวเลขใน status bar ไม่ตรง?** คลิกไอคอน 🧠 ใน status bar เพื่อ **Force Sync**
- **ย้ายเครื่อง?** `state.json` คือ JSON ใน `<workspace>/.aicb/` commit หรือไม่ commit ก็ได้ — ของคุณ
- **อยากเปิด chat ใหม่ให้ไม่หลงทาง?** ใช้ **Copy Handoff Prompt** เร็วที่สุด

---

## ทำไมต้องมี

ทุกวันนี้ workflow การเขียนโค้ดผสม model หลายตัว แต่ละตัวมี scratch context ของตัวเอง พอส่งงานต่อกัน boundary ของ human-in-the-loop ก็หายไป AI Context Bridge ให้:

- **Visibility** — เห็นว่า model ไหนคิดอะไร เรียงตามเวลา ติด badge สี
- **Control** — กั้น tool call ทุกตัวด้วย modal หรือ freeze ทั้งหมด
- **Continuity** — AI ตัวต่อไปอ่าน `state.json` แล้วทำต่อได้ทันที

ทุกอย่างอยู่ในเครื่อง ไม่มี telemetry ไม่มี network sync ไม่มี cloud account — privacy by design

---

## สำหรับนักพัฒนา extension

Extension อื่นเรียกใช้ blackboard ได้ผ่าน public API ดูรายละเอียดที่ [docs/API.md](docs/API.md) หรือ:

```ts
const ext = vscode.extensions.getExtension('jeurboy.ai-context-bridge');
const api = await ext?.activate();
api.memory.addThought({ modelId: 'claude-opus-4-7', text: '…' });
```

หรือเขียน `<workspace>/.aicb/state.json` ตรงๆ ก็ได้ — ระบบจะตรวจจับการเปลี่ยนแปลงเอง

---

## License

MIT — ดู [LICENSE](LICENSE)
