# UI Phase 1: Onboarding

> **Goal:** In under 90 seconds, a breast cancer patient tells Apovo who she is and what she needs, gives permission to act for her, and gets her **care inbox**.
> **Demo moment:** The care inbox address appears live, created through AgentMail.

---

## 0. Design foundations (shared by all phases)

Patients may be tired, in pain, or dealing with "chemo brain." The UI should feel **calm, warm, and impossible to get lost in.**

| Token | Value | Notes |
|---|---|---|
| Font: display | `Fraunces` (soft serif) | Headlines; warm and human |
| Font: UI | `Inter` | Body text and controls |
| Base size | 18px body, 1.6 line-height | Larger than usual on purpose |
| `--bg` | `hsl(30 40% 98%)` warm cream | Avoid clinical white |
| `--surface` | `hsl(0 0% 100% / 0.75)` + `backdrop-filter: blur(16px)` | Glass cards |
| `--ink` | `hsl(340 25% 14%)` | Primary text |
| `--rose` | `hsl(340 70% 58%)` | Brand accent: a nod to the pink ribbon without being saccharine |
| `--plum` | `hsl(280 35% 38%)` | Secondary and agent color |
| `--sage` | `hsl(150 30% 45%)` | Success and "benefit secured" |
| `--amber` | `hsl(38 90% 55%)` | "Needs you" |
| Radius | 20px cards, 999px pills | Soft and friendly |
| Motion | 200 to 300ms ease-out; respects `prefers-reduced-motion` | Subtle, never bouncy |

**Rules**
- One primary action per screen
- Plain language: say "money help," not "financial assistance disbursement"
- Never show a raw error. Every failure comes with "What happens next."
- WCAG AA contrast, 44px minimum hit targets, full keyboard navigation

---

## 1. Route map

```
/                     → Landing (single CTA: "Get started")
/onboarding/welcome   → Step 0
/onboarding/about     → Step 1  About you
/onboarding/care      → Step 2  Your care
/onboarding/needs     → Step 3  What would help
/onboarding/consent   → Step 4  Permission to help
/onboarding/inbox     → Step 5  Care inbox reveal  → /dashboard
```

All steps share one `OnboardingShell` layout: a progress bar, back button, and "Save & finish later."

---

## 2. Screens

### Step 0: Welcome
```
┌──────────────────────────────────────────────┐
│  apovo                                       │
│                                              │
│   You focus on healing.                      │
│   We'll handle the paperwork.                │
│                                              │
│   Apovo finds support programs, applies      │
│   for you, and keeps following up until      │
│   help arrives.                              │
│                                              │
│   [  Get started  ]     ~2 minutes           │
│                                              │
│   🔒 Demo mode: no real data is sent          │
└──────────────────────────────────────────────┘
```
- Background: a slow-drifting rose and plum gradient "aura"
- A "Use demo patient (Maria G.)" link pre-fills every step (**important for the live demo**)

### Step 1: About you
| Field | Type | Required | Maps to |
|---|---|---|---|
| First and last name | text | ✓ | `patients.first_name`, `last_name` |
| Preferred name | text | | `preferred_name` |
| Date of birth | date | ✓ | `dob` |
| Phone (for programs) | tel | ✓ | `phone` |
| Mailing address | address autocomplete | ✓ | `address_*` |
| Personal email (for notifications only) | email | | `personal_email` |

### Step 2: Your care
| Field | Type | Notes |
|---|---|---|
| Diagnosis | select: Breast cancer (preset) | Fixed for the MVP |
| Stage | chips: 0, I, II, III, IV, Not sure | "Not sure" is fine |
| Treatment status | chips: In treatment, Finished in last 12 mo, Survivor | Drives eligibility |
| Treatment types | multi-chip: Surgery, Chemo, Radiation, Hormone, Immunotherapy | |
| Oncologist name and clinic | text (optional) | If skipped, it becomes a **task** later (good demo moment) |
| Insurance | chips: Private, Medicare, Medicaid, None | |

### Step 3: What would help
A grid of large, illustrated toggle cards (multi-select):

`💵 Bills & rent` · `🚗 Rides to treatment` · `🧹 House cleaning` · `🍲 Meals` · `💇 Wigs & prosthetics` · `🏨 Lodging near treatment` · `💊 Medication costs`

Then:
- **Household size** (stepper)
- **Monthly household income** (range chips, not exact numbers)
- **Employment** status (chips)

> Live hint at the bottom: *"Based on what you've shared, we've already found **3 programs** you may qualify for."* (This updates as she toggles.)

### Step 4: Permission to help (consent)
```
┌──────────────────────────────────────────────┐
│  Before we start, here's what Apovo does     │
│                                              │
│  ✓ Creates a care inbox in your name         │
│  ✓ Fills out applications for you            │
│  ✓ Emails programs and follows up            │
│                                              │
│  ✗ Never submits without your OK             │
│  ✗ Never signs for you                       │
│  ✗ Never shares more than a form needs       │
│                                              │
│  [✓] I authorize Apovo to apply and          │
│      correspond on my behalf.                │
│                                              │
│  Sign with your name: [ Maria Garcia     ]   │
│                                              │
│  [  I agree, let's go  ]                     │
└──────────────────────────────────────────────┘
```
- Stores `consent_at`, `consent_text_version`, `consent_signature`
- The button stays disabled until the box is checked and the typed name matches

### Step 5: Care inbox reveal ⭐
The animated sequence:
1. "Setting up your care inbox…" with a soft pulsing envelope (calls `POST /api/inbox`, which calls AgentMail `inboxes.create`)
2. The address types itself out: **`maria.garcia@agentmail.to`** (or a custom domain)
3. Explainer: *"Programs will email here. Our agents read every message and tell you only what needs you."*
4. Three "found programs" cards slide in with staggered fade-up (Remember Betty, Pink Aid (mock), Clean Home (mock))
5. CTA: **"Start applying for me"**, which goes to `/dashboard?first=1`

---

## 3. Components

| Component | Props | States |
|---|---|---|
| `OnboardingShell` | `step`, `total`, `onBack` | — |
| `ProgressBar` | `value` | animated width |
| `ChipGroup` | `options`, `multi`, `value`, `onChange` | default, selected, focus, disabled |
| `NeedCard` | `icon`, `label`, `selected` | hover lift, selected glow ring |
| `ConsentPanel` | `version`, `onSign` | unsigned, signed |
| `InboxReveal` | `status`, `address` | creating, typing, done, error |
| `DemoFillLink` | — | pre-fills from the `seed/maria.json` fixture |

---

## 4. Data and API

| Call | When | Writes |
|---|---|---|
| `POST /api/patients` | end of Step 1 (draft) | `patients` row, `status='onboarding'` |
| `PATCH /api/patients/:id` | each step | partial profile |
| `POST /api/patients/:id/consent` | Step 4 | consent fields, `events(type='consent_signed')` |
| `POST /api/patients/:id/inbox` | Step 5 | AgentMail inbox, then `patients.care_email`, `agentmail_inbox_id` |
| `POST /api/patients/:id/match` | Step 5 | `applications` rows in state `Matched` |

---

## 5. Edge cases
- **Inbox creation fails:** "We're still setting this up; you can keep going." Retry in the background and show a toast when it's ready.
- **Username taken:** auto-suffix it (`maria.garcia2`)
- **Leaves mid-flow:** the draft is saved; `/onboarding` resumes at the last step
- **Doesn't know stage or income:** always offer "Not sure"; it never blocks progress

---

## 6. Acceptance criteria
- [ ] Demo patient completes onboarding in **≤ 60s** using the demo-fill link
- [ ] Manual completion is possible with keyboard only
- [ ] The care inbox is a real AgentMail inbox (verified by sending a test email)
- [ ] Consent is stored with a timestamp and version and appears as the first event on the timeline
- [ ] 3 matched applications exist when the user lands on the dashboard
