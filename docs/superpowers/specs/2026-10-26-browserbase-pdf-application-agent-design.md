# Design and Specification: Browserbase PDF Application Agent

Date: 2026-10-26  
Status: Proposed  
Target: Localhost-first MVP

## Objective

Enable a patient to click **Apply with Apovo** on the Remember Betty resource card and enter a live application workspace where they can watch an agent inspect the official website, find and download the current application PDF, assemble a complete draft packet, and request missing information as needed.

The workflow ends when Apovo produces a patient-reviewed, downloadable PDF packet. It does not fax, mail, email, or otherwise submit the packet.

Success means the patient can understand what the agent is doing, see the real Browserbase session, answer questions without losing progress, review the exact resulting packet, personally apply their signature, and download the final artifact.

## Approved Capability Map

| Module | Responsibility | Depends on |
|---|---|---|
| `automation-run` | Durable run state, Browserbase session, Stagehand navigation, activity events, recovery and cleanup | — |
| `live-workspace` | Back button, left-side narration, right-side Browserbase live view, reconnect/error states | `automation-run` |
| `pdf-packet` | Secure PDF download, validation, extraction, field mapping, filling, storage and rendering | `automation-run` |
| `patient-input` | Missing-field questions, supporting-document uploads, confirmed medical-email mapping, pause/resume | `pdf-packet` |
| `packet-review` | Final preview, completeness checks, patient-applied signature and downloadable packet; no submission | `pdf-packet`, `patient-input` |

Build order:

```text
automation-run → live-workspace + pdf-packet → patient-input → packet-review
```

## Assumptions

1. The first version runs on localhost in one long-lived Node.js process.
2. Local JSON metadata and private files under `.data/` are acceptable for this MVP; they are not a production deployment design.
3. Browserbase and AgentMail credentials are configured server-side in `.env.local`.
4. The current Remember Betty workflow remains a website linking to a PDF rather than an online form.
5. The patient has already consented to application preparation.
6. A real AgentMail inbox must be confirmed before its address is inserted. The system must never manufacture an email address.
7. “Complete packet” includes the application, diagnosis letter, personal note, and a patient-applied signature, while remaining within the foundation's current eight-page limit.

## Goals

- Replace the disabled **Apply with Apovo** button with a real, observable workflow.
- Display a real Browserbase Live View, not a screenshot or fabricated browser.
- Show short, plain-language agent activity messages in chronological order.
- Discover the current application link from the official foundation page rather than trusting a permanently hard-coded PDF URL.
- Download, validate, checksum, and privately persist the application PDF.
- Fill known fields from the approved patient profile and confirmed medical email.
- Ask only for information or documents that are missing, stale, sensitive, or require explicit confirmation.
- Pause and resume safely across page reloads and Browserbase-session changes.
- Produce a final patient-reviewed PDF packet for download.

## Non-goals

- Fax, postal mail, email, or web submission.
- Automatic application approval or promises about grant acceptance.
- Agent-generated or reused applicant signatures.
- Automatic inference of SSN digits, income, diagnosis dates, or other sensitive unknown values.
- Supporting arbitrary grants in the first implementation.
- Multi-user, multi-instance, or serverless production durability.
- A general-purpose PDF editor.

## Anti-goals

- Never mark the application `Submitted` merely because a PDF was generated.
- Never silently fall back to simulated Browserbase sessions, fake email addresses, placeholder answers, or synthetic success events.
- Never expose Browserbase API keys, AgentMail credentials, filesystem paths, or private artifact URLs to the client.
- Never allow website content to redirect the agent outside the approved host allowlist.
- Never log medical data, SSN digits, uploaded documents, signature images, or live-view URLs.

## Approaches Considered

### A. One long-running API request

The client would call one route that launches Browserbase and remains connected until the PDF is ready.

Advantages: smaller initial implementation and immediate streaming.  
Rejected because: patient questions, document uploads, browser timeouts, and page reloads can outlive the request and lose progress.

### B. Durable resumable state machine — selected

The start route creates a persisted run and returns immediately. A local worker advances deterministic phases, records events, and pauses when patient action is required. The workspace polls persisted state and can resume a paused or interrupted phase.

Advantages: observable, recoverable, testable, and compatible with patient-in-the-loop PDF completion.  
Tradeoff: more state modeling and cleanup logic.

### C. Fill the PDF inside the Browserbase browser

The agent would use a browser PDF viewer or third-party online PDF editor.

Rejected because: Browserbase/Stagehand is appropriate for discovery and download, not reliable PDF mutation. Uploading patient documents to an unapproved web editor would also create an unacceptable privacy boundary.

## User Experience

### Entry

1. The Remember Betty card shows **Apply Manually** and **Apply with Apovo**.
2. **Apply with Apovo** creates or resumes the active run and navigates to:

```text
/applications/{applicationId}/workspace
```

3. If Browserbase or AgentMail configuration is missing, the workspace shows a specific configuration error and does not create a fake run.

### Workspace layout

- A top bar contains a Back button, grant name, run status, and a Stop action.
- The page body uses a two-column layout:
  - Left column: approximately 30%, with activity narration, progress, and the active patient question.
  - Right column: approximately 70%, with the Browserbase Live View while web discovery is active.
- On narrow screens the columns stack, with activity/questions above the live view.
- The live view is read-only by default. Patient takeover is outside this MVP.
- After the browser discovery phase ends, the right panel changes from Live View to the PDF preview without discarding the activity history.

### Activity narration

Messages describe observable actions, for example:

- “Opening the official Remember Betty assistance page.”
- “Found the current application PDF.”
- “Downloading and checking the three-page form.”
- “I need your current monthly household income before I can finish this field.”

Messages must not expose raw prompts, chain-of-thought, SSN digits, medical-document text, internal errors, or secrets.

### Questions and uploads

- The worker records all missing requirements it can identify, then pauses at `waiting_for_patient`.
- The left panel displays one question at a time while preserving the Browserbase/PDF panel.
- Supported first-release input types:
  - text;
  - date;
  - yes/no or single choice;
  - last four SSN digits with masked rendering;
  - file upload for the diagnosis letter;
  - personal-note editor with an optional agent draft and mandatory patient review;
  - signature pad or direct patient signature control.
- Answers are validated server-side, persisted, and used only after the patient submits them.
- The run resumes from the next incomplete field rather than restarting discovery.

### Completion

- The final panel shows the exact assembled packet and a checklist:
  - current application version recognized;
  - required fields complete;
  - diagnosis letter present;
  - personal note reviewed;
  - patient signature applied;
  - packet is eight pages or fewer.
- The patient confirms the preview and downloads the PDF.
- Application state becomes `PacketReady`, not `Submitted`.

## Workflow State Model

```text
created
  → launching_browser
  → inspecting_site
  → downloading_pdf
  → inspecting_pdf
  → provisioning_care_email? 
  → mapping_fields
  → waiting_for_patient?
  → filling_pdf
  → assembling_packet
  → awaiting_patient_review
  → applying_patient_signature
  → packet_ready
```

Terminal or exceptional states:

```text
failed | stopped | needs_manual_review
```

Rules:

- Each phase writes its result before the next phase starts.
- A phase may be retried only when its previous side effects are known and idempotent.
- A changed or unrecognized PDF checksum transitions to `needs_manual_review` rather than attempting coordinate-based filling.
- `waiting_for_patient` keeps the run resumable without keeping a Browserbase session alive indefinitely.
- Browserbase closes after website discovery and download; it is not kept open while waiting hours for patient input.
- Restarting the localhost server may require the user to click Resume, but completed phases and artifacts remain persisted.

## Data Model

### Application run

```ts
interface ApplicationRun {
  id: string
  application_id: string
  patient_id: string
  state: RunState
  current_phase: RunPhase
  browserbase_session_id?: string
  live_view_url?: string
  source_url: string
  discovered_application_url?: string
  source_pdf_artifact_id?: string
  draft_pdf_artifact_id?: string
  final_packet_artifact_id?: string
  error_code?: string
  error_message?: string
  created_at: string
  updated_at: string
}
```

The live-view URL is persisted only while the session is active, is never returned outside an authorized run response, and is cleared when the session ends.

### Activity event

```ts
interface RunEvent {
  id: string
  run_id: string
  sequence: number
  kind: 'status' | 'action' | 'question' | 'warning' | 'error' | 'complete'
  public_message: string
  created_at: string
}
```

### Artifact

```ts
interface ApplicationArtifact {
  id: string
  run_id: string
  kind: 'source_pdf' | 'diagnosis_letter' | 'personal_note' | 'draft_pdf' | 'final_packet'
  private_path: string
  mime_type: 'application/pdf'
  sha256: string
  byte_size: number
  page_count: number
  created_at: string
}
```

Artifact bytes live under a non-public `.data/artifacts/` directory. Client downloads go through an authenticated Route Handler and use opaque artifact IDs.

### Required input

```ts
interface RequiredInput {
  id: string
  run_id: string
  field_key: string
  input_type: 'text' | 'date' | 'choice' | 'sensitive_text' | 'file' | 'personal_note' | 'signature'
  prompt: string
  reason: string
  status: 'open' | 'answered' | 'invalidated'
  answer_encrypted_or_private?: unknown
  created_at: string
  answered_at?: string
}
```

The localhost JSON store may persist non-sensitive metadata. Sensitive answers and documents must be isolated from logs and UI event text. Production migration must replace this storage with a shared encrypted database and private object storage.

## Browserbase and Stagehand Design

### Session creation

- Install Stagehand v4 and its compatible Zod version.
- Launch Browserbase only on the server with `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`.
- Store only opaque application/run IDs in Browserbase metadata.
- Use a fixed US region and explicit session timeout.
- Retrieve the official Live View URL through the Browserbase SDK; never construct it manually.
- Disable session replay/logging for patient-data runs where supported by the configured Browserbase plan and SDK.

### Navigation and extraction

- Begin only at `https://www.rememberbetty.com/apply-for-assistance`.
- Stagehand extracts the application link and visible label.
- Deterministic code resolves and validates the URL against:
  - `rememberbetty.com`;
  - `www.rememberbetty.com`;
  - `static1.squarespace.com`.
- The result must be HTTPS and end in `.pdf`. Any different format or host stops the run for review.
- Page content is untrusted and cannot redefine the task, allowed hosts, storage destination, or workflow policy.

### Download

- Opening the validated PDF URL triggers the Browserbase download.
- The server polls the Browserbase Downloads API for exactly one PDF associated with the run session.
- The file is rejected if MIME type, PDF magic bytes, configured size limit, or page-count validation fails.
- The server calculates SHA-256 and stores the source PDF as a private artifact.
- Browserbase and Stagehand resources close in `finally` on success, stop, and failure.

## PDF Packet Design

### Inspection

1. Parse document metadata and page count.
2. Extract page text for requirement detection.
3. Inspect AcroForm fields.
4. Compare the checksum with a reviewed Remember Betty template registry.
5. If the form is fillable, map AcroForm field names.
6. If it is not fillable, use a reviewed coordinate map keyed to the exact checksum.
7. If the checksum is unknown, stop at `needs_manual_review` rather than guessing coordinates.

### Field sources

| Field category | Source policy |
|---|---|
| Legal name, address, DOB, phone | Approved patient profile |
| Email | Confirmed AgentMail `care_email` only |
| Diagnosis details/date | Verified profile or explicit patient answer |
| Monthly income and employment | Explicit current patient confirmation |
| Treatment questions | Explicit current patient confirmation when not recently verified |
| Last four SSN digits | Always ask; mask everywhere after entry |
| Diagnosis letter | Patient upload; validate PDF and page count |
| Personal note | Patient-authored or agent-drafted, always patient-reviewed |
| Signature | Direct patient action after final preview; never agent generated |

### AgentMail requirement

- If both `care_email` and `agentmail_inbox_id` are present, the PDF workflow may use the confirmed address.
- If either is absent, the run invokes the real AgentMail provisioning route and pauses until a confirmed API response is stored.
- Missing credentials, API errors, or incomplete responses pause the run with a configuration/error message. There is no fallback address.
- The medical email is a form-field identity only in this workflow; the application packet is not emailed.

### Assembly

- Fill a copy of the source application.
- Render a draft preview before signature.
- Append the diagnosis letter and reviewed personal note.
- Reject unsupported, corrupt, password-protected, or oversized uploads.
- Enforce the foundation's eight-page maximum after assembly.
- Apply the patient-provided signature only after the patient confirms the exact unsigned packet.
- Generate a new checksum after signing and expose only the final artifact for download.

## API and Route Boundaries

Proposed Route Handlers:

```text
POST /api/applications/[id]/runs
GET  /api/application-runs/[runId]
POST /api/application-runs/[runId]/resume
POST /api/application-runs/[runId]/stop
GET  /api/application-runs/[runId]/events?after={sequence}
GET  /api/application-runs/[runId]/inputs
POST /api/application-runs/[runId]/inputs/[inputId]
POST /api/application-runs/[runId]/uploads
POST /api/application-runs/[runId]/review
POST /api/application-runs/[runId]/signature
GET  /api/application-runs/[runId]/artifacts/[artifactId]
```

All routes validate that the run belongs to the active patient. The current localhost app has no real authentication; production work must add authentication before deployment.

The start route returns quickly:

```json
{
  "runId": "run_...",
  "state": "created",
  "workspaceUrl": "/applications/app_.../workspace"
}
```

Polling is selected for the localhost MVP:

- Run state and events: every 750–1000 ms while active.
- Inputs: refresh when state becomes `waiting_for_patient`.
- Stop polling at terminal states.
- Server-sent events may replace polling later without changing the persisted event model.

## Local Worker Design

- A server-only singleton owns an in-memory work queue.
- Run records and phase outputs are persisted before work is enqueued.
- `POST /runs` and `POST /resume` are idempotent for an already active run.
- A per-run lock prevents two workers from advancing the same run.
- On localhost startup, incomplete runs are not advanced automatically; the UI offers Resume.
- Phase handlers accept persisted input and return persisted output, allowing deterministic unit tests.
- This worker is explicitly unsuitable for serverless or multi-instance deployment. Production migration replaces it with a shared database and durable job runner.

## Error Handling

| Condition | Behavior |
|---|---|
| Browserbase credentials missing | Fail configuration check; no session created |
| Browserbase capacity or launch failure | Set retryable error; preserve run |
| Live View expires | Keep activity visible; offer reconnect/resume if the phase is incomplete |
| Application link missing or host invalid | Stop at `needs_manual_review` |
| More than one PDF download | Stop at `needs_manual_review` |
| PDF checksum changed | Save source artifact, do not fill, require template review |
| AgentMail unavailable | Pause; do not invent an address |
| Required patient answer missing | Create input and pause |
| Upload invalid | Reject only that answer and explain corrective action |
| Packet exceeds eight pages | Block completion and identify which attachment causes overflow |
| Browser/session closes while waiting | Continue from persisted PDF phase; do not restart completed discovery |
| User presses Stop | Abort active work, close external resources, persist `stopped` |

## Security and Privacy Boundaries

### Always

- Keep provider credentials server-only.
- Use opaque IDs in Browserbase metadata.
- Validate URLs, file types, file sizes, magic bytes, checksums, and page counts.
- Mask SSN digits and exclude sensitive answers from public run events.
- Serve artifacts through authorized, non-cacheable routes.
- Close Browserbase and Stagehand resources on every exit path.
- Use synthetic patient data until vendor agreements and data-handling settings are approved.

### Ask first

- Enabling Browserbase recording or replay for real patient sessions.
- Moving from localhost files to cloud object storage or a hosted database.
- Adding fax, mail, or email delivery.
- Supporting grants beyond Remember Betty.
- Allowing interactive takeover of the Browserbase session.

### Never

- Put API keys or live-view URLs in client logs.
- Upload documents to an unapproved online PDF editor.
- Generate or reuse the patient's signature.
- Infer missing sensitive answers.
- Mark the application submitted.
- Automatically retry an irreversible external action.

## Tech Stack

- Next.js 16.4.3 App Router and Route Handlers.
- React 19.3 client workspace.
- Node.js 24.16.0 on localhost.
- Existing `@browserbasehq/sdk` for session debugging/Live View and downloads.
- Stagehand v4 for website understanding and resilient link extraction.
- Zod 4.4.x for extraction schemas and request validation.
- A PDF library capable of AcroForm filling, page assembly, and rendering support; exact package selection occurs in implementation planning after inspecting the current PDF structure.
- Existing local `.data/db.json` plus private `.data/artifacts/` for the localhost MVP.

## Project Structure

```text
src/app/applications/[id]/workspace/       Interactive agent workspace
src/app/api/application-runs/              Run, event, input, upload, review, signature, artifact routes
src/app/api/applications/[id]/runs/        Create/resume entry point
src/components/application-agent/          Workspace, activity rail, live view, questions, PDF preview
src/lib/application-agent/                 State machine, worker, policies and phase handlers
src/lib/integrations/browserbase/           Browserbase/Stagehand server client
src/lib/integrations/agentmail/             Confirmed inbox provisioning adapter
src/lib/pdf/                                Inspection, mapping, filling, assembly, rendering
src/lib/artifacts/                          Private local artifact store
.data/artifacts/                            Ignored local artifact bytes
tests/application-agent/                    State-machine and policy unit tests
tests/integration/                          Route/integration tests with provider fakes
```

## Code Style

Use explicit phase inputs and typed results rather than mutating application state throughout provider code:

```ts
export async function discoverApplicationPdf(
  context: RunContext,
): Promise<PhaseResult<'downloading_pdf'>> {
  const candidate = await context.stagehand.extract(applicationLinkSchema)
  const url = validateRememberBettyApplicationUrl(candidate.href)

  await context.events.append('action', 'Found the current application PDF.')

  return {
    nextPhase: 'downloading_pdf',
    output: { applicationUrl: url.toString() },
  }
}
```

Provider adapters return data; the orchestration layer owns state transitions. Public messages are written explicitly and never derived from raw exceptions or model reasoning.

## Commands

Current commands:

```bash
npm run dev
npm run lint
npm run build
```

Commands to add during implementation:

```bash
npm run test
npm run test:integration
```

## Testing Strategy

### Unit tests

- Run-state transition table, including invalid transitions.
- URL and host allowlist enforcement.
- PDF MIME/magic-byte/size/page-count validation.
- Template checksum matching and unknown-template refusal.
- Field-source policies, including mandatory questions for sensitive fields.
- Page-limit and required-document completeness checks.
- Redaction of public events and API responses.
- Idempotent start, resume, and stop behavior.

### Integration tests

- Fake Browserbase/Stagehand adapter discovers one allowed PDF and produces one artifact.
- Invalid or changed links transition to manual review.
- Download timeout and session failure close resources.
- AgentMail success stores the real inbox ID and address; failure produces no fallback.
- Patient answers resume the run at the correct phase.
- Diagnosis letter, personal note, and signature assemble into a packet of eight pages or fewer.
- Artifact route rejects a run belonging to another patient ID.

### Manual localhost verification

1. Click **Apply with Apovo** and enter the workspace.
2. Confirm the left activity rail and real right-side Live View update together.
3. Confirm the official application PDF is discovered and downloaded.
4. Confirm Browserbase closes after download.
5. Answer a missing field and reload the page before continuing.
6. Upload a synthetic diagnosis letter and review a synthetic personal note.
7. Review the unsigned packet and apply a synthetic patient signature.
8. Confirm the final packet is downloadable, complete, no more than eight pages, and never marked submitted.

## Success Criteria

- **Apply with Apovo** starts or resumes one persisted run for the application.
- The workspace displays a Back button, agent narration on the left, and a real Browserbase Live View on the right during discovery.
- Stagehand starts at the official assistance page and accepts a PDF only from the configured host allowlist.
- Exactly one validated source PDF is stored with checksum, size, and page count.
- Known non-sensitive fields are populated from the patient profile.
- A confirmed AgentMail address is used for the form's email field; no address is fabricated.
- Missing or sensitive fields generate patient questions and pause the run without losing completed work.
- The final packet includes all required documents, a direct patient-applied signature, and no more than eight pages.
- The patient can preview and download the final packet.
- The application state is `PacketReady`; no route sends or submits it.
- Provider errors are visible and recoverable without fake success states.
- `npm run lint`, unit tests, integration tests, and `npm run build` pass.

## Open Questions

No product-blocking questions remain for the localhost MVP. Implementation planning must still inspect the current PDF to choose between AcroForm filling and an exact-checksum coordinate template, and must select the smallest PDF dependency set that supports that verified structure.

## Production Follow-up

Before deployment beyond localhost:

- add real authentication and authorization;
- replace JSON/filesystem storage with an encrypted shared database and private object storage;
- replace the local worker with a durable queue/worker;
- complete Browserbase, Stagehand, AgentMail, and model-provider healthcare/security review;
- define artifact retention and deletion policies;
- add audit logging that contains identifiers and state changes but no document content;
- decide whether Browserbase Live View and recording are permitted for real patient data.
