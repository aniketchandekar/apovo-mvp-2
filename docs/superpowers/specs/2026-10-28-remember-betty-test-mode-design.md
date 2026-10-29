# Design and Specification: Remember Betty End-to-End Test Mode

Date: 2026-10-28  
Status: Approved  
Target: Localhost-first MVP

## Objective

Add a conspicuous test-mode switch to the top of the Apovo application. When the switch is enabled and the user starts a Remember Betty application, Apovo must run a fully automated synthetic workflow: open a real Browserbase session, discover and download the current foundation PDF, fill it with a deterministic fake applicant, generate a clearly synthetic diagnosis letter and personal note, assemble the complete packet, and automatically email that packet through AgentMail to the single approved test recipient, `nicole.wu.mail@gmail.com`.

The feature exists to validate the complete Browserbase-to-PDF-to-AgentMail pipeline without sending an application to Remember Betty. A test delivery is not a grant submission and must never change the application to `Submitted`.

## Decisions and Assumptions

1. Test mode is off by default.
2. The switch is visible in the persistent top header and is also reflected in the full-screen application workspace.
3. The server exposes the switch only when `APOVO_APPLICATION_TEST_MODE=1`; the client cannot enable the capability by itself.
4. The switch controls the next application run. Its value is copied into the run at creation and is immutable for that run.
5. A test run's recipient is a server constant: `nicole.wu.mail@gmail.com`. The start request does not accept an arbitrary recipient.
6. “Everything in the email” means a single combined PDF containing the synthetically filled Remember Betty application, generated diagnosis letter, and generated personal note.
7. Test delivery occurs automatically after packet assembly. It does not pause for patient input, document upload, final review, signature, or send confirmation.
8. No signature is generated or inferred. The automatically emailed test packet is unsigned and visibly marked **TEST ONLY — NOT A REAL APPLICATION**. A fake legal signature is outside scope.
9. A successful test delivery records AgentMail's message and thread identifiers, but the application remains a test artifact and is never represented as submitted to the foundation.
10. A failed or ambiguous send fails visibly. Automatic retries must use an idempotency key or reconciliation so the same run cannot produce duplicate emails.

## Goals

- Exercise the existing real Browserbase discovery and download path.
- Fill the official PDF with a deterministic, code-owned synthetic applicant fixture.
- Generate and include a clearly labeled synthetic diagnosis letter and personal note.
- Complete the entire test without asking the active patient questions or reading their profile values.
- Automatically send the completed packet to Nicole through a server-configured AgentMail inbox.
- Make test mode visually unmistakable before, during, and after the run.
- Hard-lock the recipient on the server and prevent client-side recipient substitution.
- Persist enough delivery evidence to diagnose the run without logging fixture details or attachment bytes.
- Preserve the current production path when test mode is off.

## Non-goals

- Emailing the packet to Remember Betty or any other foundation address.
- Changing Remember Betty's real fax-or-mail submission policy.
- Marking the application `Submitted`, `Approved`, or delivered to the foundation.
- Automatically generating, copying, or applying a patient signature.
- Reading active-patient profile fields, required-input answers, or uploaded patient documents in test mode.
- Generalizing this switch to every grant in the first version.
- Replacing the existing isolated synthetic `/api/test-care-email` test.
- Proving Gmail inbox placement; AgentMail acceptance only proves provider-side send acceptance.

## Anti-goals

- Never trust a recipient supplied by the browser for this workflow.
- Never let a mid-run toggle change an existing run's mode or destination.
- Never silently fall back from a test run to a production run or vice versa.
- Never report success before AgentMail returns a confirmed message identifier.
- Never retry a possibly successful send without an idempotency/reconciliation check.
- Never include synthetic SSN digits, diagnosis details, document text, API keys, live-view URLs, or attachment content in activity events or server logs.
- Never mix active-patient values or uploads into a synthetic test packet.

## Approaches Considered

### A. Run-scoped immutable test mode — selected

The UI sends `testMode: true` only when starting or restarting a run. The server validates the environment gate, writes `delivery_mode: 'test_email'` and the server-owned test recipient into the new run, and all later phases read the persisted run mode.

Advantages: deterministic, auditable, safe across navigation and refreshes, and resistant to mid-run configuration changes.  
Tradeoff: requires small additions to the run model, state machine, API response, and UI.

### B. Global mutable application setting

The switch would update a shared setting read by every phase.

Rejected because concurrent tabs, another user, or a toggle change during packet preparation could change a run's destination.

### C. Environment-only test execution

The deployment would enter test mode entirely through an environment variable.

Rejected as the primary interaction because it does not provide the requested visible switch and makes individual run intent unclear. An environment variable remains as the capability gate.

## User Experience

### Test switch

- Add a labeled switch to the right side of the persistent top header: **Test mode**.
- When unavailable server-side, do not render an interactive control.
- When off, use the normal neutral header styling.
- When on, show a warning-colored indicator: **Test mode · fake data · sends only to Nicole**.
- Persist the user's switch preference in browser session storage for navigation convenience only. The server remains authoritative when creating a run.
- The full-screen application workspace must show a persistent **TEST RUN** badge and `nicole.wu.mail@gmail.com` for a test run, based on persisted run data rather than session storage.

### Starting a run

1. The user turns on **Test mode**.
2. The user clicks **Apply with Apovo** for Remember Betty.
3. `POST /api/applications/[id]/runs` receives `{ "testMode": true }`.
4. The server rejects the request if the application-test environment gate is disabled.
5. The server creates a run whose delivery mode and recipient cannot be altered by later client requests.
6. The workspace opens, visibly identifies the run as a synthetic test, and proceeds without patient questions.

### Automatic completion

The test flow continues through Browserbase discovery, PDF download, and PDF inspection, then loads the code-owned synthetic fixture instead of provisioning a patient care identity or mapping/opening patient inputs. It fills the PDF, generates the two synthetic supporting documents, and assembles the packet. After the combined packet passes validation:

1. The worker moves to a dedicated test-delivery phase.
2. Apovo creates an AgentMail draft with the packet attached and a deterministic client/idempotency key derived from the run ID.
3. The email copy clearly says this is an Apovo end-to-end test, contains synthetic information only, and was not submitted to Remember Betty.
4. Apovo sends the draft to the server-owned Nicole address.
5. The run stores the AgentMail draft, message, and thread IDs plus the sent timestamp.
6. The workspace reports **Test email sent to Nicole** and keeps the packet available for preview/download.

If AgentMail definitively rejects the send, the run becomes failed with a safe, actionable message. If the outcome is ambiguous, it enters `test_email_delivery_uncertain` for manual reconciliation. It must not display `Sent`, `Submitted`, or `Complete` based only on draft creation.

## Workflow State Model

The normal preparation path remains unchanged:

```text
created
  → launching_browser
  → inspecting_site
  → downloading_pdf
  → inspecting_pdf
  → provisioning_care_email
  → mapping_fields
  → waiting_for_patient?
  → filling_pdf
  → assembling_packet
```

The test path branches immediately after PDF inspection and never enters patient-input phases:

```text
normal run:
  inspecting_pdf
    → provisioning_care_email
    → mapping_fields
    → waiting_for_patient?
    → filling_pdf
    → assembling_packet
    → awaiting_patient_review

test-email run:
  inspecting_pdf
    → loading_synthetic_test_data
    → filling_test_pdf
    → generating_test_documents
    → assembling_test_packet
    → sending_test_email
    → test_email_sent
```

`test_email_sent` is terminal. It maps to a distinct run state such as `test_email_sent`; it must not map to `packet_ready` or any submitted application state. If AgentMail's outcome is ambiguous, the run moves to `test_email_delivery_uncertain`, which uses manual-review semantics, cannot be automatically resumed, and requires provider reconciliation before another send is allowed.

The parent application record remains `Drafting`. Test-delivery status is derived from the terminal application run so this feature does not introduce a production-facing application state. It must never become `Submitted` from this workflow.

## Data Model

Extend `ApplicationRun` with server-owned delivery metadata:

```ts
type DeliveryMode = 'prepare_only' | 'test_email'

interface ApplicationRun {
  // existing fields
  delivery_mode: DeliveryMode
  test_recipient?: typeof REMEMBER_BETTY_TEST_RECIPIENT
  agentmail_draft_id?: string
  agentmail_message_id?: string
  agentmail_thread_id?: string
  test_email_sent_at?: string
  synthetic_fixture_version?: string
}
```

The recipient is stored for audit display, but it is assigned only by server code. Existing persisted runs without `delivery_mode` are interpreted as `prepare_only` for backward compatibility.

Add run phases and states:

```ts
type RunPhase =
  | ExistingRunPhase
  | 'loading_synthetic_test_data'
  | 'filling_test_pdf'
  | 'generating_test_documents'
  | 'assembling_test_packet'
  | 'sending_test_email'
  | 'test_email_sent'
  | 'test_email_delivery_uncertain'
type RunState = ExistingRunState | 'test_email_sent'
```

No attachment bytes or email body need to be duplicated in run metadata. The packet artifact remains in the private artifact store.

## Synthetic Test Fixture

Add one versioned, server-only fixture such as `REMEMBER_BETTY_SYNTHETIC_APPLICANT_V1`. It supplies every form value deterministically, including name, address, birth date, last four SSN digits, diagnosis, diagnosis date, income, employment, treatment status, social-worker details, and a syntactically valid test email address. Values must be obviously fictional and safe for repeated use.

The fixture also supplies content for:

- a one-page diagnosis-confirmation PDF headed **SYNTHETIC TEST DOCUMENT** and naming a fictional clinician/facility;
- a one-page personal-note PDF stating that its story and identity are fictional;
- a visible packet watermark or page notice stating **TEST ONLY — NOT A REAL APPLICATION**.

The fixture version is stored on the run for reproducibility. Test phases must not call `knownProfileValues(patient)`, inspect patient required-input records, or read uploaded diagnosis-letter artifacts. The active patient/run association may continue to provide local access control, but none of that patient's content enters the packet.

## Server and API Design

### Runtime configuration

```text
APOVO_APPLICATION_TEST_MODE=0|1
```

Keep the existing `APOVO_EMAIL_TEST_MODE` for the isolated synthetic email test. The two flags have different scopes and must not implicitly enable each other.

The test workflow sends from the inbox configured by `AGENTMAIL_INBOX_ID`. It does not provision or read the active patient's care inbox. If the configured inbox is absent, the run fails before creating a draft.

Expose a safe capability boolean through existing dashboard/config data, for example:

```json
{
  "capabilities": {
    "applicationTestMode": true
  }
}
```

### Start/restart route

`POST /api/applications/[id]/runs` may accept only:

```ts
{ restart?: boolean; testMode?: boolean }
```

Rules:

- `testMode: true` requires `APOVO_APPLICATION_TEST_MODE === '1'`.
- Test mode is supported only for the Remember Betty resource in this version.
- The server assigns `delivery_mode` and the fixed recipient.
- The server assigns the synthetic fixture version; the client cannot provide or override fixture values.
- `createOrGet` must not return an active run with a different delivery mode. The route returns `409` with an explicit **Start over in test mode** action; it never silently restarts or changes the existing run.
- Restarting a test run creates a new run ID and therefore a new idempotency scope.
- A client-provided `recipient`, `to`, or foundation email field is ignored or rejected.

### Delivery service

Create a server-only helper dedicated to assembled application-test delivery rather than changing `runCareEmailIntegrationTest`, which remains an isolated synthetic email transport test.

The helper receives:

```ts
{
  run: ApplicationRun
  inboxId: string
  packet: ApplicationArtifact
}
```

It must:

- verify the run is `test_email`, has the approved fixture version, and the feature gate is enabled;
- set the recipient internally from `REMEMBER_BETTY_TEST_RECIPIENT`;
- read the packet only through the private artifact store with run/patient ownership checks;
- reject missing, non-PDF, oversized, incomplete, or over-eight-page artifacts;
- create a draft with a deterministic client ID such as `apovo-rb-test-${run.id}`;
- attach `remember-betty-test-packet.pdf` as Base64 using the existing AgentMail attachment contract;
- send the created draft;
- return confirmed draft, message, and thread identifiers;
- save the outbound email record with a test-only classification/label and without changing foundation follow-up state.

### Email envelope and copy

```text
To: nicole.wu.mail@gmail.com
Subject: [APOVO TEST] Remember Betty synthetic application packet — {synthetic applicant name}
Attachment: remember-betty-test-packet.pdf
Labels: apovo_application_test, remember_betty_test
```

The body should include the Apovo run ID and fixture version, state that every applicant and medical detail is synthetic, state that it was not sent to Remember Betty, and ask Nicole to confirm receipt and PDF readability. It must not echo form-field values.

## Idempotency and Failure Handling

- Use one deterministic AgentMail draft client ID per application run.
- Persist the AgentMail draft ID before attempting to send it.
- Before creating a replacement draft after an interrupted attempt, reconcile any stored draft/message identifiers and query AgentMail when possible.
- Once `agentmail_message_id` is stored, the delivery handler returns the recorded success rather than sending again.
- Persist delivery identifiers in the same worker transition that records success when the current store permits it.
- If the provider accepted the send but the process failed before persistence, move to `test_email_delivery_uncertain` and stop for manual reconciliation rather than blindly resending.
- A user may start a new test delivery only through an explicit **Start over**, which creates a new run and is visibly a separate test.

## Security and Privacy

- This workflow must send synthetic information only. Any dependency on active-patient content is a test failure.
- Test mode is a developer/admin capability, not a patient-facing production option.
- The environment gate is mandatory even though the recipient is fixed.
- All mode and recipient checks occur on the server immediately before delivery.
- Browserbase, AgentMail, and artifact-storage credentials remain server-only.
- Activity events contain status only, never fixture values, PDF text, SSN digits, diagnosis-letter text, or attachment Base64.
- The implementation must preserve existing Browserbase retention and PHI safeguards.
- Local JSON and local artifact storage remain MVP-only and are not suitable for multi-user production deployment.

## Project Structure

Expected areas of change:

```text
src/components/dashboard/AppShell.tsx
  Persistent test-mode switch and warning state.

src/components/application-test/TestModeContext.tsx
  One client context above AppShell children, backed by session storage, so the header and start button share one switch value.

src/components/application-agent/StartApplicationButton.tsx
src/components/application-agent/ApplicationWorkspace.tsx
  Start request propagation and immutable run-mode display.

src/app/api/dashboard/route.ts
src/app/api/applications/[id]/runs/route.ts
  Safe capability exposure and server-side run-mode validation.

src/lib/application-agent/types.ts
src/lib/application-agent/state-machine.ts
src/lib/application-agent/run-repository.ts
src/lib/application-agent/phases/pdf-handlers.ts
  Persisted mode, delivery phases, branch, completion, and audit metadata.

src/lib/integrations/agentmail/application-test-delivery.ts
  Fixed-recipient packet delivery and idempotency boundary.

src/lib/application-agent/test-fixtures/remember-betty.ts
  Versioned fake applicant values and synthetic supporting-document content.

tests/application-agent/
  State-machine, route/service, recipient-lock, attachment, and regression tests.

.env.example
README.md
  Runtime flag and safe live-test instructions.
```

Exact file boundaries may be adjusted during planning to keep modules small and avoid passing global client state through unrelated components.

## Tech Stack and Code Style

- Next.js 16.4.3 App Router and Route Handlers
- React 19.3.0 client components
- TypeScript with project path aliases
- Existing local `ApovoStore` and `RunRepository`
- Existing Browserbase/Stagehand, `pdf-lib`, and AgentMail REST wrapper
- Node built-in test runner through the repository's compiled test harness

Follow existing conventions: server-only integration helpers, explicit typed input objects, public-safe errors, immutable run transitions, snake-case fields only at external API boundaries, and no secrets in client components.

Example boundary:

```ts
export const REMEMBER_BETTY_TEST_RECIPIENT = 'nicole.wu.mail@gmail.com' as const;

export function requireApplicationTestMode(run: ApplicationRun): void {
  if (process.env.APOVO_APPLICATION_TEST_MODE !== '1' || run.delivery_mode !== 'test_email') {
    throw new ApplicationRunError('TEST_MODE_UNAVAILABLE', 'Application test mode is unavailable.');
  }
}
```

## Commands

```text
Install: npm install
Development: npm run dev
Lint: npm run lint
Test: npm test
Build: npm run build
Existing isolated live email test: APOVO_EMAIL_TEST_MODE=1 npm run test:email:live
```

A live end-to-end application test must be initiated through the UI with `APOVO_APPLICATION_TEST_MODE=1`, valid Browserbase credentials, and a valid server-configured AgentMail inbox/API key. No completed patient profile or patient upload is required.

## Testing Strategy

### Unit tests

- Default and legacy runs resolve to `prepare_only`.
- Test mode can transition from `assembling_test_packet` to `sending_test_email` and then `test_email_sent`.
- Normal runs still transition to `awaiting_patient_review`.
- Test runs branch after PDF inspection and never enter care-email provisioning, input mapping, `waiting_for_patient`, patient upload, or patient review phases.
- `test_email_sent` is terminal and never maps to a submitted application state.
- The delivery helper rejects normal runs, a disabled environment gate, missing inboxes, missing artifacts, and invalid packets.
- Test-packet completeness means every reviewed form field has a nonempty synthetic fixture value, the synthetic diagnosis letter and personal note were generated, assembly succeeds, the test-only marking is present, and the combined packet passes the eight-page limit.
- Test code fails if patient-profile getters, patient required-input answers, or uploaded patient document artifacts are used as packet content.
- Every request attempting to provide a different recipient is rejected or ignored, and the outbound request still targets Nicole only.
- The attachment bytes and SHA-256 match the assembled packet artifact.
- Re-entering the handler after a confirmed message ID does not send again.
- Provider errors produce a failed run with no success event.
- An ambiguous send becomes `test_email_delivery_uncertain`, cannot auto-resume, and cannot send again until reconciled.

### Route/component tests

- The dashboard exposes only the capability boolean, never environment values.
- Starting a test run while disabled returns a safe error.
- Starting or restarting captures the selected mode.
- An active run with a mismatched mode is not silently reused.
- The start button sends the current switch value.
- The workspace renders its badge and recipient from the run response.
- Reloading or changing session storage cannot change an existing run.

### Live verification

1. Start the app with both Browserbase and AgentMail configured and `APOVO_APPLICATION_TEST_MODE=1`.
2. Enable the visible test switch.
3. Start Remember Betty through **Apply with Apovo**.
4. Confirm a real Browserbase session opens the official page and downloads exactly one current PDF.
5. Provide no answers and upload no documents; confirm the run never pauses for input.
6. Confirm the assembled packet contains the synthetically filled application, generated letter, generated personal note, and prominent test-only labeling and stays within eight pages.
7. Confirm the run sends automatically without a review/send click.
8. Confirm AgentMail reports exactly one recipient: Nicole.
9. Confirm Nicole receives exactly one email, can open the combined PDF, and sees all intended pages.
10. Confirm the UI says **Test email sent**, not **Submitted**, and the foundation receives nothing.
11. Refresh and resume/replay relevant states to confirm no duplicate email is sent.
12. Turn test mode off and confirm the existing prepare-and-review path is unchanged.

Live verification must use only the built-in synthetic fixture. Real patient information is forbidden in this mode.

## Boundaries

### Always

- Validate the environment gate, run mode, fixture version, active run ownership, inbox ID, artifact ownership, packet type, test-only marking, page limit, and fixed recipient on the server.
- Keep the test badge visible for the whole run.
- Use idempotency/reconciliation around the external send.
- Run focused tests, the full test suite, lint, and build before declaring implementation complete.

### Ask first

- Adding a new dependency.
- Changing AgentMail plans, domains, or DNS.
- Changing the versioned synthetic fixture values or allowing custom fixture input.
- Changing Browserbase recording/retention settings.
- Generalizing the switch to other grants or recipients.

### Never

- Commit credentials or patient documents.
- Read active-patient content into a test packet.
- Make the test recipient configurable from the browser.
- Send this packet to the foundation.
- Apply a signature automatically.
- Treat provider acceptance as proof of Gmail inbox placement.
- Remove or weaken the existing synthetic email-test safeguards.

## Success Criteria

1. With the feature gate disabled, the UI cannot start a test run and crafted requests cannot enable one.
2. With the gate enabled and the switch off, Remember Betty behaves exactly as it does today through `awaiting_patient_review`.
3. With the switch on, the created run permanently records test-email mode and Nicole as its only destination.
4. A real Browserbase session discovers and downloads the current official application PDF.
5. Without questions or uploads, the run fills every reviewed form field from the versioned synthetic fixture and assembles one valid, prominently marked PDF containing the application, generated diagnosis letter, and generated personal note.
6. Packet assembly automatically triggers one and only one AgentMail delivery to Nicole.
7. The sent attachment matches the stored assembled packet by SHA-256.
8. The run stores provider delivery identifiers and displays a durable **Test email sent to Nicole** result.
9. No UI, state, or audit record claims the packet was submitted to Remember Betty.
10. Refreshes, resumes, duplicate worker starts, and ordinary retries do not create duplicate emails.
11. Existing Browserbase/PDF tests, the isolated synthetic AgentMail test, and the normal application workflow continue to pass.
12. Automated tests prove that test mode does not read active-patient profile values, patient answers, or uploaded patient documents as packet content.

## Open Questions

None. Implementation details that do not change these behaviors may be settled during technical planning.
