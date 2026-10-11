# Job Task — UX/UI Design Specification

Date: 2026-10-11
Scope: visual and layout design only (visual-only phase)
Status: Selected shell, Dashboard and mobile navigation changes implemented locally. Validation and remaining proposals are tracked below. No production deployment.

เอกสารนี้ออกแบบ UX/UI ของ Job Task บนพื้นฐานโค้ดปัจจุบัน (`src/App.tsx`, `src/components/ui.tsx`, `src/features/*`, `src/index.css`, `design/theme.css`) ให้ยึด `AGENTS.md`, โค้ดปัจจุบัน และการตัดสินใจล่าสุดของ owner เป็นหลัก ใช้ `docs/screens.md`, `docs/frontend-standard.md` และ `docs/design/antigravity-ux-ui-brief.md` เป็นข้อมูลประกอบด้านภาพและ layout เท่านั้น ห้ามนำคำอธิบาย auth/API ที่เลิกใช้แล้วจากเอกสารเก่ามาเปลี่ยนระบบปัจจุบัน

### Local implementation status, 2026-10-11

Owner authorized the remaining layout work after review, while retaining SVG icons and the PNG/Canvas Live characters.

- Implemented: a single main page heading, compact week/line/status controls, sync time and refresh in the topbar, and mobile More navigation for User Profile, Manager-only Team Settings and Sign out.
- Implemented: a compact seven-metric Dashboard summary, aligned desktop columns, date grouping with sticky date headers, and responsive rows with all four timestamps visible.
- Retained: task order, server durations, date formatters, role restrictions, action availability, confirmation and history flows. API, authentication, database and configuration files are outside this change.
- Accessibility: More uses a Radix dialog trigger for keyboard focus restoration. Supporting headings preserve the heading hierarchy without repeating visible page titles. Live description text uses the existing muted foreground token for readable contrast; character assets and animation code are unchanged.
- Layout adjustment: complete timestamp labels and dates need more room than the draft's 64px Dashboard row target. Desktop sample rows are about 94px, and longer titles may expand them.
- Implemented (continuation, 2026-10-11): Fill Task action bar (Add row / Save tasks) is sticky at the bottom, above the mobile tab bar on phones; Fill Task success and error messages use distinct tones with icons; the last sub-12px label outside Live (Team Settings navigation hint) is now 12px. Live keeps its spec-defined density sizes.
- Deferred: further Team Settings/Profile layout changes, clickable KPI filters (new behavior, needs owner approval), a new job sort order (contract), and the week-picker popover. Removing their repeated page titles is included in the earlier follow-up.
- Handoff: owner stopped further development and authorized a local commit on `main`. This checkpoint includes the existing Claude UI changes and the completed follow-up above. No push or deployment was authorized or performed.

### Local validation and next-client handoff

- PASS (rerun after the Fill Task, Status chip, Job action rail and token follow-up): `npm run check` end to end. typecheck, animation check, build, 14 schema checks, 40/40 unit tests (14 files) and 26/26 Playwright tests, including the mobile More-menu focus test and the axe checks. This supersedes the earlier single unit-test transport failure, which did not recur. Not covered: screenshots at 1920x1080, 1366x768 and 375x812, native browser zoom, a screen reader, production behavior.
- PASS: final `npm run typecheck` and `npm run build` after the last source edits; `git diff --check`.
- PASS: animation checks and 14 local schema checks during `npm run check`.
- FAIL: that full check stopped in the unit suite with 39/40 tests passing. One security test failed with an Undici/Miniflare `fetch failed` / `bad port` transport error. The focused retry, `npm run test:unit -- tests/security.test.ts`, passed all 7 tests. The full check has not been rerun, so the checkpoint does not claim a complete passing suite.
- Browser evidence: the earlier app/navigation run passed 18/19 tests; the failing More-menu focus test passed on its focused retry after switching to a Radix dialog trigger. Subsequent small layout, heading and contrast edits passed typecheck/build but have not completed a fresh browser regression run.
- NOT_RUN on the final source: the last standalone layout check could not connect to its local fixture server (`ECONNREFUSED`). Prior layout screenshots and measurements predate the last fixes and are not final acceptance evidence. Native browser zoom, a screen reader and production behavior were not verified.
- Next client: rerun `npm run check` and responsive/browser accessibility checks before continuing the deferred proposals. Verify mobile action visibility, full week/date labels, sticky Dashboard headers, Live text contrast, and More-menu focus/role visibility. Keep the current SVG icons and PNG/Canvas Live animation assets; preserve the existing workflow and protected backend/configuration scope.

---

## 0. Scope and guardrails

**ทำได้ (visual-only):** สี ฟอนต์ ระยะห่าง layout การจัดวางปุ่ม สถานะ responsive และ accessibility

**ห้ามเปลี่ยน:**
- `src/worker/**`, `migrations/**`, `src/shared/contracts.ts`, Cloudflare config, auth, API, D1, state transitions, idempotency, role permissions
- ลำดับการเรียงงาน (date, then production sequence), ฟิลด์ข้อมูล, การคำนวณเวลา (ใช้ค่าจาก server เท่านั้น)
- ข้อความบน UI ต้องเป็น **English only**
- ไม่เพิ่มฟังก์ชันใหม่ (drag-and-drop, delete, reopen, export, auto-save) และไม่มี motion นอกหน้า Live
- ไม่ deploy / push / commit โดยไม่ได้รับอนุญาตเฉพาะเป้าหมาย

ข้อเสนอที่ **ต้องให้ owner อนุมัติก่อน** เพราะแตะพฤติกรรม อยู่ในหัวข้อ 10 และไม่นับเป็นส่วนหนึ่งของ phase นี้

---

## 1. Design principles

1. **Floor first.** หน้า Job ใช้บนแท็บเล็ตที่หน้างาน ปุ่มสั่งงานต้องเห็นและกดได้โดยไม่ต้องเลื่อนหา
2. **Status at a glance.** อ่านสถานะได้จากแถบสี + ข้อความ + ไอคอน ไม่ใช้สีอย่างเดียว
3. **Dense but readable.** แน่นแบบตารางปฏิบัติการ แต่ข้อมูลหลักไม่เล็กกว่า 12px
4. **One title per page.** ลดหัวข้อซ้ำและป้ายตัวพิมพ์ใหญ่ ให้ข้อมูลเป็นพระเอก
5. **Quiet chrome.** เงาเบา ขอบบาง มุมโค้งพอประมาณ ไม่ใช้ gradient หรือ animation ตกแต่ง
6. **Same meaning, same look.** สถานะเดียวกันต้องหน้าตาเหมือนกันในทุกหน้า (Dashboard, Job, Live)

## 2. Users and devices

| Role | Main screens | Typical device |
| --- | --- | --- |
| Manager | Dashboard, Fill Task, Job, Live, Team Settings | Desktop / laptop |
| Supervisor | Dashboard, Fill Task, Job, Live | Desktop / tablet |
| Line Leader | Dashboard, Job, Live (own lines) | Tablet on the floor |
| Assistant | Dashboard, Job, Live (own lines) | Tablet / phone |

Target viewports: **1920x1080**, **1366x768**, **375x812** (และแท็บเล็ต 768–1023 ที่ต้องใช้งานได้ดี)

---

## 3. Design tokens

เก็บค่าทั้งหมดไว้ที่ `design/theme.css` จุดเดียว หลีกเลี่ยง hex ฝังใน component

### 3.1 Core colors (คงเดิม)

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#f4f6f7` | page background |
| `--card` | `#ffffff` | surfaces |
| `--foreground` | `#172a35` | body text |
| `--muted-foreground` | `#536570` | secondary text (ห้ามอ่อนกว่านี้) |
| `--primary` | `#0e7668` | primary action, active nav |
| `--destructive` | `#a12b2b` | Done (contract), errors, final actions |
| `--border` | `#dce4e7` | separators |
| `--ring` | `#147b70` | focus ring |

### 3.2 Status palette (ใช้ชุดเดียวทุกหน้า)

| Status | Chip bg | Chip text | Edge / accent | Row tint | Icon (Lucide) |
| --- | --- | --- | --- | --- | --- |
| To do | `#eff3f5` | `#4e6471` | `#a0b2ba` | white | `Circle` |
| In progress | `#dff5ec` | `#0c6a50` | `#128870` | `#f1faf6` | `Play` |
| Paused | `#fff1d7` | `#80591b` | `#c09034` | `#fffaf0` | `Pause` |
| Done | `#fdecec` | `#a12b2b` | `#a12b2b` | `#fef7f7` | `Check` |
| Overdue (modifier) | `#fff0e0` | `#9a4a00` | `#c2650a` | none | `AlertCircle` |

หมายเหตุ:
- **Done = แดง `#a12b2b` ตาม contract ใน `docs/screens.md`** ห้ามเปลี่ยน
- **Overdue ต้องแยกจาก Done** ปัจจุบันทั้งสองเป็นแดงเหมือนกัน ให้ Overdue ใช้ส้มเข้มพร้อมไอคอนและคำว่า "Overdue" (ตรวจ contrast ด้วย axe ก่อนใช้จริง)
- ทุกสถานะแสดง **ไอคอน + ข้อความ** เสมอ ไอคอนช่วยผู้ใช้ที่แยกสีไม่ชัด
- Live ใช้ชุดสีของตัวเองตาม spec (DONE green, In Progressing cyan-teal, Paused Today amber, Waiting Queue slate blue) ดูข้อ 10 เรื่องความต่างกับ Dashboard/Job

### 3.3 Typography

Font stack คงตาม theme: `"Segoe UI", Inter, system-ui, sans-serif`

| Role | Size / weight | Where |
| --- | --- | --- |
| Page title (`h1`) | 24–28px / 800 | topbar |
| Section title (`h2`) | 18–20px / 800 | section header |
| Row title | 15–16px / 700 | task title |
| Body | 14px / 400–500 | descriptions, form fields |
| Meta | 12–13px / 500–700 | line, date, times, labels |
| KPI number | 28–32px / 800, tabular-nums | summary |

กฎ: **ขนาดต่ำสุด 12px** ทุกที่ (เลิก 9–11px ที่ eyebrow, label, footer, chip) ข้อยกเว้นเดียวคือ Live ที่ density `dense`/`ultra` ตาม spec ซึ่งต้องคง title ≥ 12px ตัวเลขใช้ `tabular-nums` เสมอ

### 3.4 Spacing, radius, elevation

- ฐาน 4px (`--spacing: .25rem`) ใช้ 8 / 12 / 16 / 24
- Radius: chip เต็มวง, ปุ่ม/ช่องกรอก 8px, card/panel 12px, แถวตาราง 0 (แยกด้วยเส้นบาง)
- Shadow: ขอบ 1px + เงาเบามาก (`0 1px 2px rgba(20,48,59,.04)`) เท่านั้น
- Touch target ขั้นต่ำ 44px (`min-h-touch`) ปุ่มสั่งงานหน้า Job ใช้ 52px

### 3.5 Motion

ไม่มี animation ตกแต่งนอกหน้า Live อนุญาตเฉพาะ spinner ของการโหลดและการเปลี่ยนสีเมื่อ hover/focus (`transition-colors`) รองรับ `prefers-reduced-motion`

---

## 4. Global shell

### 4.1 Desktop (>= 1024px)

```
+----------------+------------------------------------------------------+
| [mark] Job Task|  Dashboard                    Synced 10:42  [refresh]|
|                |  Toronto · Mon, Oct 12                               |
| Dashboard      +------------------------------------------------------+
| Fill Task      | [<] Oct 12 - Oct 18 [>] [This week] [Line v][Status v]|  sticky
| Job            +------------------------------------------------------+
| Live           |                                                      |
|                |   page content                                       |
|                |                                                      |
| ---------      |                                                      |
| (JT) Name      |                                                      |
| User Profile   |                                                      |
| Team Settings  |                                                      |
| Sign out       |                                                      |
+----------------+------------------------------------------------------+
```

เปลี่ยนจากปัจจุบัน:
- **หัวข้อหน้าเดียว** ใน topbar เป็น `<h1>` ลบ `h2` + eyebrow + description ที่ซ้ำใน section ชื่อแบรนด์ใน sidebar เปลี่ยนเป็น `<div>`
- ลบ eyebrow ตัวพิมพ์ใหญ่ ("OPERATIONS / OVERVIEW", "WORKSPACE", "PRODUCTION AT A GLANCE") ใช้ sentence case และตัวอักษร >= 12px
- เขตเวลาแสดงครั้งเดียวใน topbar (ลบซ้ำที่ footer)
- **Sync status ย้ายไปมุมขวา topbar:** จุดสี + "Synced 10:42" + ปุ่ม refresh แบบไอคอน (มี `aria-label`) ถ้า stale ให้เปลี่ยนเป็นจุดส้ม + "Data may be outdated" และแสดงแถบเตือน **ครั้งเดียว** พร้อมปุ่ม Try again
- **Toolbar แถวเดียว** ที่ 1366px: ลูกศรสัปดาห์ + ช่วงวันที่, This week, Line, Status ตัว "Select week" บน Dashboard เก็บไว้ได้ตามเดิม (ย้ายเป็น popover เป็นข้อเสนอเสริมข้อ 10) และให้ toolbar **sticky** ใต้ topbar
- Footer เหลือบรรทัดเดียวขนาด 12px

### 4.2 Tablet and phone (< 1024px)

```
+--------------------------------------+
| Job Task               Synced 10:42 R|   compact topbar 56px
+--------------------------------------+
| Job                                  |   page title
| [<] Oct 12 - Oct 18 [>] [This week]  |
| [Line v] [Status v]                  |
+--------------------------------------+
|  content                             |
|                                      |
+--------------------------------------+
| Dash | Fill | Job | Live | More      |   bottom tab bar 64px
+--------------------------------------+
```

- ใช้ **bottom tab bar** แทนแถบ nav ด้านบน เพื่อให้นิ้วโป้งกดถึงและคืนพื้นที่แนวตั้ง แต่ละแท็บมีไอคอน + ป้ายข้อความ ขนาดเป้า >= 48px
- "More" รวม User Profile, Team Settings (Manager), Sign out
- Fill Task ซ่อนเมื่อ role ไม่ใช่ planner ตามเดิม
- ใช้ `100dvh` แทน `100vh` ทุกที่ (`.app-shell`, `.app-sidebar`, `.live-board:fullscreen`, SignIn)
- เว้น `padding-bottom` ให้เนื้อหาไม่ถูก tab bar บัง และรองรับ `env(safe-area-inset-bottom)`

---

## 5. Screen designs

### 5.1 Job (หน้าหลักของหน้างาน)

**เป้าหมาย:** เห็นงานที่ต้องทำ และกดปุ่มได้ในที่เดียว ไม่ต้องเลื่อน

Desktop / tablet landscape (>= 768px): การ์ดเป็นแถวเดียวที่มี **action rail** ทางขวา

```
+-+----------------------------------------------------+---------------+
|#|  Mon, Oct 12  /  CKT1A                [Play] In progress | [ Pause ]  |
|1|  Pack 8x12oz Flavor sunset                         |               |
| |  Notes line if any (max 2 lines, expandable)       | [ Done  ]     |
| |  [clock] 02h 15m active   [target] 8 skids         |               |
| |  First started 06:05 | Last paused - | Last resumed - | Done -     |
| |                                                    | History       |
+-+----------------------------------------------------+---------------+
 ^ left accent 6px by status                              ^ rail 168px
```

รายละเอียด:
- **Left accent 6px** ตามสีสถานะ และ **row tint** อ่อนตามตาราง 3.2 งาน In progress เด่นกว่าอื่นด้วย tint + accent (ไม่ใช้ motion)
- บรรทัดบน: วันที่ / Line (12–13px, ตัวหนา) และ **Status chip** ชิดขวา (ไอคอน + ข้อความ)
- ชื่องาน 15–16px ตัวหนา ตัดบรรทัดได้เต็มความยาว (ห้าม truncate ชื่องาน)
- Metrics: Active time, Target, Overdue (ใช้สี Overdue ใหม่ + ไอคอน) เป็น chip ขนาด 12–13px
- Timestamps ทั้ง 4 ตัว (`First started`, `Last paused`, `Last resumed`, `Done`) แสดงครบเป็นบรรทัดเดียวที่ >= 1280px และ 2x2 ที่ต่ำกว่านั้น **ไม่ซ่อนข้อมูล** สี Done คงเป็นแดงเมื่อมีค่า
- **Action rail:** ปุ่มสูง 52px กว้างเต็ม rail ปุ่มหลักของสถานะนั้นอยู่บนสุด (Start / Pause / Resume) และ Done ถัดลงมา ปุ่ม History เป็น ghost อยู่ล่างสุดของ rail ปุ่มที่ใช้ไม่ได้ตาม state จะไม่แสดง (เป็นไปตาม `availableActions`)
- **ปุ่ม Done คงเป็นแดง (`danger`)** ตาม contract และมี dialog ยืนยันเดิม
- **Start/Resume ที่ถูกบล็อก** (line กำลังรันงานอื่น): ปุ่ม disabled + บรรทัดอธิบายใต้ปุ่มพร้อมไอคอน `AlertCircle` ขนาด 12–13px ใช้สี Overdue/amber ที่ contrast ผ่าน ข้อความเดิม `This line is already running "...". Pause or Done that job first.` ห้ามพึ่งแค่ `title` tooltip (แท็บเล็ตไม่มี hover)
- `done`: ไม่มีปุ่มสถานะ rail แสดงข้อความ **Done** สีแดงตาม contract

Mobile (< 768px): การ์ดซ้อนแนวตั้ง ปุ่มอยู่ท้ายการ์ด

```
+--------------------------------------+
| #1   Mon, Oct 12 / CKT1A   [Play] In progress |
| Pack 8x12oz Flavor sunset            |
| [clock] 02h 15m   [target] 8 skids   |
| First started 06:05                  |
| (Last paused / resumed / Done: -)    |
| [ Pause        ] [ Done         ]    |  52px, 2 columns
| History                              |
+--------------------------------------+
```

- ปุ่มเต็มความกว้าง 2 คอลัมน์ ถ้ามีปุ่มเดียวให้กว้างเต็มแถว
- Timestamps แสดงเป็นรายการ label/value 2 คอลัมน์ ไม่ขึ้นแถบเลื่อนแนวนอน

States: Loading = skeleton แถวนิ่ง (ไม่มี shimmer) + `role="status"`, Empty = ไอคอน + "No tasks in the selected period", Error = ข้อความ + Try again, Busy = ปุ่มแสดง "Saving…" และ disabled

### 5.2 Dashboard

**เป้าหมาย:** ภาพรวมสัปดาห์แบบสแกนเร็ว ใช้ภาษาภาพเดียวกับ Live (แถวสีอ่อน เส้นบาง ตารางกระชับ)

```
+----------------------------------------------------------------------+
| To do  12  | In progress  3 | Paused  1 | Done  8 || Total 24 | Overdue 2 | Active 31h 20m |
+----------------------------------------------------------------------+
| Production schedule                                      24 tasks    |
+----------------------------------------------------------------------+
| Mon, Oct 12 - 6 tasks                                                |   sticky date header
| #  Line  Task                       Target Status      Active  Times  |
| 1  CKT1A Pack 8x12oz Flavor sunset  8      [Play] In p. 02h15m 4 x   |
| 2  CKT1B Pack 8x1.5lb flavor        5      [Circle] To do  -   -     |
| ...                                                                  |
| Tue, Oct 13 - 4 tasks                                                |
+----------------------------------------------------------------------+
```

- **Summary strip แถวเดียว** (สูง <= 72px) รวม 4 KPI สถานะ + Total, Overdue, Active time แทนการ์ด 4 ใบ + แถบสถิติอีกชุด แต่ละช่องมีแถบสีสถานะซ้าย + ไอคอน + ตัวเลข 28px ที่ phone แสดง 2 คอลัมน์
- ลบป้าย **"Weekly performance"** (ดูเหมือนปุ่มแต่ไม่มีหน้าที่)
- **ตารางจัดกลุ่มตามวัน:** header วัน sticky ("Mon, Oct 12 · 6 tasks") แทน label วันซ้ำในทุกแถว
- คอลัมน์ desktop (>= 1280): `#` (48) | `Line` (64) | `Task` (flex, >= 280) | `Target` (72) | `Status` (120) | `Active` (88) | `Times` (ช่องรวมสี่ค่า 2x2: First started / Last paused / Last resumed / Done)
- แถวสูงประมาณ 64px, tint ตามสถานะ, เส้นแบ่งบาง 1px, left accent 4px
- ที่ < 1024px: แถวเปลี่ยนเป็นการ์ดบรรทัดเดียวย่อ (ลำดับ + line + ชื่อ + chip) พร้อมตาราง Times 2x2 ด้านล่าง ไม่ซ่อนข้อมูล
- Overdue ใช้ chip ส้มแยกจากสถานะ (modifier ซ้อนกับสถานะได้)
- ปุ่ม "Load more tasks" อยู่กึ่งกลางท้ายรายการตามเดิม

### 5.3 Fill Task

อ้างสัญญา `docs/screens.md` (Fill Task, Job List) **ตรวจกับ `FillTask.tsx` ก่อนลงมือ** เอกสารนี้กำหนดเฉพาะหน้าตา

Desktop: ตารางแก้ไขได้ 1–10 แถว

```
+----------------------------------------------------------------------+
| Plan tasks                                           Week Oct 12-18  |
+----------------------------------------------------------------------+
| Est.# Date        Line   Job List (optional)  Task            Target |
|  14   Mon Oct 12  CKT1A  [Choose from list v] [Pack 8x12oz...] [8]  [x]
|  15   Mon Oct 12  CKT1B  [Custom task        v] [............]  [ ]  [x]
|  Description (optional) .....................................         |
+----------------------------------------------------------------------+
| [+ Add row  (2/10)]                       [ Save tasks ]  <- sticky  |
+----------------------------------------------------------------------+
```

- **Est.#** เป็น badge อ่านอย่างเดียว (เลขประมาณการ เลขจริงมาจาก server) ติดป้าย "Estimated" ใน tooltip/aria
- Validation แสดงใต้ช่องที่ผิด สีแดง + ไอคอน + ข้อความ และมีสรุป "N rows need attention" ที่แถบล่าง
- **Sticky action bar** ท้ายหน้า: `Add row (n/10)` (outline) และ `Save tasks` (primary, ใหญ่) แสดงสถานะ busy/success/conflict แบบข้อความ (`role="status"` / `role="alert"`) ไม่ auto-save
- งาน `todo` ที่แก้ไขได้: ปุ่ม Save ของฟอร์มแก้ไขชัดเจน งานที่เริ่มแล้ว แสดงไอคอนกุญแจ + "Plan locked"
- Mobile: แต่ละแถวเป็นการ์ดแนวตั้งหนึ่งใบ (Date/Line เป็น 2 คอลัมน์ ที่เหลือเต็มความกว้าง) ปุ่มลบแถวขนาดเป้า 44px

### 5.4 Live (ปรับเฉพาะภาษาภาพ ห้ามแตะ animation)

Spec ใน `docs/screens.md` มีผลเหนือกว่า ข้อกำหนดที่ย้ำ:
- Title ของแถว >= 12px ทุก density, ฟอนต์ meta/label ตามขั้นต่ำที่ spec ระบุ
- ป้ายสถานะมีข้อความทุกแถว (ไม่พึ่งสีอย่างเดียว) และคง sprite เป็น overlay ไม่ดันความสูงแถว
- ใช้ภาษาภาพเดียวกับ Dashboard/Job ใหม่: header lane ที่ tint, แถวบาง, เส้นแบ่งบาง
- ใช้ `100dvh` ใน fullscreen
- สถานะ error ของ refresh ต้องเห็นชัดตามเดิม

### 5.5 Team Settings (Manager only)

- Desktop: subnav ซ้าย 220px (Users / Production Lines / Line Members / Job List) + panel ขวา, panel หัวข้อเดียว
- ตาราง Users: `Name | Username | Role | Status | Actions` แถวบาง tint เมื่อ inactive (ข้อความ "Inactive" + ไอคอน)
- แก้ไขแบบ inline ในแถวหรือ panel ด้านข้าง ไม่เปิด dialog ซ้อน
- Mobile: subnav เป็นแถบเลื่อนแนวนอน (ไม่ใช้ bottom tab) แต่ละแถวผู้ใช้เป็นการ์ดย่อ
- Job List: ตัวกรอง Production line อยู่บน panel เสมอ ใช้ Select เดิม

### 5.6 User Profile

- คอลัมน์เดียว กว้างสูงสุด 560px สองการ์ด: **Profile** (Username read-only, Change name) และ **Password** (ปุ่ม Change password)
- Username แสดงเป็นข้อความอ่านอย่างเดียวพร้อมไอคอนล็อก ไม่ใช้ input ที่ดูแก้ได้

### 5.7 Sign in

- โครงเดิมใช้ได้ (การ์ดกลางจอ 440px) ปรับ `min-h-dvh` และให้ error อยู่ติดช่อง password พร้อมไอคอน ไม่เพิ่มฟังก์ชัน (เช่น show password)

---

## 6. Component specs

| Component | Spec |
| --- | --- |
| Button | ขนาด default 44px; `floor` 52px สำหรับ Start/Pause/Resume/Done; variants `primary` / `outline` / `ghost` / `danger`; focus ring 2px `--ring` offset 2px; disabled opacity .5 + `aria-disabled` |
| Status chip | ไอคอน 14px + ข้อความ 12px/700 + พื้นสีตามข้อ 3.2; รูปทรงเต็มวง; ใช้ component เดียวร่วมกัน (`Status` ใน `JobDisplay.tsx`) ทุกหน้า |
| Overdue chip | พื้น/ข้อความ/ไอคอนตามข้อ 3.2 แสดงเป็น modifier ข้างสถานะ |
| Metric chip | ไอคอน 14px + ค่า 13px/700 + หน่วย 12px |
| Table row | tint ตามสถานะ + เส้นแบ่ง 1px + left accent 4–6px; hover เปลี่ยนเฉพาะพื้นอ่อนมาก |
| Date group header | sticky, 13px/800, พื้น `--muted`, แสดงจำนวนงาน |
| Toolbar | sticky, สูง <= 64px ที่ desktop; ช่องกรองใช้ `Select` เดิม |
| Sync indicator | จุด 8px + ข้อความ 12–13px + ปุ่ม refresh แบบไอคอน; สี teal เมื่อ sync, ส้มเมื่อ stale |
| Alert banner | `role="alert"`, ไอคอน + ข้อความ + ปุ่มลองใหม่; ใช้สีแดงสำหรับ error จริงเท่านั้น |
| Dialog (Done) | แสดงชื่องาน, Line, Active time; ปุ่ม `Cancel` (outline) และ `Confirm Done` (danger) ขนาด 52px; Radix จัดการ focus/Esc ตามเดิม |
| Empty / Loading / Error / Stale | ครบทุกหน้า; Loading ใช้ skeleton นิ่ง + `role="status"` |

---

## 7. Responsive rules

| Breakpoint | Shell | Job | Dashboard | Fill Task |
| --- | --- | --- | --- | --- |
| >= 1280 | sidebar 236px | row + action rail, timestamps บรรทัดเดียว | ตาราง 7 คอลัมน์ | ตารางแก้ไขเต็ม |
| 1024–1279 | sidebar 236px | row + rail, timestamps 2x2 | ตาราง, Times 2x2 | ตารางแก้ไข |
| 768–1023 | bottom tab bar | row + rail | การ์ดย่อ | การ์ดต่อแถว (2 คอลัมน์ได้) |
| < 768 | bottom tab bar | การ์ดซ้อน ปุ่มท้ายการ์ด | การ์ดย่อ | การ์ดต่อแถว |

กฎรวม: ไม่มีแถบเลื่อนแนวนอนในการทำงานหลัก, ปุ่มสั่งงานไม่ถูกตัดข้อความ, `min-width: 320px`

## 8. Accessibility checklist

- `<h1>` หนึ่งตัวต่อหน้า, ลำดับ h1 → h2 → h3 ไม่ข้ามระดับ
- `<nav aria-label="Main navigation">` คงเดิม และใช้ `aria-current="page"`
- ทุกสถานะมีข้อความ + ไอคอน (ไม่ใช้สีอย่างเดียว) รวมถึง Overdue และ Done
- Contrast ข้อความ >= 4.5:1, ส่วนประกอบ UI >= 3:1; ห้ามใช้เทา `#9aacb2` กับข้อความที่ต้องอ่าน
- Focus ring มองเห็นทุกองค์ประกอบ, ลำดับ Tab ตรงกับลำดับภาพ
- ปุ่มไอคอนมี `aria-label`; Select/Dialog ใช้ Radix ต่อไป
- ข้อความ error ใช้ `role="alert"`, สถานะโหลด/บันทึกใช้ `role="status"`
- รองรับ `prefers-reduced-motion`; รองรับซูม 200% โดยไม่เสียการใช้งาน
- ต้องตรวจมือ (keyboard, screen reader, contrast) เป็น release gate แยก นอกเหนือจาก axe-core

## 9. Copy rules (English only)

- Sentence case ("Production schedule", ไม่ใช่ "PRODUCTION SCHEDULE") ยกเว้นชื่อ line (CKT1A)
- ปุ่มใช้คำกริยาสั้น: Start, Pause, Resume, Done, Save tasks, Add row, Try again
- ข้อความ error บอก "เกิดอะไร + ทำอะไรต่อ" ในภาษาง่าย ไม่แสดงรหัสทางเทคนิคดิบแก่ผู้ใช้ทั่วไป
- เวลาและ duration ใช้ formatter เดิม (`formatInstant`, `formatDuration`, `formatBusinessDate`) ห้ามคำนวณเวลาฝั่ง client

---

## 10. Open decisions for the owner

ข้อเหล่านี้ **ยังไม่รวมใน phase visual-only** ต้องให้ owner ตัดสินก่อน

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | **Done color ไม่ตรงกัน:** Dashboard/Job ใช้แดง (contract) แต่ Live ใช้เขียว | คงตาม contract ทั้งสองแบบไว้ก่อน ถ้าต้องการให้ตรงกัน ต้องแก้ `docs/screens.md` ก่อน ไม่ใช่แก้โค้ดอย่างเดียว |
| D2 | Overdue เปลี่ยนจากแดงเป็นส้มเข้ม + ไอคอน เพื่อแยกจาก Done | Implemented locally; retained in the owner-authorized layout follow-up |
| D3 | KPI สถานะกดแล้วตั้งตัวกรอง Status ได้ | เพิ่มพฤติกรรมใหม่ รออนุมัติ |
| D4 | จัดกลุ่ม "Running now" ปักบนสุดของหน้า Job | เปลี่ยนลำดับการเรียงที่ contract กำหนด รออนุมัติ |
| D5 | ย้าย "Select week" เข้า popover | เป็นเรื่อง layout อย่างเดียว ทำเป็นลำดับท้าย |
| D6 | Bottom tab bar สำหรับ < 1024px | Implemented locally, including More; owner authorized the layout follow-up |

---

## 11. Implementation plan (one tiny change at a time)

ทำทีละขั้น ตรวจ diff และทดสอบทุกขั้นตาม `AGENTS.md` ระบุไฟล์เป็นรายไฟล์ ไม่ใช้ glob

| Phase | Change | Files (owned paths) | Risk |
| --- | --- | --- | --- |
| P0 | เพิ่ม tokens สถานะ, Overdue, ขั้นต่ำฟอนต์ 12px | `design/theme.css`, `src/index.css` | ต่ำ |
| P1 | Status chip + ไอคอน, Overdue modifier | `src/features/JobDisplay.tsx` | ต่ำ |
| P2 | Job: action rail, row tint/accent, blocked note | `src/features/Jobs.tsx`, `src/index.css`, `src/components/ui.tsx` (ขนาดปุ่ม `floor`) | กลาง |
| P3 | Shell: หัวข้อเดียว, sync indicator, sticky toolbar, ลบ eyebrow/footer ซ้ำ | `src/App.tsx`, `src/index.css` | กลาง |
| P4 | Dashboard: summary strip, ตารางจัดกลุ่มวัน | `src/features/Dashboard.tsx`, `src/features/DashboardJobRow.tsx`, `src/index.css` | กลาง |
| P5 | Bottom tab bar + `dvh` | `src/App.tsx`, `src/index.css`, `src/features/SignIn.tsx` | กลาง |
| P6 | Fill Task sticky bar + แถวการ์ดบนมือถือ | `src/features/FillTask.tsx` | กลาง (ตรวจสัญญาก่อน) |
| P7 | Team Settings / User Profile ปรับภาษาภาพ | `src/features/TeamSettings*.tsx`, `src/features/UserProfile.tsx` | ต่ำ |

Acceptance ทุก phase:
- `npm run typecheck`, `npm run build`, `npm run check:schema`, `npm run test` ผ่าน (บันทึก exit status จริง)
- Playwright flows (Start, Pause, Resume, Done, Fill Task save) + axe-core ผ่าน
- สกรีนช็อตก่อน/หลังที่ 1920x1080, 1366x768, 375x812 (Dashboard, Job, Fill Task, Live, Team Settings)
- ไม่มี diff ใน `src/worker/**`, `migrations/**`, `src/shared/contracts.ts`
- ตรวจมือเรื่อง keyboard / contrast / screen reader แยกเป็น release gate
- ไม่มี deploy / push จนกว่า owner สั่งเฉพาะเป้าหมาย

## 12. Out of scope

เปลี่ยน API/DB/auth, เพิ่มฟังก์ชันใหม่, เปลี่ยน animation ของ Live, แปลภาษา UI, เปลี่ยนสี Done ที่ contract กำหนด, ย้ายโครงสร้างโฟลเดอร์
