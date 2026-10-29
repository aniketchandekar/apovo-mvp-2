# UI Phase 5: Care Inbox, Follow-ups & Timeline

> **Goal:** Show that Apovo **doesn't drop the ball**. Every email from a program is read, sorted, and acted on, and silence gets a polite follow-up until the benefit arrives.
> **Demo moment:** Click **⚡ Fast-forward 5 days**. The Follow-up Agent drafts and sends a nudge, a "need more info" reply lands, it turns into a task, and finally an **Approved: $500** email flips the card to sage.

Builds on Phases 2 to 4.

---

## 1. Routes
| Route | Purpose |
|---|---|
| `/inbox` | The care inbox (AgentMail-backed), triaged by the Inbox Agent |
| `/inbox/[threadId]` | Thread view with the AI summary and actions |
| `/timeline` | Full audit trail across all applications |
| Demo controls panel | Slide-over from the sidebar (`NEXT_PUBLIC_DEMO=1`) |

---

## 2. Care inbox (`/inbox`)

```
┌───────────┬────────────────────────────┬─────────────────────────────────────┐
│ sidebar   │ maria.garcia@agentmail.to ⧉│  Pink Aid (demo)                     │
│           │ [All][Needs you][Waiting]  │  "Additional information needed"     │
│           │ [Done]                     │ ─────────────────────────────────── │
│           │ ────────────────────────── │  ✨ Apovo summary                     │
│           │ ● Pink Aid        2m       │  They need a copy of a recent        │
│           │   Needs info  🟡           │  treatment letter by Nov 7.          │
│           │ ○ Clean Home      1h       │  → Created task for Maria            │
│           │   Confirmation  ✓          │                                      │
│           │ ○ Apovo → Pink Aid 5d      │  [ Answer task ] [ View original ▾ ] │
│           │   Follow-up sent ↻         │ ─────────────────────────────────── │
│           │ ○ Remember Betty  6d       │  Original email (collapsed)          │
│           │   Received ✓               │  ...                                 │
└───────────┴────────────────────────────┴─────────────────────────────────────┘
```

### Components
| Component | Notes |
|---|---|
| `InboxHeader` | Care address with a copy button, plus filter tabs with counts |
| `ThreadListItem` | Sender/program, subject, relative time, `ClassificationChip`, unread dot. Outbound (agent-sent) messages get a plum ↗ icon. |
| `ClassificationChip` | `confirmation` ✓ slate · `needs_info` 🟡 amber · `pending` ⏳ slate · `approved` 🎉 sage · `denied` muted rose · `benefit_delivered` 💚 sage · `unrelated` gray |
| `AISummaryCard` | 1 to 2 sentence plain-language summary, extracted deadline, actions taken ("Created task", "Scheduled follow-up Thu") |
| `OriginalEmail` | Collapsed by default; sanitized HTML render |
| `ReclassifyMenu` | "Wrong label?" lets you fix it manually (logs an event; useful when the demo goes wrong) |

> The patient **never has to read raw program emails**. The summary card is the main view.

---

## 3. Follow-ups

### `FollowUpCard` (on the application page and the inbox)
```
┌──────────────────────────────────────────────┐
│ ↻ Next follow-up: Thu, Oct 30 (in 4 days)    │
│ Ladder:  ✓ Day 5 email · ○ Day 10 email ·    │
│          ○ Day 15 "call needed" flag         │
│ [ Preview message ]  [ Send now ]  [ Pause ] │
└──────────────────────────────────────────────┘
```

### `FollowUpPreview` (drawer)
- Shows the LLM-drafted email: from `maria.garcia@agentmail.to`, signed **"Apovo, on behalf of Maria Garcia"**
- Patient options: **Looks good** (default auto-send) · **Edit** · **Don't send**
- MVP default: follow-ups auto-send (low risk); only submissions need approval

### "Call needed" escalation
- At the end of the ladder, create a `takeover`-style task: *"Remember Betty hasn't replied in 15 days. Here's their number and a 3-line script."*

---

## 4. Timeline (`/timeline`)
A vertical, filterable audit trail. It's the "trust receipt."

| Element | Notes |
|---|---|
| `TimelineFilter` | by application, by agent (Form / Inbox / Follow-up / You), by type |
| `TimelineItem` | agent avatar, sentence, timestamp, optional attachments: 🎥 replay link, 📨 email, 📄 doc |
| Day separators | "Today", "Yesterday", "Oct 21" |
| `BenefitMilestone` | special sage card with value: "🎉 Pink Aid approved: $500" |

Example sequence:
```
✍️  You signed consent                              Oct 25 11:58p
📮  Care inbox created                              Oct 25 11:59p
🤖  Form Agent filled Pink Aid (9 fields) 🎥        Oct 26 12:01a
🟡  Form Agent asked you: oncologist                12:01a
👤  You answered                                    12:02a
✅  You approved & Pink Aid was submitted           12:03a
📨  Inbox Agent: confirmation from Pink Aid         12:03a
↻   Follow-up Agent emailed Pink Aid (day 5)        Oct 31
📨  Inbox Agent: Pink Aid needs a treatment letter  Nov 1
🎉  Pink Aid approved: $500                         Nov 3
💚  You confirmed you received it                   Nov 10
```

---

## 5. Demo controls ⚡ (hackathon only)
A slide-over panel to drive the story reliably on stage:

| Control | Effect |
|---|---|
| **Seed Maria** | Reset the DB to the onboarding-complete state |
| **Fast-forward N days** | Sets a virtual clock and fires due Inngest follow-up events now |
| **Simulate program reply ▾** | Mock site sends `confirmation` / `needs_info` / `approved` / `denied` to the care inbox via a real email |
| **Mark benefit received** | Shortcut to the final state |
| **Toggle narration speed** | Slows the agent for the audience |

Clearly marked with a striped "DEMO" header; never rendered in prod builds.

---

## 6. Data and API
| Source | Use |
|---|---|
| AgentMail webhook → `POST /api/webhooks/agentmail` | Store `emails`, run Inbox Agent classification, update `applications`, create tasks |
| `emails` table | `id, application_id, direction, from, to, subject, body_html, classification, summary, deadline, thread_id` |
| `GET /api/inbox?filter=` | List threads |
| `POST /api/applications/:id/followup` | Send now / preview / pause |
| `GET /api/events?appId=&agent=` | Timeline |
| `POST /api/demo/*` | Demo controls (guarded by `DEMO` env flag) |

---

## 7. Edge cases
- **Email can't be matched to an application:** goes to "Unsorted," with a one-click "Link to…" option
- **Program replies from a no-reply or different domain:** fall back to LLM matching on subject and body
- **Denied:** compassionate copy ("This one didn't work out. We've already found 2 similar programs."), then suggest next matches
- **Duplicate webhook:** dedupe on AgentMail `message_id`

---

## 8. Acceptance criteria
- [ ] A real inbound email to the care inbox appears in `/inbox` with a classification in **< 10s**
- [ ] A `needs_info` email automatically creates a Phase 4 task
- [ ] Fast-forward triggers a real outbound follow-up email from the care inbox
- [ ] An `approved` email updates the state, the benefits counter, and adds a timeline milestone
- [ ] The timeline shows every agent action with a replay or email link
