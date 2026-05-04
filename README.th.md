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
- **ตัดสินใจว่า AI ทำอะไรได้บ้าง** — ทุก "skill" มี 3 สถานะ: ✅ Enabled / ❓ Ask / ⛔ Disabled กดปุ่ม Kill Switch ปิดทั้งหมดในคลิกเดียว
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
code --install-extension ai-context-bridge-0.2.2.vsix

# Cursor
cursor --install-extension ai-context-bridge-0.2.2.vsix

# Windsurf
windsurf --install-extension ai-context-bridge-0.2.2.vsix

# VSCodium
codium --install-extension ai-context-bridge-0.2.2.vsix
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

1. **เปิด sidebar** — คลิกไอคอน 🧠 **AI Context Bridge** ใน Activity Bar จะเห็น 3 view: **Skills**, **Pinned Files**, **Snapshots**
2. **ปล่อยให้ auto-discovery ทำงาน** — ถ้า project มีโฟลเดอร์ `.claude/skills/` หรือ `.claude/commands/` skill จะโผล่ขึ้นมาเอง ไฟล์ spec (CLAUDE.md, AGENTS.md, .cursorrules, README, ARCHITECTURE.md, plans/, rfcs/, …) จะถูก pin ใส่กลุ่ม **Spec / context** ตอนเปิดใช้งาน
3. **ตั้งกฎ** — ใน Skills view คลิกไอคอน ✅ / ❓ / ⛔ ข้าง skill เพื่อสลับ Enabled / Ask / Disabled ❓ Ask = มี modal ขึ้นถามทุกครั้งที่ agent อยากใช้
4. **ส่งต่อบริบท** — ตอนเปลี่ยน AI กด `Cmd+Shift+P` / `Ctrl+Shift+P` → **AI Context Bridge: Copy Handoff Prompt** แล้ว paste ใส่ AI ตัวต่อไป — ได้ specs, ไฟล์ที่ปักหมุด, thoughts ล่าสุด, กฎ skill ครบในช็อตเดียว
5. **(Optional) Auto-bridge** — เปิด `aiContextBridge.exportToAgentFiles` ระบบจะ maintain block หนึ่งใน `CLAUDE.md` / `AGENTS.md` / `.cursorrules` / `.windsurfrules` / `.github/copilot-instructions.md` ให้อัตโนมัติ AI ตัวไหนอ่านไฟล์ convention ของตัวเองก็ได้บริบททันที — ไม่ต้อง paste

---

## การใช้งานประจำวัน

### Sidebar

เปิดไอคอน 🧠 ใน Activity Bar

**Skills view** — รวม skill ของ AI ทั้งหมดใน workspace นี้
- Toolbar: ➕ Register skill · 🔄 Rescan skills · ⏱️ Open timeline · 💬 Add thought · ⛔ Kill switch
- คลิกไอคอน inline ข้าง skill เพื่อสลับ ✅ Enabled / ❓ Ask / ⛔ Disabled
- Skill ที่ตั้งเป็น **Ask** จะมี modal ขึ้นเวลา agent อยากใช้: **Allow once** / **Allow this session** / **Deny**

**Pinned Files view** — ไฟล์ในความจำใช้งาน แบ่ง 2 กลุ่ม
- **Spec / context** — auto-import ไม่หมดอายุ (CLAUDE.md, AGENTS.md, .cursorrules, README, plans/, …)
- **Working memory** — ไฟล์ที่เพิ่ง edit, dwell-pin, และที่ pin ด้วยมือ
- Toolbar: 📌 Pin current file · 📋 Copy handoff prompt · 🔄 Rescan specs · ↔️ Bridge to agent files now
- คลิกขวา → Unpin เพื่อเอาออก

**Snapshots view** — สถานะความจำ ณ จุดเวลา
- Toolbar: 💾 Create snapshot
- ↩️ restore, 🗑️ delete

### Status bar (ซ้ายล่าง)

- 🛡️ **Live** / ⛔ **KILL** — คลิกเพื่อสลับ kill switch (ถ้า ON = ทุก skill ทำตัวเป็น Disabled)
- 🧠 **N skills · M pinned · K thoughts** — สรุปด่วน คลิกเพื่อ **Force Sync** ลงดิสก์
- 🕒 **Timeline** — เปิด Thought Timeline

### ปักหมุดไฟล์

- **จาก editor:** คลิกไอคอน 📌 ที่มุมขวาบนของ editor
- **จาก tab:** เห็น 📌 = ปักหมุดอยู่
- **อัตโนมัติ:** ไฟล์ที่ save (หรือเปิดทิ้งนานเกิน `autoPinDwellMinutes`) จะถูก auto-pin และหมดอายุหลังไม่ใช้งาน `autoPinExpireMinutes` นาที — manual pin ไม่หมดอายุ

### ส่งต่อให้ AI ตัวต่อไป

ทางที่เร็วที่สุด: **Command Palette → AI Context Bridge: Copy Handoff Prompt** → paste ใส่ chat ใหม่

ทางแบบ "เปิดทิ้งไว้": เปิด `aiContextBridge.exportToAgentFiles` ระบบจะเขียน block `<!-- AICB:BEGIN ... AICB:END -->` ในไฟล์ convention ที่มีอยู่ (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, GEMINI.md, .github/copilot-instructions.md) เนื้อหานอก block แก้ได้ปกติ — ระบบแตะแค่ block ที่มาร์กไว้

โดย default ไฟล์ที่ไม่มีอยู่จะไม่สร้างให้ ตั้ง `agentFilesOnlyExisting: false` ถ้าอยากให้สร้างไฟล์ convention ที่ขาดให้

### ไฟล์ convention ของแต่ละ AI

เมื่อเปิด `exportToAgentFiles` AI แต่ละตัวจะอ่านไฟล์เหล่านี้อัตโนมัติ:

- **Claude Code / Claude Desktop** → `CLAUDE.md`
- **Cursor** → `.cursorrules`, `.cursor/rules/**/*.{md,mdc}`
- **Windsurf** → `.windsurfrules`
- **GitHub Copilot** → `.github/copilot-instructions.md`
- **OpenAI Codex / Agents SDK** → `AGENTS.md`, `AGENT.md`
- **Google Gemini / Antigravity** → `GEMINI.md`

ปรับเพิ่ม/ลด target ได้ที่ setting `aiContextBridge.agentFiles` และ `aiContextBridge.specPatterns`

---

## Commands (Command Palette)

| Command | ทำอะไร |
| --- | --- |
| `Open Thought Timeline` | เปิด timeline webview |
| `Global Kill Switch` | สลับ disable-all |
| `Force Sync` | บันทึก state ลงดิสก์ทันที |
| `Register Skill` | เพิ่ม skill ด้วยมือ |
| `Rescan Skills` | สแกน `.claude/skills` และ `.claude/commands` ใหม่ |
| `Rescan Spec Files` | สแกนไฟล์ spec/agent ใหม่ |
| `Pin File to Memory` | ปักหมุดไฟล์ที่เปิดอยู่ |
| `Add Thought` | เพิ่ม thought เข้า timeline |
| `Create Snapshot` | สร้างจุด rollback |
| `Copy Handoff Prompt` | คัดลอก handoff bundle ไป clipboard |
| `Bridge to Agent Files Now` | เขียน block ลงไฟล์ agent ทันที |

---

## การตั้งค่า (Settings)

| Setting | Default | คุมอะไร |
| --- | --- | --- |
| `aiContextBridge.storagePath` | `""` | path ของ `state.json` ปล่อยว่าง = `<workspace>/.aicb/state.json` |
| `aiContextBridge.autoSync` | `true` | บันทึกอัตโนมัติทุกการเปลี่ยนแปลง ถ้า `false` ต้องคลิก **Force Sync** เอง |
| `aiContextBridge.killSwitchEngaged` | `false` | Kill switch สติ๊กกี้ — ปิดทุก skill ไม่ว่าตั้งสถานะอะไรไว้ |
| `aiContextBridge.autoDiscoverSkills` | `true` | สแกน `.claude/skills/**/SKILL.md` และ `.claude/commands/**/*.md` ให้อัตโนมัติ |
| `aiContextBridge.autoPinRecentEdits` | `true` | Auto-pin ไฟล์ตอน save |
| `aiContextBridge.autoPinDwellMinutes` | `5` | Auto-pin หลังเปิดไฟล์เป็น active editor นานเกินกี่นาที (`0` = ปิด) |
| `aiContextBridge.autoPinExpireMinutes` | `60` | Auto-pin หมดอายุหลังไม่ถูกใช้กี่นาที (manual pin ไม่หมดอายุ) |
| `aiContextBridge.autoPinBackfillCount` | `8` | ตอนเปิดครั้งแรก ถ้าไม่มี pinned file pin top N ไฟล์ที่แก้ล่าสุด (`0` = ปิด) |
| `aiContextBridge.autoImportSpecFiles` | `true` | Auto-detect และ pin ไฟล์ spec/agent |
| `aiContextBridge.specPatterns` | (รายการยาว) | Glob ของไฟล์ที่นับเป็น "spec / context" |
| `aiContextBridge.exportToAgentFiles` | `false` | Maintain block ในไฟล์ convention ของ agent ต่างๆ |
| `aiContextBridge.agentFiles` | CLAUDE.md, AGENTS.md, … | ไฟล์ปลายทางที่จะ bridge เข้าไป |
| `aiContextBridge.agentFilesOnlyExisting` | `true` | อัพเดทเฉพาะไฟล์ที่มีอยู่แล้ว (ไม่สร้างใหม่) |

---

## เคล็ดลับ

- **ไม่เห็น skill?** กด 🔄 **Rescan Skills** บน Skills view หรือเช็คว่าไฟล์ `.claude/skills/<name>/SKILL.md` มีอยู่จริง
- **ตัวเลขใน status bar ไม่ตรง?** คลิกไอคอน 🧠 ใน status bar เพื่อ **Force Sync**
- **อยากหยุดทุกอย่าง?** คลิก 🛡️ **Live** บน status bar — เปลี่ยนเป็น ⛔ **KILL** ทุก skill ทำตัวเป็น Disabled คลิกอีกครั้งเพื่อปลด
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
