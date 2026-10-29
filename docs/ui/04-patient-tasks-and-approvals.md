# UI Phase 4: Patient Tasks & Approvals

> **Goal:** Whenever an agent needs the patient (missing info, a document, a signature, or permission to submit), she answers in **one tap or one sentence** and the agent picks up right away.
> **Demo moment:** Maria answers *"Dr. Patel, Texas Oncology"* on her phone. In the live view on the big screen, the agent resumes and fills it in.

Builds on [03-application-detail-and-agent-live-view.md](./03-application-detail-and-agent-live-view.md).

---

## 1. Surfaces

| Surface | Where | Opens via |
|---|---|---|
| `TaskDrawer` | Right-side sheet (bottom sheet on mobile) | Needs-You banner, bell, `?task=:id` |
| `InlineTaskCard` | Inside `FieldMapPanel` rows and the application page | `needs_input` field |
| `ApprovalModal` | Centered dialog (`<dialog>`) | "Review & approve" |
| `/tasks` page | Full list (history and open) | Sidebar |

---

## 2. Task types → components

All tasks render through one `TaskCard` shell:

```
┌─────────────────────────────────────────────┐
│ 🟡 Pink Aid (demo) · asked 2 min ago        │
│                                             │
│ Who is your oncologist?                     │
│ The program needs this to verify treatment. │  ← why (always shown)
│                                             │
│ [ Dr. Anita Patel, Texas Oncology       ]   │  ← TaskInput by type
│                                             │
│ 🔒 Shared only with Pink Aid                 │  ← privacy line
│                       [ Skip ] [ Send ✓ ]   │
└─────────────────────────────────────────────┘
```

| `type` | Input component | Example ask |
|---|---|---|
| `text` | `TaskTextInput` (single line, autofocus) | "Who is your oncologist?" |
| `choice` | `ChipGroup` | "Are you currently working?" |
| `date` | `DateInput` | "When were you diagnosed?" |
| `file` | `DocUploader` (camera on mobile, drag and drop on desktop, image→PDF) | "Photo of your treatment letter" |
| `signature` | `SignaturePad` (draw or type) | "Sign the Remember Betty application" |
| `approve_submit` | opens `ApprovalModal` | "Ready to send Pink Aid?" |
| `takeover` | button → live view take-over mode | "Please solve the 'I'm not a robot' check" |
| `confirm_benefit` | Yes / Not yet | "Did you receive the $500 from Pink Aid?" |

**Every card must show:**
1. **Who's asking** (program and which agent)
2. **Why** it's needed, in one plain sentence (LLM-generated, ≤ 20 words)
3. **Who it's shared with** (privacy line)
4. **Skip** (marks the task `skipped`; the agent decides whether to continue or flag it)

Answers are saved to the profile (with permission), so **no question is ever asked twice** across programs. Show a "Saved to your profile ✓" micro-toast.

---

## 3. `ApprovalModal` ⭐ (approve before every submit)

```
┌────────────────────────────────────────────────────┐
│ Review before we send                         ✕    │
│ Pink Aid (demo) · Financial grant · up to $500     │
│ ────────────────────────────────────────────────── │
│ About you                                    Edit  │
│   Maria Garcia · 03/14/1972 · Austin, TX           │
│ Your care                                    Edit  │
│   Stage II · In chemo · Dr. Anita Patel            │
│ Money                                        Edit  │
│   Household of 3 · $2,000–3,000/mo                 │
│ Documents                                          │
│   📄 treatment-letter.pdf                           │
│ ────────────────────────────────────────────────── │
│ 🔒 Not shared: SSN, bank details                    │
│                                                    │
│ [✓] This information is true to my knowledge       │
│                                                    │
│      [ Not yet ]          [ Approve & send → ]     │
└────────────────────────────────────────────────────┘
```

- Grouped summary, not a raw form dump. "Edit" makes the value editable inline.
- **PDF variant (Remember Betty):** shows a `PdfPreview` thumbnail plus `SignaturePad`. The button reads **"Sign & email to Remember Betty."**
- After approval: a confetti-lite burst (rose and sage dots, 600ms), then "Sent! We'll watch your inbox for a reply." The modal closes and the stepper advances.

---

## 4. Interaction details
- **Optimistic UI:** the card collapses with a check animation immediately; it rolls back if the API fails
- **Agent resume signal:** after submit, the card shows "Agent picked this up ✓" once the Form Agent acknowledges it (realtime event `task_consumed`)
- **Batching:** if a program needs 3 answers, show a single card with a stepper ("1 of 3"), not 3 cards
- **Keyboard:** `Enter` sends, `Esc` closes the drawer, `J`/`K` move between tasks

---

## 5. Data and API
| Call | Purpose |
|---|---|
| `GET /api/tasks?status=open` | Drawer list |
| `POST /api/tasks/:id/answer` | `{ value | fileId | signature }` → marks the task done, emits `task_answered`, wakes the workflow (`inngest.send('task/answered')`) |
| `POST /api/tasks/:id/skip` | Skip with an optional reason |
| `POST /api/applications/:id/approve` | Moves the state to `Submitted` and triggers the submit step |
| Storage bucket `patient-docs` (private, signed URLs) | Uploaded files |

`patient_tasks` schema additions: `type`, `why`, `shared_with`, `field_key`, `options jsonb`, `answer jsonb`, `answered_at`, `consumed_at`.

---

## 6. Edge cases
- **Upload is HEIC or too big:** convert or compress client-side; cap at 10MB
- **Task becomes irrelevant** (e.g. the program closed): auto-resolve with the note "No longer needed"
- **Patient gives an ambiguous answer:** the agent may create one follow-up clarification task, never more than one

---

## 7. Acceptance criteria
- [ ] Answering a task resumes the paused agent in **< 3s** (visible in the live view)
- [ ] Every task shows asker, why, and shared-with
- [ ] No submit happens without an `approve_submit` approval recorded in `events`
- [ ] The Remember Betty flow captures a signature that's embedded in the PDF
- [ ] An answer given once is reused automatically by the next program's form
