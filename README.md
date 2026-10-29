# Apovo — Care Concierge for Breast Cancer Support

> For the protected, database-free Vercel MVP, follow [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md). The deployed demo uses synthetic information only and must not accept real patient data.

**Apovo** is an AI-powered care navigation and grant application concierge for breast cancer patients. It matches patients with financial assistance, rides to treatment, medication co-pays, home cleaning, and practical aid — preparing complete, reviewable application packets with patient consent, managing communications through dedicated care emails, and following up every step of the way.

---

## Key Highlights

- **Full Care Concierge Suite:**
  - 🏠 **Home Dashboard (`/dashboard`):** Real-time overview of started grants, progress phases, pending question counters, and status badges.
  - 📂 **My Resource Catalog (`/resources`):** Curated directory across 5 categories with transparent, non-blocking eligibility evaluations.
  - 💬 **Talk with Apovo (`/talk`):** Conversational care companion answering questions about assistance programs, clinical terminology, and next steps.
  - ✉️ **Care Email (`/inbox`):** Dedicated `@agentmail.to` inbox separating medical grant correspondence from personal email, featuring AI drafts and human-in-the-loop review.
  - 📋 **Pending Items (`/tasks`):** Centralized action hub collecting needed documents, questions, and approvals across all active applications and emails.
- **Non-Blocking & Transparent Eligibility:** Published eligibility criteria are evaluated transparently, but users are **never blocked** from applying with Apovo.
- **Autonomous Application Agent:**
  - Automated cloud browser discovery (powered by **Browserbase** & **Stagehand**) to find official assistance pages and current application forms.
  - Automated PDF packet preparation (**pdf-lib**) combining filled applications, diagnosis verification letters, and patient personal notes into an 8-page foundation-compliant packet.
  - Strict human-in-the-loop approval: applications are never submitted without explicit patient review.
- **Clinical Persona Switcher:** Built-in instant switching between realistic patient personas (e.g. IDC with transportation needs, Stage II with co-pay needs, remission with home cleaning needs) for rapid testing.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) | Modern React server components, partial prefetching, route handlers |
| **UI & Styling** | React 19, CSS modules / styled-jsx, [Lucide React](https://lucide.dev/) | Minimalist, warm editorial care navigation interface |
| **Conversational AI** | [@google/adk](https://github.com/google/adk-js) & [Gemini 3.7 Flash](https://ai.google.dev/) | Empathetic Care Concierge agent with tool integration for real-time patient profile and catalog lookup |
| **Cloud Browser** | [@browserbasehq/sdk](https://www.browserbase.com/) & [@browserbasehq/stagehand](https://stagehand.dev/) | Cloud browser automation and AI extraction for official grant forms |
| **Email Infrastructure** | [AgentMail](https://agentmail.to/) | Dedicated, HIPAA-conscious patient care inbox provisioning & webhooks |
| **PDF Processing** | [pdf-lib](https://pdf-lib.js.org/) & [pdfjs-dist](https://mozilla.github.io/pdf.js/) | Form inspection, SHA-256 template validation, form-field population, and multi-document packet merging |
| **Validation** | [Zod 4](https://zod.dev/) | Runtime schema validation for links and form payloads |
| **Testing** | Node.js Test Runner (`node:test`) + TypeScript | 62 automated unit and integration tests |

---

## Resource Catalog

Apovo features curated assistance programs mapped to the 7 key health-related social needs (HRSNs):

1. **Remember Betty Foundation** (`Financial`): Direct grants for everyday living expenses (housing, utilities, groceries, food).
2. **Hope Oncology Copay Assistance Fund** (`Financial`): Up to $5,000/year for prescription co-pays and oncology medications.
3. **Regional Transit Care Assistance** (`Transport`): Prepaid transit vouchers and rideshare credits to treatment appointments.
4. **Cleaning For A Reason / Home Care** (`Cleaning`): Complimentary residential cleaning sessions during active treatment and recovery.
5. **Pink Aid Emergency Assistance** (`Wellness`): Emergency grants up to $600 for comfort items, wigs, garments, and urgent relief.

---

## Project Structure

```
├── src/
│   ├── app/                               # Next.js App Router routes & APIs
│   │   ├── page.tsx                       # Root redirect (307 -> /dashboard)
│   │   ├── dashboard/page.tsx             # Home Dashboard (Started Grants & Status)
│   │   ├── resources/page.tsx             # Resource Catalog & Eligibility Grid
│   │   ├── inbox/page.tsx                 # Dedicated Care Email & Thread Viewer
│   │   ├── inbox/[threadId]/page.tsx      # Deep link thread redirect
│   │   ├── tasks/page.tsx                 # Unified Pending Action Items
│   │   ├── talk/page.tsx                  # Talk with Apovo (Care Companion)
│   │   ├── onboarding/page.tsx            # Patient Care Profile Onboarding Flow
│   │   ├── applications/[id]/workspace/   # Real-Time Application Agent Workspace
│   │   ├── api/
│   │   │   ├── applications/              # Application creation & run management
│   │   │   ├── application-runs/          # Events, inputs, uploads, resume, stop
│   │   │   ├── patients/                  # Patient profile, consent, and presets
│   │   │   ├── dashboard/                 # Aggregate stats and started grants summary
│   │   │   ├── inbox/                     # Thread messages and AI draft review
│   │   │   └── webhooks/agentmail/        # Svix-verified email webhook handling
│   ├── components/
│   │   ├── dashboard/                     # AppShell, StartedGrantsHome, Persona Switcher
│   │   ├── inbox/                         # CareInboxView, ThreadList, MessageView, DraftReview
│   │   ├── tasks/                         # PendingItemsView, UnifiedTaskCard
│   │   ├── talk/                          # TalkWithApovoView, ChatInterface
│   │   ├── application-agent/             # Workspace, ActivityRail, LiveBrowserPanel, PDF Preview
│   │   └── onboarding/                    # Step components, ConsentPanel, NeedCards
│   └── lib/
│       ├── application-agent/             # State machine, run repository, background worker
│       │   └── phases/                    # Discovery, download, inspection, field-mapping
│       ├── integrations/
│       │   ├── agentmail/                 # Care inbox provisioning, drafts, client
│       │   └── browserbase/               # Cloud browser session manager & downloads
│       ├── pdf/                           # Template registry, form filling, packet assembly
│       ├── curated-programs.ts            # Expanded programs & eligibility rules
│       ├── resource-catalog.ts            # Catalog aggregation & filtering
│       ├── remember-betty.ts              # Remember Betty eligibility heuristics
│       └── store.ts                       # Persistent database store & patient manager
├── tests/                                 # Unit & integration test suite (57 tests)
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js**: v20 or higher
- **npm** (or `pnpm` / `yarn`)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd mvp-apovo-v1a
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Required environment variables:

```env
# AgentMail Credentials
AGENTMAIL_API_KEY=your_agentmail_api_key
AGENTMAIL_INBOX_ID=your_inbox_id@agentmail.to

# Browserbase Cloud Browser Credentials
BROWSERBASE_API_KEY=your_browserbase_api_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id

# Google Gemini API Credentials (powered by Google ADK)
GEMINI_API_KEY=your_gemini_api_key

# Public URL (for callbacks & webhooks)
APP_BASE_URL=http://localhost:3000

# Enables the visible synthetic Remember Betty test switch
APOVO_APPLICATION_TEST_MODE=1
```

### 3. Development Server

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. It will automatically route to the Home dashboard at `/dashboard`.

---

## Testing & Quality Assurance

### Run Automated Tests

Execute the comprehensive test suite (covers state machines, browser discovery, PDF packet assembly, AgentMail client and draft workflows, Svix webhook signature validation, and catalog filtering):

```bash
npm run test
```

*The offline tests run without external service dependencies.*

### Run the Guarded Live Email Test

This one-shot test uses Gemini to write an email to **nicole.wu.mail@gmail.com only**, attaches two synthetic PDFs, and verifies the bytes stored by AgentMail. It never uses the Remember Betty contact, patient documents, or normal application/follow-up routes.

Start the development server with the test route explicitly enabled, then run the caller exactly once in another terminal:

```bash
APOVO_EMAIL_TEST_MODE=1 npm run dev
npm run test:email:live
```

The route also requires the fixed confirmation `SEND_TO_NICOLE`. Do not retry automatically after an error or timeout: AgentMail may already have accepted the message. The command prints the Gemini content, AgentMail IDs, and attachment hashes. AgentMail acceptance does not establish Gmail receipt; Nicole must manually confirm that the email arrived and both PDFs open.

### Run the Remember Betty End-to-End Test

Start the app with `APOVO_APPLICATION_TEST_MODE=1`, then turn on **Test mode** in the top header and select **Apply with Apovo** for Remember Betty. The run opens the real Browserbase workflow, downloads the current official PDF, fills it only with the built-in fake applicant, generates synthetic supporting documents, and automatically sends one combined test-only PDF to **nicole.wu.mail@gmail.com**.

This mode never reads patient profile answers or uploads, never creates a signature, and never sends to the foundation. It sends from the server-configured `AGENTMAIL_INBOX_ID`. If delivery becomes uncertain, the run stops for manual reconciliation instead of retrying.

### Build for Production

Verify production bundling and static prerendering:

```bash
npm run build
```

---

## Key Navigation & Workflows

### 1. Home Dashboard (`/dashboard`)
- View active and submitted applications cards.
- Track real-time progress phases (e.g. *Launching browser*, *Inspecting PDF*, *Questions pending*, *Ready for review*).
- Click into any card to resume or inspect the application workspace.

### 2. Exploring & Applying for Resources (`/resources`)
- Explore all 5 curated programs.
- Filter by category (`Financial`, `Transport`, `Cleaning`, `Wellness`) or by eligibility status (`All`, `Eligible`, `Not eligible`, `Needs information`).
- Click **"Apply with Apovo"** on any card — applications are never blocked by eligibility assessments.

### 3. Care Email (`/inbox`)
- View communications received at your dedicated `@agentmail.to` care address.
- Review and approve AI-generated draft replies before they are transmitted.

### 4. Pending Items (`/tasks`)
- Actionable checklist of all unanswered application questions, doctor notes to upload, and drafts requiring approval.

### 5. Talk with Apovo (`/talk`)
- Conversational assistant for breast cancer guidance, grant questions, and treatment logistics.
- Powered by **Google Agent Development Kit (`@google/adk`)** and **Gemini 3.7 Flash** with custom function tools:
  - `get_active_patient_profile`: Live access to the active diagnosis, treatment stage, and selected needs.
  - `get_started_grants`: Live access to active grant applications and phase statuses.
  - `get_grant_catalog`: Real-time query of the curated assistance catalog and personalized eligibility requirements.
  - `get_pending_questions`: Retrieval of open questions needing patient answers.
- Intelligent fallback mode ensures compassionate concierge responses even if the Gemini API key is offline or unconfigured.

### 6. Testing Clinical Personas
In the sidebar footer under **"Active care profile"**, use the **"Switch Test Profile"** dropdown to switch between realistic clinical personas:
- **Jane Doe:** Breast cancer patient requesting help with bills and groceries.
- **Maria Santos:** Invasive Ductal Carcinoma (IDC) patient in need of transportation to appointments.
- **Brenda Jackson:** Stage II breast cancer patient in need of prescription co-pay relief.
- **Sarah Lin:** Breast cancer survivor in remission requesting home cleaning assistance.
- **Reset to fresh profile:** Clear current patient context to test from scratch.

### 7. Application Preparation Workspace Lifecycle
When an application is started:
1. **Agent Discovery:** The worker opens a secure session in Browserbase, locates the current official PDF form, downloads it, and validates its cryptographic hash against reviewed templates.
2. **Dedicated Email:** Automatically confirms a dedicated `@agentmail.to` care email address.
3. **Information Collection:** Collects required fields (e.g. SSN last 4, monthly income, active treatment status).
4. **Packet Assembly:** Merges the filled application, verified diagnosis letter, and personal note into an 8-page foundation-compliant packet.
5. **Review & Approval:** The patient previews the complete PDF packet before any submission is initiated.

---

## Tips & Troubleshooting

- **Root & Tab Navigation:** Root `/` redirects to `/dashboard` via static redirects in [`next.config.ts`](file:///Users/aniket/Desktop/UT%20AUSTIN/Building%20LLMs/mvp-apovo-v1a/next.config.ts) to adhere to Next.js 16 instant navigation rules. Both **Home** (`/dashboard`) and **Resources** (`/resources`) operate independently as dedicated tabs.
- **Switching Personas / Resetting State:** You can switch clinical test personas or click the **"Clear data"** button at the bottom of the sidebar to immediately wipe all applications, tasks, emails, and generated PDF artifacts. You can also trigger a clean state programmatically via `POST /api/data/clear`. State is persisted locally in `.data/db.json` and generated PDF artifacts are stored in `.data/artifacts/`.
- **Port In Use (3000):** If port 3000 is occupied by a background process, release it with:
  ```bash
  lsof -ti :3000 | xargs kill -9
  ```

---

## License

Private and proprietary. Developed for the Apovo Care Navigation initiative.
