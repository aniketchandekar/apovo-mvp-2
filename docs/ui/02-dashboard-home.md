# UI Phase 2: Dashboard Home

> **Goal:** In 3 seconds, Maria can answer: *"Is anything waiting on me? What's been secured? Is Apovo working?"*
> **Demo moment:** The "Agents working now" strip pulses while the first application starts. The benefits counter ticks up when an application is approved.

Builds on the design foundations in [01-onboarding.md §0](./01-onboarding.md).

---

## 1. Route and layout

`/dashboard` is the home. It sits inside `AppShell`, which is shared with Phases 3 to 5.

```
┌───────────┬──────────────────────────────────────────────────────────┐
│ apovo     │  Good evening, Maria                       🔔 2   (MG)  │
│           │                                                          │
│ ● Home    │  ┌───────────────────────────────────────────────────┐   │
│ ○ Programs│  │ ⚠ 2 things need you            [ Review now → ]  │   │  ← NeedsYouBanner
│ ○ Inbox   │  └───────────────────────────────────────────────────┘   │
│ ○ Timeline│                                                          │
│           │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│           │  │ $500       │ │ 3          │ │ 1          │           │  ← StatTiles
│           │  │ secured    │ │ in progress│ │ follow-up  │           │
│           │  └────────────┘ └────────────┘ └────────────┘           │
│ ───────── │                                                          │
│ Care inbox│  ◉ Agents working now                                    │  ← AgentActivityStrip
│ maria.    │  Form Agent is filling "Pink Aid" · 4 of 9 fields        │
│ garcia@   │                                                          │
│ agentmail │  Your programs                                           │
│ .to  ⧉    │  ┌──────────────────────────────────────────────────┐   │
│           │  │ Remember Betty   Financial  ● Needs your OK  →   │   │  ← ApplicationCard
│ ───────── │  │ Pink Aid (demo)  Financial  ● Agent filling  →   │   │
│ Demo ⚡   │  │ Clean Home (demo) Cleaning  ● Submitted      →   │   │
│ controls  │  └──────────────────────────────────────────────────┘   │
│           │                                                          │
│           │  Recent activity                   See full timeline →  │  ← ActivityFeed (last 5)
└───────────┴──────────────────────────────────────────────────────────┘
```

- **Desktop:** a 240px sidebar plus fluid content (max 1100px)
- **Mobile:** the sidebar becomes a bottom tab bar (Home · Programs · Inbox · Timeline); stat tiles become a horizontal scroll

---

## 2. Components

### `AppShell`
- Sidebar nav, a care-inbox chip with copy button, and a demo-controls entry (only when `NEXT_PUBLIC_DEMO=1`)
- The top bar shows the greeting (time-aware), a notification bell with the open task count, and an avatar

### `NeedsYouBanner`
| Prop | Type |
|---|---|
| `count` | number of open `patient_tasks` |
| `href` | `/tasks` (Phase 4 drawer) |

- Hidden when `count === 0`; replaced by a calm sage message: *"Nothing needs you right now. Your agents are on it."*
- Amber background, gentle 2s glow pulse **once** on arrival (no looping)

### `StatTile`
- Props: `label`, `value`, `tone` (`sage` / `plum` / `amber`), `delta?`
- Tiles: **Benefits secured ($)** · **In progress** · **Awaiting reply** · (optional) **Hours saved**
- The value animates with a count-up when it changes

### `AgentActivityStrip` ⭐
- Shows live agent runs: `{ agent: 'form' | 'inbox' | 'followup', application, message, progress? }`
- Has a pulsing plum dot and a shimmer progress bar
- Click goes to that application's live view (Phase 3)
- Empty state: "Agents are resting. Next follow-up: Thu, Oct 30."

### `ApplicationCard`
| Prop | Notes |
|---|---|
| `resource` | name, logo, category |
| `state` | maps to a `StatusPill` |
| `estValue` | "Up to $500" |
| `nextStep` | human sentence, e.g. *"Waiting on Remember Betty, follow-up Thu"* |
| `needsYou` | bool → amber left border |

- Hover: 2px lift and stronger shadow. Click goes to `/applications/:id`.

### `StatusPill`: one source of truth for state colors
| State | Label | Tone |
|---|---|---|
| `Matched` | Ready to apply | neutral |
| `Drafting` | Agent filling | plum (animated dot) |
| `NeedsPatientInput` | Needs you | amber |
| `AwaitingPatientApproval` | Needs your OK | amber |
| `Submitted` / `AwaitingResponse` | Waiting on program | slate |
| `FollowUpSent` | Followed up | slate + ↻ |
| `Approved` | Approved 🎉 | sage |
| `BenefitReceived` | Received ✓ | sage, filled |
| `Denied` | Not approved | muted rose |

### `ActivityFeed`
- The last 5 `events` in plain language, with an agent avatar and relative time
- E.g. *"📨 Inbox Agent read an email from Clean Home: confirmation received"*

---

## 3. First-visit experience (`?first=1`)
1. A welcome toast: "Your agents are starting on 3 programs."
2. Auto-trigger **Apply** on the first `Matched` web-form application (Pink Aid). The strip comes alive.
3. A coach-mark points to the Needs-You banner: "When we need you, it shows up here."

---

## 4. Data and realtime
| Source | Use |
|---|---|
| `GET /api/dashboard` | stats, applications, open tasks count, last events |
| Supabase Realtime on `applications`, `events`, `patient_tasks` | live updates without refresh |
| Derived `benefits_secured` | `sum(benefit_value) where state in (Approved, BenefitReceived)` |

---

## 5. Empty, loading, and error states
- **Loading:** skeleton tiles and cards (shimmer), never spinners
- **No programs matched:** "We're still looking. Add more needs?" links back to the needs step
- **Realtime disconnected:** a small "Reconnecting…" chip in the top bar; data is still shown

---

## 6. Acceptance criteria
- [ ] The dashboard reflects state changes in **< 2s** without a refresh
- [ ] The Needs-You banner count always matches open tasks
- [ ] Every `ApplicationCard` shows a human-readable next step
- [ ] Works at 375px width; no horizontal page scroll
- [ ] Lighthouse a11y ≥ 95
