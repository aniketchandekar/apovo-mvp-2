# Implementation Plan: Remember Betty Synthetic Test Mode

Date: 2026-10-28  
Status: Implemented; interactive/live verification pending  
Approved specification: `docs/superpowers/specs/2026-10-28-remember-betty-test-mode-design.md`

## Outcome

Add a developer-gated switch that starts an immutable synthetic Remember Betty test run. The run uses the real Browserbase discovery/download path, fills the downloaded application exclusively from a versioned fake applicant fixture, generates fake supporting documents, assembles one visibly test-only PDF, and sends it automatically through AgentMail only to `nicole.wu.mail@gmail.com`.

Normal application runs remain unchanged and continue to pause for patient input and review. Test runs never read patient profile values, patient answers, or uploaded patient documents, and never claim foundation submission.

## Current State

- Browserbase/Stagehand discovery and PDF download are already implemented through the application-run worker.
- The reviewed Remember Betty PDF template, field map, PDF filler, supporting-document assembly, private artifact storage, workspace, and activity feed already exist.
- Normal runs currently branch from PDF inspection into care-email provisioning, field mapping, patient input, filling, assembly, and `awaiting_patient_review`.
- AgentMail supports drafts, PDF attachments, and sending. An isolated live email test already hard-locks Nicole but generates unrelated synthetic PDFs.
- Application runs do not yet record a delivery mode, synthetic fixture version, or AgentMail delivery evidence.
- `AppShell` owns the persistent top header, while `ApplicationWorkspace` has a separate full-screen header.
- The repository uses Node's built-in test runner compiled by `tsconfig.test.json`; no browser component-test framework is installed.

## Technical Decisions

### Run identity and capability gate

- Add `APOVO_APPLICATION_TEST_MODE=0|1`; keep it independent of `APOVO_EMAIL_TEST_MODE`.
- Expose only a boolean capability through a small server endpoint or existing safe dashboard response.
- Capture `delivery_mode: 'test_email'`, the fixed recipient, and fixture version when a run is created.
- Treat legacy runs with no delivery mode as `prepare_only`.
- Reject an attempt to reuse an active run with a different mode using `409`; the UI offers an explicit restart in the selected mode.
- Never accept fixture data or a destination from the client.

### UI state

- Add one client `TestModeProvider` near the root layout so `AppShell` and every `StartApplicationButton` share the same value.
- Store the user's switch preference in `sessionStorage` only after the server reports that the capability is enabled.
- The preference affects only future run creation. The workspace badge reads persisted run metadata, never client storage.
- The top header displays **Test mode · fake data · sends only to Nicole** while enabled.

### Synthetic packet construction

- Add a versioned server-only fixture that contains every reviewed form value and both supporting-document texts.
- Test mode branches immediately after `inspecting_pdf`; it does not enter care-email provisioning, required-input mapping, uploads, or review.
- Reuse the reviewed PDF template and `fillRememberBettyApplication` with fixture values.
- Generate one-page diagnosis and personal-note PDFs through `pdf-lib`, with conspicuous synthetic labels.
- Apply a visible **TEST ONLY — NOT A REAL APPLICATION** marking to the filled form or assembled packet.
- Assemble the filled form, diagnosis letter, and personal note into one packet and enforce the existing eight-page maximum.
- Keep the packet unsigned.

### AgentMail delivery and idempotency

- Add a dedicated server-only application-test delivery service; do not broaden the isolated `runCareEmailIntegrationTest` contract.
- Always send from `AGENTMAIL_INBOX_ID` and always send to the server constant `nicole.wu.mail@gmail.com`.
- Create the draft with deterministic client ID `apovo-rb-test-${run.id}` and persist the draft ID before sending.
- Persist `delivery_attempted_at` before the external send.
- Persist the confirmed message/thread IDs and sent timestamp after success.
- If a provider response definitively rejects the send, fail the run. If the request outcome is ambiguous, transition to `test_email_delivery_uncertain` and prohibit automatic resume/resend.
- If a confirmed message ID already exists, return recorded success without another external call.

### Status semantics

- Add terminal `test_email_sent` and manual-review `test_email_delivery_uncertain` phases.
- Keep the parent application in `Drafting`; derive test delivery status from its latest run.
- UI language is **Test email sent to Nicole**, never **Submitted**.

## Dependency Graph

```text
contracts-and-policy
        |
        +----> synthetic-packet
        |
        +----> run-creation-and-capability ----> test-mode-ui
        |
        +----> agentmail-test-delivery
                         |
synthetic-packet --------+----> worker-integration ----> hardening-and-live-check
run-creation-and-capability ----+
```

After the shared contracts are complete, synthetic packet construction, run/capability plumbing, and AgentMail delivery can be implemented independently. Worker integration depends on all three. UI depends on the run API contract but can proceed in parallel with packet/delivery modules.

## Implementation Phases

### Phase 1 — Contracts, fixture, and transition policy

Purpose: define the immutable safety boundary before adding UI or external sends.

Work:

- Extend application-run types with delivery mode, fixture version, fixed test recipient, delivery timestamps, and AgentMail identifiers.
- Add phases/states for synthetic loading/filling/document generation/assembly, sending, sent, and uncertain delivery.
- Map `test_email_sent` to a distinct terminal state and `test_email_delivery_uncertain` to non-resumable manual review.
- Add a pure policy helper that validates environment gate, Remember Betty-only scope, delivery mode, fixed recipient, and legacy defaults.
- Add the versioned fixture with a complete value map and obviously fictional identity/medical/financial content.
- Update the test TypeScript include list for all new server-only modules.

Checkpoint:

- The state machine accepts only the documented normal and test branches.
- No test-mode transition can enter `waiting_for_patient`, `awaiting_patient_review`, `packet_ready`, or a submitted state.
- No client input can influence recipient or fixture values.

Verification:

```bash
npm test
npm run lint
```

### Phase 2 — Safe run creation and capability exposure

Purpose: capture test intent once and prevent mode changes during a run.

Work:

- Extend `RunRepository.createOrGet` with a server-validated creation options object.
- Default existing/legacy runs to `prepare_only` when read.
- Validate `testMode` in the run-start route against the environment gate and Remember Betty resource.
- Assign the recipient and fixture version on the server.
- Return `409` with the existing run ID/mode when the requested mode conflicts with an active run.
- Add a safe capability boolean for the client.
- Add environment documentation to `.env.example` and README.

Checkpoint:

- A crafted request cannot enable test mode when the environment gate is off.
- Repeated starts in the same mode return the same run.
- A mode mismatch never mutates or silently restarts the active run.
- Restart creates a new run ID with the requested validated mode.

Verification:

```bash
npm test
npm run build
```

### Phase 3A — Synthetic packet builder

Purpose: create a complete packet without touching patient data or waiting for input.

Work:

- Add pure fixture-to-field-map conversion with an assertion that all reviewed template fields are populated.
- Fill the exact downloaded source artifact using the existing reviewed template.
- Generate synthetic diagnosis-letter and personal-note PDFs with test-only headings.
- Add the test-only marking to the application/packet without obscuring form values.
- Assemble all three documents and validate PDF type, page count, checksum, and eight-page maximum.
- Store the result as a distinct synthetic test-packet artifact associated with the run.

Checkpoint:

- Packet generation requires only source PDF bytes and the built-in fixture.
- The active patient's profile/answers/uploads are not accepted as function inputs.
- The resulting PDF contains all three documents and visible test labeling.
- Fixture and packet output are deterministic apart from explicitly controlled application date metadata.

Verification:

```bash
npm test -- tests/application-agent/remember-betty-test-packet.test.ts
npm run lint
```

### Phase 3B — AgentMail application-test delivery

Purpose: enforce the only-recipient rule and make sending restart-safe.

Work:

- Build the dedicated delivery service around existing draft, attachment, and send APIs.
- Resolve the sending inbox only from `AGENTMAIL_INBOX_ID`.
- Validate run mode, feature gate, fixture version, packet ownership/type/page limit/test marking, and recipient constant immediately before draft creation.
- Encode the stored packet bytes as the only attachment.
- Persist draft ID and attempted timestamp before sending.
- Persist confirmed provider IDs on success and save a test-labeled outbound email record.
- Classify definitive versus ambiguous failures and prevent automatic resend after uncertainty.
- Add fake-provider tests for recipient substitution, byte equality, duplicate entry, rejection, timeout, and post-send persistence failure.

Checkpoint:

- All successful fake-provider calls target exactly Nicole and attach bytes matching the packet SHA-256.
- Re-entering a confirmed delivery performs no provider call.
- Re-entering an attempted-but-unconfirmed delivery stops for reconciliation.
- No test email changes follow-up or foundation-submission state.

Verification:

```bash
npm test -- tests/application-agent/application-test-delivery.test.ts
npm run lint
```

### Phase 4 — Worker integration and durable status

Purpose: connect the real download, synthetic packet, and automatic delivery into one resumable flow.

Work:

- Add focused test-mode phase handlers rather than expanding normal patient-input handlers.
- Branch from `inspecting_pdf` using persisted `delivery_mode`.
- Advance through synthetic fill, document generation, packet assembly, and send phases.
- Persist artifacts and public-safe events after every phase.
- Add success and uncertainty displays to run state and workspace data.
- Ensure the worker treats sent as terminal and uncertainty as paused/manual review.

Checkpoint:

- A synthetic test run proceeds from inspected PDF to sent without creating required inputs.
- Worker restarts before send resume safely; restarts after attempted send do not duplicate delivery.
- Normal runs still follow the existing care-email/patient-input/review path.
- The final packet remains previewable/downloadable after delivery.

Verification:

```bash
npm test -- tests/application-agent/test-mode-worker.test.ts
npm test -- tests/application-agent/worker.test.ts tests/application-agent/state-machine.test.ts
```

### Phase 5 — Top switch and workspace treatment

Purpose: make test intent obvious and pass it to run creation without making the client authoritative.

Work:

- Add `TestModeProvider` and safe capability loading near the root app layout.
- Add the accessible switch and warning treatment to `AppShell`'s top header.
- Update `StartApplicationButton` to send the current boolean and handle mode-mismatch `409` with an explicit restart action.
- Update the full-screen workspace header/status map with immutable **TEST RUN**, fake-data, recipient, sent, and uncertain states from the run response.
- Verify responsive/mobile layout and keyboard/screen-reader labeling.

Checkpoint:

- The switch is absent or disabled when the server gate is off.
- Refresh/navigation preserves only the preference; it cannot alter an existing run.
- A test workspace remains labeled after session storage is cleared.
- No UI allows recipient or fixture editing.

Verification:

```bash
npm run lint
npm run build
```

Manual UI checks cover the switch because the repository does not currently include a component-test framework; no new test dependency is needed for this feature.

### Phase 6 — Regression hardening and live end-to-end test

Purpose: prove the safety boundaries and execute the requested real integration once.

Work:

- Add regression tests proving normal runs are unchanged.
- Add negative tests that seed distinctive active-patient values/uploads and assert they never appear in the test packet.
- Add duplicate-worker and process-interruption tests around draft creation/send.
- Run full unit/integration, lint, and production build checks.
- Start locally with the application-test gate, Browserbase, AgentMail, and configured inbox.
- Run through the UI without providing any answers/uploads.
- Inspect the stored packet and confirm Nicole receives exactly one email with the correct combined PDF.
- Confirm foundation addresses never appear in the outbound request or saved email record.

Final automated verification:

```bash
npm test
npm run test:integration
npm run lint
npm run build
```

Live acceptance:

1. Turn on the visible switch.
2. Start Remember Betty.
3. Observe the real Browserbase session discover/download the official PDF.
4. Confirm the run asks no questions and requires no uploads.
5. Preview the combined, unsigned, prominently test-only packet.
6. Confirm AgentMail records one send only to Nicole.
7. Have Nicole confirm Gmail receipt and PDF readability.
8. Refresh/resume and confirm no duplicate email.
9. Turn the switch off and confirm a normal run still waits for patient input/review.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Accidental foundation delivery | Recipient exists once as a server constant; reject client destination fields; assert outbound `to` immediately before send. |
| Patient data leaks into test packet | Synthetic builder accepts no patient object/input artifacts; negative tests seed unique patient markers and scan output/extracted text. |
| Duplicate email after interruption | Deterministic draft client ID, persist draft/attempt before send, confirmed-ID short circuit, uncertain state blocks automatic resend. |
| Test switch changes an in-progress run | Persist immutable mode at creation; workspace reads run metadata only. |
| Unrecognized foundation PDF | Existing checksum/template review sends the run to manual review before synthetic fill. |
| Test packet mistaken for a real application | Test-only marks on documents, unsigned packet, test email subject/body, distinct terminal state, no `Submitted` transition. |
| Existing normal flow regresses | Separate phase handlers plus branch/legacy regression tests. |

## Completion Definition

Implementation is complete only when every checklist item in `tasks/remember-betty-test-mode-todo.md` is checked, all automated commands pass, the normal workflow regression passes, and Nicole confirms receipt of exactly one readable synthetic test packet from a real Browserbase-derived application PDF.
