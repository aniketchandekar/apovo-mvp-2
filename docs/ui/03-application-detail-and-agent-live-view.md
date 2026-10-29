# UI Phase 3: Application Detail & Agent Live View

> **Goal:** Make the AI's work **visible and trustworthy.** Maria (and the judges) can watch the agent fill a form in a real browser, see what it knows and what it doesn't, and see where things stand.
> **Demo moment:** The Browserbase live view is embedded. Fields fill in one by one, the agent pauses with *"I need your oncologist's name,"* and a task card appears.

Builds on [02-dashboard-home.md](./02-dashboard-home.md) (`AppShell`, `StatusPill`).

---

## 1. Route and layout

`/applications/[id]`

```
┌───────────┬──────────────────────────────────────────────────────────────┐
│ sidebar   │  ← Programs                                                  │
│           │  Pink Aid (demo)                 ● Agent filling             │
│           │  Financial grant · Up to $500                                │
│           │                                                              │
│           │  ┌─ StateStepper ─────────────────────────────────────────┐  │
│           │  │ ● Matched ─ ◉ Filling ─ ○ Your OK ─ ○ Sent ─ ○ Reply ─ ○ Approved ─ ○ Received │
│           │  └────────────────────────────────────────────────────────┘  │
│           │                                                              │
│           │  ┌──── AgentLiveView (60%) ─────┐ ┌── FieldMapPanel (40%) ─┐ │
│           │  │                              │ │ ✓ Full name   Maria G. │ │
│           │  │   [ Browserbase iframe ]     │ │ ✓ DOB         ••/••/72 │ │
│           │  │                              │ │ ✓ Address     Austin…  │ │
│           │  │                              │ │ ◌ Diagnosis date  …    │ │
│           │  │                              │ │ ? Oncologist  needs you│ │
│           │  │ ◉ LIVE · session 3f2a…  ⤢    │ │ 🔒 SSN        skipped  │ │
│           │  └──────────────────────────────┘ └────────────────────────┘ │
│           │                                                              │
│           │  Agent narration                                             │
│           │  "Filling 'Household income' with $2,000–3,000/mo…"          │
│           │                                                              │
│           │  [ Tabs: Activity | Emails | Documents | Details ]           │
└───────────┴──────────────────────────────────────────────────────────────┘
```

- **Mobile:** the live view goes full-width and collapses to 16:9; `FieldMapPanel` becomes an accordion under it

---

## 2. Components

### `StateStepper`
- Shows the happy path from the state machine (implementation plan §3)
- The current step has a plum pulsing ring. Done steps are sage checks. If the state is `NeedsPatientInput`, an amber "!" bubble sits on the current step.
- `Denied` shows a muted rose terminal step

### `AgentLiveView` ⭐
| Prop | Notes |
|---|---|
| `sessionId` | Browserbase session |
| `liveUrl` | from `sessions.debug()` → `debuggerFullscreenUrl` |
| `replayUrl` | shown after the session ends |
| `mode` | `live` · `paused` · `replay` · `idle` |

- **live:** iframe (read-only, `pointer-events: none` by default) with a red "LIVE" chip and an expand button
- **paused:** the iframe is dimmed with an overlay card: *"Paused: waiting for you"* and a link to the task
- **replay:** a "▶ Watch what the agent did" button opens the replay
- **idle:** an illustrated placeholder; for PDF-path applications it shows a PDF preview instead (see §4)
- Has a "Take over" button (opt-in) that enables pointer events so the patient can solve a CAPTCHA or login herself

### `FieldMapPanel`
Each row comes from the agent's field-mapping output:

| Status | Icon | Meaning |
|---|---|---|
| `filled` | ✓ sage | Mapped from profile |
| `filling` | ◌ plum spinner | In progress |
| `needs_input` | ? amber | Became a `patient_task` (click to answer inline) |
| `sensitive_skipped` | 🔒 slate | SSN, bank, etc. Never auto-filled. |
| `not_applicable` | — | Field left blank on purpose |

- Values are masked by default (DOB, phone); tap 👁 to reveal
- A "Why this value?" tooltip shows the source profile field

### `AgentNarration`
- A single live line streamed from the Form Agent via SSE, Supabase Realtime, or a broadcast channel
- Typewriter effect, keeping the last 3 lines; it sounds human: *"Found the 'Apply' button, opening the form."*

### `ApplicationTabs`
| Tab | Content |
|---|---|
| **Activity** | Filtered `events` timeline for this application (shared `TimelineItem` from Phase 5) |
| **Emails** | Thread view of care-inbox messages linked to this application |
| **Documents** | Uploaded docs and the generated PDF (Remember Betty) |
| **Details** | Program info, eligibility match reasons ("✓ Active treatment, ✓ Texas resident"), official link |

---

## 3. Primary actions (context-aware, top-right)
| State | Button |
|---|---|
| `Matched` | **Start applying** → triggers the Form Agent |
| `Drafting` | Pause agent (secondary) |
| `NeedsPatientInput` | **Answer 1 question** → Phase 4 drawer |
| `AwaitingPatientApproval` | **Review & approve** → Phase 4 approval modal |
| `AwaitingResponse` | Send follow-up now (secondary) |
| `Approved` | **I received it** → `BenefitReceived` |

---

## 4. Remember Betty variant (PDF path)
Remember Betty's application is a downloadable PDF, so this page changes:
1. **Live view step 1:** the agent browses rememberbetty.com and finds and downloads the PDF (shown in Browserbase)
2. **Live view swaps to `PdfPreview`:** the filled PDF renders with highlighted fields; `FieldMapPanel` works the same way
3. **Approval** includes a **signature pad** (Phase 4), because the patient must sign
4. **Submit** means "Email via care inbox," which sends to the mock foundation inbox in the demo
5. The stepper label "Sent" reads *"Emailed to Remember Betty"*

---

## 5. Data
| Source | Use |
|---|---|
| `GET /api/applications/:id` | application, resource, field map, tasks, events |
| `POST /api/applications/:id/run` | start the Form Agent (returns `sessionId`, `liveUrl`) |
| Realtime channel `app:{id}` | narration lines, field status updates, state changes |
| `applications.field_map` (jsonb) | `[{ key, label, status, value_masked, source }]` |

---

## 6. Edge cases
- **Live URL expired:** fall back to the replay or the latest screenshot
- **Agent crashed:** "Something went wrong on the program's site. We'll retry in 5 min." Auto-retry and log the event.
- **Site layout changed:** Stagehand self-heals; if it still fails, create a `needs_input` task "Could you complete this one step?" with a take-over button

---

## 7. Acceptance criteria
- [ ] The live view shows the agent filling the mock form in real time
- [ ] `FieldMapPanel` updates field by field and matches what's typed into the form
- [ ] A sensitive field is never filled; it's shown as 🔒
- [ ] The agent pausing triggers a task creation, the paused overlay, and a Needs-You badge, all within 2s
- [ ] The replay link is saved on the timeline after the session ends
