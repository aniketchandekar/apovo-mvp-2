# Implementation Plan: Browserbase PDF Application Agent

Date: 2026-10-26  
Status: Proposed  
Approved specification: `docs/superpowers/specs/2026-10-26-browserbase-pdf-application-agent-design.md`

## Outcome

Turn **Apply with Apovo** into a localhost-first, resumable application-preparation workflow for Remember Betty:

1. Open a dedicated workspace.
2. Launch a real Browserbase session controlled by Stagehand.
3. Show public agent activity on the left and Browserbase Live View on the right.
4. Discover and download the current official PDF.
5. Fill known fields and pause for missing answers, documents, and confirmed medical email.
6. Assemble and preview the required packet.
7. Let the patient personally apply a signature.
8. Produce a private downloadable PDF packet.

The workflow stops at `PacketReady`. It never submits, emails, mails, or faxes the packet.

## Current-state constraints

- `Apply with Apovo` is currently disabled in `src/app/resources/page.tsx`.
- `/applications/[id]` redirects back to resources; no workspace exists.
- `ApplicationRecord` contains legacy browser-session fields but no durable run, event, artifact, or required-input model.
- The local JSON store has no atomic per-run operations or worker lock.
- `@browserbasehq/sdk` is installed; Stagehand and PDF libraries are not.
- The upload route returns a synthetic URL without storing file bytes and must not be reused.
- AgentMail provisioning currently uses an API shape that the integration reference identifies as incorrect; it must be corrected before its result is used in a PDF.
- There is no test runner configured.
- The target runtime is a single long-lived Node.js process on localhost.

## Technical decisions

### Runtime and persistence

- Keep the existing Next.js application and Route Handler architecture.
- Use a local singleton worker for active jobs.
- Persist every phase transition and phase output in `.data/db.json` before continuing.
- Store private bytes under `.data/artifacts/`; add that directory to `.gitignore`.
- Do not auto-resume work on process startup. Persist enough information for an explicit Resume action.
- Introduce repository interfaces around run and artifact persistence so production storage can replace local files later.

### Client updates

- Use polling rather than SSE for the localhost MVP.
- Poll run/event state every 750–1000 ms while the run is active.
- Stop polling while waiting for patient input and at terminal states, then refresh immediately after an answer or Resume action.
- Render Browserbase's SDK-provided Live View URL in a read-only iframe.

### Browser automation

- Add Stagehand v4 and a compatible Zod 4.4.x version.
- Launch Browserbase and Stagehand in a server-only adapter.
- Start from the fixed official Remember Betty page.
- Let Stagehand extract the application link, then validate the result deterministically.
- Allow only HTTPS URLs on the Remember Betty and Squarespace hosts listed in the specification.
- Download through the Browserbase Downloads API and require exactly one validated PDF.
- Close Stagehand and Browserbase in `finally` on success, stop, and error.

### PDF processing

- Add `pdf-lib` for form filling, drawing values/signature images, and page assembly.
- Add a PDF text/structure parser only after inspecting the current downloaded PDF during the implementation spike. Prefer `pdfjs-dist` if text extraction is needed beyond what `pdf-lib` exposes.
- Support AcroForm fields when present.
- Support a reviewed coordinate template keyed by exact source SHA-256 if the current form is not fillable.
- Refuse to fill an unrecognized checksum.
- Use the browser's native PDF rendering through an authorized artifact route for the first preview implementation.

### Patient data

- Profile fields are copied only from the active patient's persisted profile.
- Monthly income, employment/treatment answers, diagnosis details that are not verified, and last four SSN digits require explicit current answers.
- SSN digits are never included in activity events or logs.
- A form email is populated only from a confirmed AgentMail `inbox_id + email` response.
- Diagnosis-letter and personal-note bytes remain private artifacts.
- Signature is a separate direct patient action after reviewing the unsigned packet.

## Dependency graph

```text
foundation
   |
   v
automation-run ──────────────┐
   |                         |
   +──> browser-discovery ───+──> pdf-inspection
   |                         |         |
   +──> live-workspace       |         v
                             +──> patient-input
                                      |
                                      v
                                packet-review
                                      |
                                      v
                                 hardening
```

`browser-discovery` and the first `live-workspace` shell may proceed in parallel after the run contracts exist. PDF inspection requires a real or fixture source PDF. Patient input requires the inspected field contract. Packet review requires all prior modules.

## Implementation phases

### Phase 0 — Foundation and executable tests

Purpose: establish package/runtime support and a safety net before integration work.

Work:

- Add Stagehand, compatible Zod, `pdf-lib`, Vitest, and test scripts.
- Add `.data/artifacts/` to `.gitignore`.
- Create test configuration with Node environment and the existing `@/` alias.
- Add small provider interfaces for Browserbase, AgentMail, time, and artifact storage so tests do not call external services.
- Add typed error codes shared by routes and worker phases.

Checkpoint:

```bash
npm run test
npm run lint
npm run build
```

Acceptance:

- Tests execute without contacting Browserbase or AgentMail.
- Server-only integration modules cannot be imported into client components.
- Existing resource and onboarding behavior still build.

### Phase 1 — `automation-run`: durable run state and local worker

Purpose: make the workflow resumable before adding any external side effect.

Work:

- Add `PacketReady` to application state and introduce `ApplicationRun`, `RunEvent`, `ApplicationArtifact`, and `RequiredInput` types.
- Migrate local database state without deleting the active patient or Remember Betty application.
- Add atomic store methods for:
  - create-or-return active run;
  - append sequenced public event;
  - compare-and-set phase transition;
  - create/answer required input;
  - register artifact metadata;
  - stop/fail/resume run.
- Implement a per-run in-memory lock and phase dispatcher.
- Implement deterministic no-op phase handlers first so the full transition table can be tested without providers.
- Add start, get, event polling, resume, and stop Route Handlers.

Verification checkpoint:

- Creating the same run twice returns the same active run.
- A page reload returns persisted state and ordered events.
- Two resume requests cannot advance one phase twice.
- Stop produces a terminal state and prevents future advancement.
- Invalid transitions fail without mutating the record.

### Phase 2A — `browser-discovery`: Browserbase and Stagehand integration

Purpose: replace the disabled/fake browser workflow with observable real discovery.

Work:

- Build a server-only Browserbase adapter that:
  - validates environment configuration;
  - launches a session with opaque metadata;
  - obtains the SDK-generated Live View URL;
  - initializes Stagehand;
  - closes both resources safely.
- Implement phases:
  - `launching_browser`;
  - `inspecting_site`;
  - `downloading_pdf`.
- Extract the application link through Stagehand.
- Validate protocol, host, and `.pdf` path outside the model.
- Poll Browserbase Downloads, require one PDF, validate bytes, compute checksum, and write a source artifact.
- Clear the live-view URL and close the session once download completes.
- Add provider fakes for launch, extraction, download, timeout, and close failures.

Verification checkpoint:

- A synthetic allowed link creates one source artifact.
- An unapproved host or non-PDF link transitions to `needs_manual_review`.
- Missing credentials return a configuration error without a fallback.
- Every success and failure test confirms both Stagehand and browser cleanup.

### Phase 2B — `live-workspace`: workspace shell and live observability

Purpose: expose Phase 1 and 2A safely to the patient.

This phase can begin after Phase 1 while Phase 2A adapter tests are being completed.

Work:

- Enable **Apply with Apovo** on the resource card.
- On click, call the start route and navigate to `/applications/[id]/workspace`.
- Build the workspace with:
  - Back button;
  - grant name and public run status;
  - Stop/Resume controls;
  - 30% activity rail;
  - 70% Live View/PDF panel;
  - responsive stacked layout.
- Poll run and event endpoints with sequence cursors.
- Embed Live View read-only with a restrictive iframe configuration.
- Show explicit states for launching, connected, reconnecting, waiting, stopped, manual review, and failed.
- Never surface raw provider errors, prompts, or live URLs in visible diagnostics.

Verification checkpoint:

- The button opens the workspace and Back returns to the card.
- Fixture events appear in stable sequence without duplicates.
- Reloading the workspace restores the same run.
- The iframe appears only while a live URL is authorized and active.
- Stop/Resume controls track server state rather than optimistic fake success.

### Phase 3 — `pdf-packet`: inspect and map the current application

Purpose: convert the downloaded PDF into a safe, versioned filling template.

Work:

- Inspect the current official PDF fixture:
  - page count;
  - AcroForm presence and names;
  - extracted text;
  - rotation and page dimensions.
- Record the reviewed checksum and versioned field map.
- Implement source-PDF validation and template registry.
- Implement AcroForm filling if possible; otherwise implement coordinate drawing keyed to the exact checksum.
- Create the first unsigned draft artifact using known non-sensitive profile values.
- Generate `RequiredInput` records for all missing, stale, or sensitive fields.
- Switch the workspace right panel from Live View to authorized PDF preview after browser discovery closes.

Verification checkpoint:

- Known fixture checksum maps to the reviewed template.
- One-byte fixture change is refused as unknown.
- Known profile fields appear in the expected locations.
- Unknown fields stay blank and create inputs instead of placeholders.
- Source PDF is never modified in place.

### Phase 4 — `patient-input`: questions, documents, and medical email

Purpose: pause and resume the run around real patient action.

Work:

- Build required-input APIs and one-at-a-time question UI in the activity rail.
- Validate input by type, including masked four-digit SSN handling.
- Replace the synthetic upload route with private artifact storage scoped to run and patient.
- Accept PDF diagnosis letters only in the first release; validate MIME, magic bytes, size, page count, and corruption/password protection.
- Add a personal-note editor that supports:
  - blank patient-authored text;
  - optional agent draft from known non-sensitive context;
  - mandatory patient edit/review confirmation.
- Correct AgentMail provisioning to the documented endpoint/request shape.
- Require and persist the actual AgentMail inbox ID and address.
- Pause with a clear error if AgentMail is not configured or does not return both identifiers.
- Resume at `filling_pdf` only after every blocking input is valid.

Verification checkpoint:

- Answering one question persists and advances to the next without restarting Browserbase.
- SSN digits never appear in public events or API logs.
- Invalid uploads leave the input open with a correction message.
- AgentMail failure creates no synthetic address.
- A confirmed care email is inserted into the draft PDF.

### Phase 5 — `packet-review`: assemble, sign, and download

Purpose: produce the complete packet while keeping signature and final approval human-controlled.

Work:

- Render the filled application to a new draft artifact.
- Convert the reviewed personal note to a PDF page with predictable pagination.
- Append the diagnosis letter and personal note to the application.
- Enforce the eight-page maximum after assembly.
- Build an unsigned-packet preview and completeness checklist.
- Add patient signature UI after the exact unsigned packet is shown.
- Bind signature consent to the unsigned packet checksum.
- Draw the patient-provided signature into the reviewed signature location.
- Generate final checksum and `final_packet` artifact.
- Add the authorized, non-cacheable download route.
- Set application state to `PacketReady` only after every check passes.

Verification checkpoint:

- No signature can be applied before review confirmation.
- Any change to the unsigned packet invalidates prior signature approval.
- A packet over eight pages cannot reach `PacketReady`.
- Final download matches stored SHA-256 and contains all required pages.
- No route transitions to `Submitted` or sends the artifact externally.

### Phase 6 — Hardening and end-to-end localhost verification

Purpose: verify recovery, privacy boundaries, and failure behavior across the complete slice.

Work:

- Add integration coverage for all terminal and retryable states.
- Audit client bundles for server credentials/provider modules.
- Audit logs and run events for PHI/secret leakage.
- Add cleanup for abandoned active sessions and temporary artifacts.
- Add artifact retention notes and a manual localhost cleanup command that targets only `.data/artifacts/`.
- Exercise the workflow with synthetic patient data and the real Browserbase session.
- Document required environment keys, setup, and troubleshooting.

Final verification:

```bash
npm run test
npm run test:integration
npm run lint
npm run build
```

Manual acceptance path:

1. Start the app on localhost.
2. Click **Apply with Apovo**.
3. Observe real Browserbase navigation and public activity messages.
4. Confirm the current PDF is privately downloaded and Browserbase closes.
5. Reload and resume the run.
6. Answer missing fields and provision/confirm the medical inbox.
7. Upload a synthetic diagnosis letter and review the personal note.
8. Preview the exact unsigned packet.
9. Apply a synthetic patient signature.
10. Download the final packet and verify it is no more than eight pages.
11. Confirm application state is `PacketReady`, with no submission or delivery event.

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Current PDF has no AcroForm fields | Filling cannot use field names | Inspect early; use exact-checksum coordinate template |
| Foundation replaces or redesigns PDF | Coordinates could write into wrong locations | Checksum registry; unknown versions stop for manual review |
| Browserbase Live View URL expires | Right panel disconnects | Persist phase state; reconnect only if session is active; otherwise resume from last artifact |
| Stagehand follows prompt injection on page | Data exfiltration or wrong navigation | Extract only link/label; deterministic host/protocol/file checks |
| Browserbase session waits for patient input | Cost and timeout | Close after download; patient input continues from local artifacts |
| Local process exits during a phase | Active work stops | Persist before/after every phase; explicit Resume; phase idempotency |
| JSON store concurrent writes | Corrupted or lost state | Per-run lock plus serialized store writes for localhost; production migration required |
| Uploaded PDF is malicious/corrupt | Parser failure or resource exhaustion | Strict byte/page/size validation and isolated error handling |
| Packet exceeds eight pages | Foundation rejection | Preflight page count and block completion with corrective guidance |
| Medical email is not actually provisioned | Invalid application contact | Require AgentMail inbox ID and returned address; no fallback |
| Sensitive data leaks in narration/logs | Privacy harm | Explicit public-event API, redaction tests, opaque metadata |
| Signature is applied without informed action | Invalid authorization | Exact-packet preview and checksum-bound patient signature step |

## Parallelization

After Phase 1 contracts are stable:

- Browserbase adapter/provider tests and the workspace UI shell can be developed in parallel.
- PDF fixture inspection can occur while Live View styling is completed.
- Patient-input UI can be prototyped against fake required inputs while AgentMail and artifact adapters are implemented.

Must remain sequential:

- Run state contracts before provider or UI wiring.
- PDF template inspection before field filling.
- Field/input completion before packet assembly.
- Packet assembly before signature and final download.

## Migration path after localhost

The production migration is intentionally excluded from this implementation, but the local design must preserve these seams:

- `RunRepository` → transactional shared database.
- `ArtifactStore` → encrypted private object storage.
- `RunWorker` → durable queue worker.
- active-patient check → authenticated patient/tenant authorization.
- polling → SSE or WebSocket if required.
- local provider configuration → reviewed healthcare/security deployment policy.

## Plan approval gate

After this plan is approved, generate `tasks/todo.md` with dependency-ordered tasks. Each task must:

- touch approximately five files or fewer;
- have explicit acceptance criteria;
- name its verification command or manual check;
- preserve a runnable vertical slice;
- stop at a review checkpoint before enabling real patient data.
