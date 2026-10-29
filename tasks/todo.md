# Task Checklist: Browserbase PDF Application Agent

Approved spec: `docs/superpowers/specs/2026-10-26-browserbase-pdf-application-agent-design.md`  
Approved plan: `tasks/plan.md`

Rules for execution:

- Complete tasks in dependency order unless the plan explicitly permits parallel work.
- Use synthetic patient data for every provider and PDF test.
- Keep each task to approximately five files or fewer.
- Run the task-specific verification before checking the task off.
- Never add a simulated success fallback.
- Stop for review before enabling real patient data.

## Phase 0 — Foundation

- [x] **T01 — Add test and integration dependencies** *(complete: Stagehand/Zod, Node TypeScript test harness, `pdf-lib`, `pdfjs-dist` (dev), and `playwright-core` installed; Vitest not needed)*
  - Depends on: —
  - Files:
    - `package.json`
    - `package-lock.json`
    - `vitest.config.ts`
    - `tests/setup.ts`
  - Work:
    - Add Stagehand v4, compatible Zod 4.4.x, `pdf-lib`, and Vitest.
    - Add `test` and `test:integration` scripts.
    - Configure the Node test environment and `@/` alias.
  - Acceptance:
    - An empty smoke test can run without loading provider credentials.
    - Stagehand and PDF packages are server dependencies only.
  - Verify:
    - `npm run test`
    - `npm run lint`
    - `npm run build`

- [x] **T02 — Define run-domain contracts and error codes**
  - Depends on: T01
  - Files:
    - `src/lib/application-agent/types.ts`
    - `src/lib/application-agent/errors.ts`
    - `src/lib/types.ts`
    - `tests/application-agent/types.test.ts`
  - Work:
    - Define run phases, run states, public event kinds, artifacts, required inputs, and typed public errors.
    - Add `PacketReady` to `ApplicationState`.
    - Define valid terminal and resumable states without implementing transitions yet.
  - Acceptance:
    - Contracts represent every state in the approved workflow.
    - Public errors contain a safe code/message and never raw provider data.
  - Verify:
    - `npm run test -- tests/application-agent/types.test.ts`
    - `npm run build`

- [x] **T03 — Implement and test the transition policy**
  - Depends on: T02
  - Files:
    - `src/lib/application-agent/state-machine.ts`
    - `tests/application-agent/state-machine.test.ts`
  - Work:
    - Encode allowed transitions and phase ordering.
    - Encode stop, failure, waiting, manual-review, resume, and packet-ready rules.
  - Acceptance:
    - Every approved transition succeeds.
    - Skips, backwards transitions, and post-terminal transitions fail deterministically.
    - No transition reaches `Submitted`.
  - Verify:
    - `npm run test -- tests/application-agent/state-machine.test.ts`

## Phase 1 — Durable local run state

- [x] **T04 — Migrate local database state for runs**
  - Depends on: T02
  - Files:
    - `src/lib/store.ts`
    - `src/lib/application-agent/run-repository.ts`
    - `tests/application-agent/run-repository.test.ts`
  - Work:
    - Add a versioned migration that preserves the active patient and Remember Betty application.
    - Persist runs, events, artifacts, and required-input metadata.
    - Serialize writes so concurrent localhost operations cannot overwrite each other.
  - Acceptance:
    - Existing patient/resource state survives migration.
    - Persisted runs survive repository re-instantiation.
    - Event sequence numbers are unique and ordered per run.
  - Verify:
    - `npm run test -- tests/application-agent/run-repository.test.ts`
    - `npm run build`

- [x] **T05 — Add private local artifact storage**
  - Depends on: T02
  - Files:
    - `.gitignore`
    - `src/lib/artifacts/local-artifact-store.ts`
    - `src/lib/artifacts/types.ts`
    - `tests/application-agent/local-artifact-store.test.ts`
  - Work:
    - Store artifact bytes under `.data/artifacts/` using opaque IDs.
    - Calculate SHA-256, byte size, MIME type, and page metadata.
    - Prevent path traversal and filename-controlled paths.
  - Acceptance:
    - Artifact bytes never appear under `public/`.
    - Reads require an opaque ID and repository ownership check.
    - `.data/artifacts/` is ignored by Git.
  - Verify:
    - `npm run test -- tests/application-agent/local-artifact-store.test.ts`

- [x] **T06 — Implement local worker locking and phase dispatch**
  - Depends on: T03, T04
  - Files:
    - `src/lib/application-agent/worker.ts`
    - `src/lib/application-agent/phases/index.ts`
    - `tests/application-agent/worker.test.ts`
  - Work:
    - Add one in-memory lock per run.
    - Persist phase start and completion around every handler.
    - Support explicit start, resume, and stop.
    - Use deterministic fake phase handlers in tests.
  - Acceptance:
    - Two resume calls cannot execute the same phase twice.
    - A stopped run cannot continue.
    - Process recreation leaves the run resumable from the last persisted checkpoint.
  - Verify:
    - `npm run test -- tests/application-agent/worker.test.ts`

- [x] **T07 — Add run creation and read APIs**
  - Depends on: T04, T06
  - Files:
    - `src/app/api/applications/[id]/runs/route.ts`
    - `src/app/api/application-runs/[runId]/route.ts`
    - `tests/integration/application-runs-create.test.ts`
  - Work:
    - Add create-or-return-active-run semantics.
    - Validate active patient ownership and Remember Betty application ID.
    - Return a workspace URL without returning secrets.
  - Acceptance:
    - Repeated start requests return one active run.
    - Another patient's run is not readable.
    - Missing application/profile returns a specific non-2xx response.
  - Verify:
    - `npm run test:integration -- tests/integration/application-runs-create.test.ts`

- [x] **T08 — Add events, resume, and stop APIs**
  - Depends on: T06, T07
  - Files:
    - `src/app/api/application-runs/[runId]/events/route.ts`
    - `src/app/api/application-runs/[runId]/resume/route.ts`
    - `src/app/api/application-runs/[runId]/stop/route.ts`
    - `tests/integration/application-runs-control.test.ts`
  - Work:
    - Return public events after a sequence cursor.
    - Add idempotent resume and stop operations.
  - Acceptance:
    - Polling never duplicates events when the cursor is supplied.
    - Stop persists before the handler returns.
    - Resume refuses terminal and already-active runs.
  - Verify:
    - `npm run test:integration -- tests/integration/application-runs-control.test.ts`

## Phase 2A — Real Browserbase discovery

- [x] **T09 — Build the Browserbase/Stagehand server adapter**
  - Depends on: T01, T02
  - Files:
    - `src/lib/integrations/browserbase/client.ts`
    - `src/lib/integrations/browserbase/types.ts`
    - `tests/application-agent/browserbase-client.test.ts`
  - Work:
    - Validate Browserbase configuration.
    - Launch a session with opaque metadata and controlled timeout/region.
    - Create Stagehand and retrieve the SDK Live View URL.
    - Expose one cleanup method that closes Stagehand and browser resources.
  - Acceptance:
    - No client bundle imports this module.
    - Missing credentials fail explicitly.
    - Cleanup is safe after partial initialization and may be called more than once.
  - Verify:
    - `npm run test -- tests/application-agent/browserbase-client.test.ts`
    - `npm run build`

- [x] **T10 — Implement official-page inspection**
  - Depends on: T06, T09
  - Files:
    - `src/lib/application-agent/phases/inspect-site.ts`
    - `src/lib/integrations/browserbase/url-policy.ts`
    - `tests/application-agent/inspect-site.test.ts`
  - Work:
    - Navigate to the fixed official assistance URL.
    - Use Stagehand to extract only the application link and label.
    - Validate HTTPS, allowed host, and `.pdf` path deterministically.
    - Append safe activity messages.
  - Acceptance:
    - The model cannot expand the host allowlist or redefine the task.
    - Invalid links produce `needs_manual_review`.
    - Public events contain no raw prompt or page text.
  - Verify:
    - `npm run test -- tests/application-agent/inspect-site.test.ts`

- [x] **T11 — Download and validate the Browserbase PDF**
  - Depends on: T05, T09, T10
  - Files:
    - `src/lib/integrations/browserbase/downloads.ts`
    - `src/lib/application-agent/phases/download-pdf.ts`
    - `tests/application-agent/download-pdf.test.ts`
  - Work:
    - Poll the Downloads API with a bounded timeout.
    - Require exactly one PDF.
    - Validate HTTP result, MIME, PDF magic bytes, and configured size limit.
    - Save the source artifact and metadata.
  - Acceptance:
    - Zero, multiple, non-PDF, oversized, and timed-out downloads fail safely.
    - Exactly one valid PDF produces one immutable source artifact.
    - Browserbase API keys never enter returned JSON or events.
  - Verify:
    - `npm run test -- tests/application-agent/download-pdf.test.ts`

- [x] **T12 — Wire browser phases into worker cleanup**
  - Depends on: T06, T10, T11
  - Files:
    - `src/lib/application-agent/phases/browser-discovery.ts`
    - `src/lib/application-agent/worker.ts`
    - `tests/application-agent/browser-discovery.test.ts`
  - Work:
    - Combine launch, inspection, and download phases.
    - Persist session ID and short-lived Live View URL while active.
    - Clear the Live View and close external resources after download or failure.
  - Acceptance:
    - Every tested exit path closes Stagehand and the browser.
    - Waiting for patient input never holds a Browserbase session open.
    - A persisted source artifact allows later phases to resume without relaunching Browserbase.
  - Verify:
    - `npm run test -- tests/application-agent/browser-discovery.test.ts`

## Phase 2B — Live workspace

- [x] **T13 — Enable Apply with Apovo and workspace routing**
  - Depends on: T07
  - Files:
    - `src/app/resources/page.tsx`
    - `src/app/applications/[id]/workspace/page.tsx`
    - `src/components/application-agent/StartApplicationButton.tsx`
    - `tests/integration/start-workspace.test.tsx`
  - Work:
    - Enable the card CTA.
    - Start or resume the run, then navigate to the workspace.
    - Preserve **Apply Manually** behavior.
  - Acceptance:
    - The CTA does not optimistically claim success.
    - Back returns to the one-card resource grid.
    - Start errors are visible and do not navigate to a nonexistent run.
  - Verify:
    - `npm run test:integration -- tests/integration/start-workspace.test.tsx`

- [x] **T14 — Build workspace shell and activity rail**
  - Depends on: T08, T13
  - Files:
    - `src/components/application-agent/ApplicationWorkspace.tsx`
    - `src/components/application-agent/ActivityRail.tsx`
    - `src/components/application-agent/useApplicationRun.ts`
    - `tests/application-agent/application-workspace.test.tsx`
  - Work:
    - Implement two-column desktop and stacked mobile layout.
    - Poll run state and cursor-based events.
    - Render Back, public status, activity messages, Stop, and Resume.
  - Acceptance:
    - Events remain ordered and deduplicated.
    - Reload restores persisted state.
    - Polling stops at terminal/waiting states and resumes after user action.
  - Verify:
    - `npm run test -- tests/application-agent/application-workspace.test.tsx`

- [x] **T15 — Add read-only Browserbase Live View panel**
  - Depends on: T09, T12, T14
  - Files:
    - `src/components/application-agent/LiveBrowserPanel.tsx`
    - `src/components/application-agent/ApplicationWorkspace.tsx`
    - `tests/application-agent/live-browser-panel.test.tsx`
  - Work:
    - Render authorized Live View only while the run exposes an active URL.
    - Configure restrictive iframe permissions and disable patient interaction.
    - Show launching, disconnected, closed, and error states.
  - Acceptance:
    - Live View disappears after browser cleanup.
    - URL is not written to visible diagnostics or browser logs.
    - No takeover controls exist in this MVP.
  - Verify:
    - `npm run test -- tests/application-agent/live-browser-panel.test.tsx`

## Phase 3 — PDF inspection and draft filling

- [x] **T16 — Inspect and register the current official PDF fixture**
  - Depends on: T01, T11
  - Files:
    - `tests/fixtures/remember-betty/current-application.pdf`
    - `src/lib/pdf/inspect-pdf.ts`
    - `src/lib/pdf/template-registry.ts`
    - `tests/application-agent/inspect-pdf.test.ts`
  - Work:
    - Inspect page count, dimensions, rotation, AcroForm fields, and text.
    - Record the reviewed checksum and version metadata.
    - Decide AcroForm versus checksum-bound coordinate filling from evidence.
  - Acceptance:
    - The checked fixture has a stable checksum and recorded field strategy.
    - A one-byte-changed fixture is unrecognized.
    - No patient data exists in the fixture.
  - Verify:
    - `npm run test -- tests/application-agent/inspect-pdf.test.ts`

- [x] **T17 — Add PDF source validation and template refusal**
  - Depends on: T16
  - Files:
    - `src/lib/pdf/validate-pdf.ts`
    - `src/lib/application-agent/phases/inspect-pdf.ts`
    - `tests/application-agent/validate-pdf.test.ts`
  - Work:
    - Validate parseability, page count, encryption/password state, and reviewed checksum.
    - Transition unknown versions to `needs_manual_review`.
  - Acceptance:
    - Unknown, corrupt, encrypted, and oversized PDFs are never sent to the filler.
    - Known fixture advances to field mapping.
  - Verify:
    - `npm run test -- tests/application-agent/validate-pdf.test.ts`

- [x] **T18 — Map patient profile fields and create required inputs**
  - Depends on: T04, T16, T17
  - Files:
    - `src/lib/pdf/field-map.ts`
    - `src/lib/application-agent/phases/map-fields.ts`
    - `tests/application-agent/map-fields.test.ts`
  - Work:
    - Map known non-sensitive profile values.
    - Create required inputs for current/sensitive/missing fields.
    - Always ask for last four SSN digits and current income/employment confirmations.
  - Acceptance:
    - No placeholder is inserted for unknown data.
    - Care email is considered known only when both email and inbox ID exist.
    - Public events identify missing categories without exposing answers.
  - Verify:
    - `npm run test -- tests/application-agent/map-fields.test.ts`

- [x] **T19 — Generate unsigned filled application drafts**
  - Depends on: T05, T16, T18
  - Files:
    - `src/lib/pdf/fill-application.ts`
    - `src/lib/application-agent/phases/fill-pdf.ts`
    - `tests/application-agent/fill-application.test.ts`
  - Work:
    - Fill AcroForm fields or exact-checksum coordinates.
    - Create a new immutable draft artifact.
    - Leave signature and unanswered fields blank.
  - Acceptance:
    - Source PDF bytes remain unchanged.
    - Known fields render in expected positions.
    - Unknown fields and signature remain blank.
  - Verify:
    - `npm run test -- tests/application-agent/fill-application.test.ts`

## Phase 4 — Patient input and documents

- [x] **T20 — Add required-input read and answer APIs**
  - Depends on: T04, T18
  - Files:
    - `src/app/api/application-runs/[runId]/inputs/route.ts`
    - `src/app/api/application-runs/[runId]/inputs/[inputId]/route.ts`
    - `src/lib/application-agent/input-validation.ts`
    - `tests/integration/required-inputs.test.ts`
  - Work:
    - Return only open inputs belonging to the active patient.
    - Validate and persist typed answers.
    - Resume the worker only when blocking inputs are satisfied.
  - Acceptance:
    - Invalid answers leave the input open.
    - Sensitive answers never appear in response/event logs.
    - Answering is idempotent.
  - Verify:
    - `npm run test:integration -- tests/integration/required-inputs.test.ts`

- [x] **T21 — Build one-at-a-time patient question UI**
  - Depends on: T14, T20
  - Files:
    - `src/components/application-agent/PatientQuestion.tsx`
    - `src/components/application-agent/ActivityRail.tsx`
    - `src/components/application-agent/useRequiredInputs.ts`
    - `tests/application-agent/patient-question.test.tsx`
  - Work:
    - Render text, date, choice, and masked sensitive inputs.
    - Show the reason the field is required.
    - Advance only after server confirmation.
  - Acceptance:
    - One question appears at a time.
    - SSN input stays masked and is never placed into activity history.
    - Refresh preserves answered/open state.
  - Verify:
    - `npm run test -- tests/application-agent/patient-question.test.tsx`

- [x] **T22 — Replace synthetic uploads with private artifacts**
  - Depends on: T05, T20
  - Files:
    - `src/app/api/application-runs/[runId]/uploads/route.ts`
    - `src/lib/pdf/validate-upload.ts`
    - `src/components/application-agent/DocumentUploadQuestion.tsx`
    - `tests/integration/private-upload.test.ts`
  - Work:
    - Store diagnosis-letter bytes privately.
    - Validate PDF MIME, magic bytes, size, page count, parseability, and ownership.
    - Remove workflow dependence on `src/app/api/upload/route.ts`.
  - Acceptance:
    - Returned metadata contains an opaque artifact ID, never a filesystem path.
    - Invalid files create no artifact.
    - Upload belongs to one patient/run only.
  - Verify:
    - `npm run test:integration -- tests/integration/private-upload.test.ts`

- [x] **T23 — Correct and integrate AgentMail inbox provisioning**
  - Depends on: T18, T20
  - Files:
    - `src/lib/integrations/agentmail/client.ts`
    - `src/app/api/patients/[id]/inbox/route.ts`
    - `src/lib/store.ts`
    - `tests/integration/agentmail-provisioning.test.ts`
  - Work:
    - Use the documented AgentMail endpoint and request field names.
    - Require both returned inbox ID and address.
    - Persist the real values and resume the waiting run.
    - Remove any incomplete-response fallback.
  - Acceptance:
    - Successful fixture response stores exact external identity.
    - Missing credentials, API failure, or missing ID/address stores nothing.
    - PDF mapping uses only confirmed stored values.
  - Verify:
    - `npm run test:integration -- tests/integration/agentmail-provisioning.test.ts`

- [ ] **T24 — Add personal-note drafting and review**
  - Depends on: T20, T21
  - Files:
    - `src/components/application-agent/PersonalNoteQuestion.tsx`
    - `src/lib/application-agent/personal-note.ts`
    - `src/app/api/application-runs/[runId]/personal-note/route.ts`
    - `tests/application-agent/personal-note.test.tsx`
  - Work:
    - Support patient-authored text and optional generated draft.
    - Require patient edit/review confirmation.
    - Persist only the approved note text as private run input.
  - Acceptance:
    - Generated text is clearly marked as a draft.
    - The run cannot advance on an unreviewed draft.
    - Note contents never enter public activity events.
  - Verify:
    - `npm run test -- tests/application-agent/personal-note.test.tsx`

## Phase 5 — Packet review, signature, and download

- [x] **T25 — Assemble the unsigned packet and enforce page limit**
  - Depends on: T19, T22, T24
  - Files:
    - `src/lib/pdf/render-personal-note.ts`
    - `src/lib/pdf/assemble-packet.ts`
    - `src/lib/application-agent/phases/assemble-packet.ts`
    - `tests/application-agent/assemble-packet.test.ts`
  - Work:
    - Render reviewed personal note to PDF.
    - Append diagnosis letter and note to the filled application.
    - Create unsigned packet artifact and enforce eight-page maximum.
  - Acceptance:
    - Missing required artifact blocks assembly.
    - Nine-page packet cannot advance.
    - Page order matches foundation requirements.
  - Verify:
    - `npm run test -- tests/application-agent/assemble-packet.test.ts`

- [x] **T26 — Add authorized artifact preview and download**
  - Depends on: T05, T25
  - Files:
    - `src/app/api/application-runs/[runId]/artifacts/[artifactId]/route.ts`
    - `src/components/application-agent/PdfPacketPreview.tsx`
    - `src/components/application-agent/ApplicationWorkspace.tsx`
    - `tests/integration/artifact-download.test.ts`
  - Work:
    - Stream authorized PDF bytes with private cache headers.
    - Switch workspace right panel from Live View to PDF preview.
    - Prevent arbitrary artifact enumeration.
  - Acceptance:
    - Another patient/run receives 404 or 403.
    - Responses are non-cacheable and contain no local path.
    - Preview/download use the same immutable artifact.
  - Verify:
    - `npm run test:integration -- tests/integration/artifact-download.test.ts`

- [ ] **T27 — Add exact-packet review approval**
  - Depends on: T25, T26
  - Files:
    - `src/app/api/application-runs/[runId]/review/route.ts`
    - `src/components/application-agent/PacketReviewChecklist.tsx`
    - `src/lib/application-agent/review-policy.ts`
    - `tests/application-agent/review-policy.test.ts`
  - Work:
    - Show completeness and page-limit checks.
    - Bind patient review to unsigned artifact SHA-256.
    - Invalidate review if the packet changes.
  - Acceptance:
    - Review cannot succeed for an incomplete/oversized packet.
    - A changed checksum requires new review.
    - Review does not imply submission.
  - Verify:
    - `npm run test -- tests/application-agent/review-policy.test.ts`

- [ ] **T28 — Add direct patient signature step**
  - Depends on: T27
  - Files:
    - `src/components/application-agent/SignatureQuestion.tsx`
    - `src/app/api/application-runs/[runId]/signature/route.ts`
    - `src/lib/pdf/apply-signature.ts`
    - `tests/application-agent/apply-signature.test.ts`
  - Work:
    - Capture signature only through direct patient interaction.
    - Validate review checksum before applying it.
    - Draw signature at the reviewed template location.
  - Acceptance:
    - Agent code cannot generate or reuse a signature.
    - Signature is rejected if the unsigned packet changed.
    - Signature bytes/text never appear in public events.
  - Verify:
    - `npm run test -- tests/application-agent/apply-signature.test.ts`

- [ ] **T29 — Finalize PacketReady and downloadable packet**
  - Depends on: T25, T27, T28
  - Files:
    - `src/lib/application-agent/phases/finalize-packet.ts`
    - `src/lib/store.ts`
    - `src/components/application-agent/ApplicationWorkspace.tsx`
    - `tests/integration/packet-ready.test.ts`
  - Work:
    - Register final artifact checksum/page count.
    - Set run to `packet_ready` and application to `PacketReady`.
    - Show final download action and explicit “not submitted” copy.
  - Acceptance:
    - PacketReady requires all checks, review, and patient signature.
    - No submission/delivery event or API call occurs.
    - Downloaded bytes match stored checksum.
  - Verify:
    - `npm run test:integration -- tests/integration/packet-ready.test.ts`

## Phase 6 — Hardening and final verification

- [ ] **T30 — Add cleanup and abandoned-run recovery**
  - Depends on: T12, T29
  - Files:
    - `src/lib/application-agent/cleanup.ts`
    - `src/lib/application-agent/worker.ts`
    - `tests/application-agent/cleanup.test.ts`
  - Work:
    - Detect stale active sessions.
    - Clear expired Live View URLs.
    - Preserve completed phase outputs and offer explicit Resume.
    - Delete only safe temporary artifacts, never source/final packets automatically.
  - Acceptance:
    - Cleanup is idempotent.
    - Restarted runs resume without duplicating Browserbase downloads or artifacts.
  - Verify:
    - `npm run test -- tests/application-agent/cleanup.test.ts`

- [ ] **T31 — Audit event redaction and client/server boundaries**
  - Depends on: T15, T20, T23, T28
  - Files:
    - `src/lib/application-agent/public-events.ts`
    - `tests/application-agent/redaction.test.ts`
    - `tests/integration/client-boundary.test.ts`
  - Work:
    - Centralize public event creation.
    - Redact sensitive values and provider URLs.
    - Verify server integrations do not enter client bundles.
  - Acceptance:
    - Test corpus containing SSN, API keys, live URL, diagnosis text, and signature data emits no forbidden values.
    - Client-boundary test fails if provider modules become client imports.
  - Verify:
    - `npm run test -- tests/application-agent/redaction.test.ts`
    - `npm run test:integration -- tests/integration/client-boundary.test.ts`
    - `npm run build`

- [ ] **T32 — Run synthetic end-to-end workflow**
  - Depends on: T29, T30, T31
  - Files:
    - `tests/integration/application-agent-e2e.test.ts`
    - `references/browserbase-stagehand-integration.md`
    - `README.md`
  - Work:
    - Cover the full workflow with provider fakes and synthetic artifacts.
    - Document localhost environment setup, workflow behavior, and troubleshooting.
    - Document that packet generation is not submission.
  - Acceptance:
    - Full fake-provider run reaches PacketReady after required patient actions.
    - Every tested failure remains non-submitted and recoverable or terminal as specified.
  - Verify:
    - `npm run test:integration -- tests/integration/application-agent-e2e.test.ts`
    - `npm run test`
    - `npm run lint`
    - `npm run build`

- [ ] **T33 — Real Browserbase localhost acceptance check with synthetic data**
  - Depends on: T32
  - Files: no product-code changes expected; record findings in `tasks/todo.md` or a separate acceptance note if needed.
  - Work:
    - Configure Browserbase and AgentMail test credentials.
    - Run the approved manual acceptance path with a synthetic patient and controlled documents.
    - Confirm Live View, download, resume, questions, assembly, signature, and final download.
  - Acceptance:
    - Real Browserbase navigation is visible.
    - Current official PDF is downloaded and recognized.
    - Browserbase closes before patient-input waiting.
    - Final packet is no more than eight pages and remains unsubmitted.
    - No real patient data is used.
  - Verify:
    - Complete the manual acceptance checklist in `tasks/plan.md`.

## Review gate before implementation

Implementation starts only after this checklist is approved. Execute one task at a time, mark it complete only after verification passes, and report any spec-changing discovery before proceeding.

## Implementation notes — 2026-10-26 verification

- T01–T26 are implemented except T24's optional agent-drafted note (patient-authored note only, reviewed in the textarea before saving).
- Browser downloads now use the current per-file Downloads API (`GET /v1/downloads?sessionId=...&mimeType=application/pdf` then `GET /v1/downloads/{id}`), replacing the legacy ZIP endpoint. The download step connects with `playwright-core` over CDP and sets `Browser.setDownloadBehavior` (`downloadPath: "downloads"`) exactly as the Browserbase documentation requires; Stagehand v4 exposes no CDP session and its direct PDF navigation does not capture downloads.
- The real official PDF (SHA-256 `6a84b55e…b58886`, 3 pages, 10 text fields + 2 Yes/No dropdowns) is registered in `src/lib/pdf/template-registry.ts`; unknown checksums stop for manual review.
- Packet assembly flattens filled forms into page content (pdf-lib `copyPages` drops AcroForm data) and enforces the 8-page limit. Page order: application, diagnosis letter, personal note.
- AgentMail: the existing API key is inbox-scoped and cannot create inboxes (`missing_permission`). `AGENTMAIL_INBOX_ID=aniket-6304@agentmail.to` is therefore the confirmed care inbox; per-patient inbox creation is still available for organization-scoped keys via `provisionPatientInbox`.
- The foundation states applications are NOT accepted by email (HIPAA); submission is fax/mail only. The follow-up route sends plain care correspondence only and never attaches the packet.
- Real localhost acceptance run `run_1793052825728_jshdiq`: real Browserbase session downloaded the official PDF, run paused for 8 patient questions, synthetic answers + synthetic diagnosis letter produced a verified 5-page packet (`awaiting_patient_review`) with the care email, SSN last4, income, and diagnosis date rendered; no SSN in public events. A synthetic self-test email was sent through the app and received in the managed AgentMail inbox.
- Still open: exact-packet review approval, in-app patient signature, PacketReady finalization (T27–T29), hardening (T30–T33), and T24's optional draft generation.
