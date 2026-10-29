# Task Checklist: Remember Betty Synthetic Test Mode

Approved spec: `docs/superpowers/specs/2026-10-28-remember-betty-test-mode-design.md`  
Plan: `tasks/remember-betty-test-mode-plan.md`

Execution rules:

- Complete tasks in dependency order unless parallel work is explicitly noted.
- Do not use real patient data, answers, or uploads.
- Keep each task focused to approximately five files or fewer.
- Run the listed verification before checking a task off.
- Never send to any address other than `nicole.wu.mail@gmail.com`.
- Do not perform the live send until all fake-provider tests and the production build pass.

## Phase 1 — Contracts and fixture

- [x] **TM01 — Add delivery-mode contracts and metadata**
  - Depends on: —
  - Files: `src/lib/application-agent/types.ts`, `src/lib/types.ts`, `tests/application-agent/types.test.ts`, `tsconfig.test.json`
  - Acceptance: legacy runs default to `prepare_only`; test runs can persist fixture/delivery evidence; no submitted state is introduced.
  - Verify: `npm test`

- [x] **TM02 — Extend transition and worker pause policies**
  - Depends on: TM01
  - Files: `src/lib/application-agent/state-machine.ts`, `src/lib/application-agent/worker.ts`, `tests/application-agent/state-machine.test.ts`, `tests/application-agent/worker.test.ts`
  - Acceptance: only approved test transitions succeed; sent is terminal; uncertain delivery cannot auto-resume.
  - Verify: `npm test -- tests/application-agent/state-machine.test.ts tests/application-agent/worker.test.ts`

- [x] **TM03 — Add versioned synthetic Remember Betty fixture**
  - Depends on: TM01
  - Files: `src/lib/application-agent/test-fixtures/remember-betty.ts`, `tests/application-agent/remember-betty-test-fixture.test.ts`, `tsconfig.test.json`
  - Acceptance: every reviewed PDF field has an obviously fictional value; fixture is immutable/versioned; no client override API exists.
  - Verify: `npm test -- tests/application-agent/remember-betty-test-fixture.test.ts`

## Phase 2 — Run creation and capability

- [x] **TM04 — Add server-side test-mode policy**
  - Depends on: TM01, TM03
  - Files: `src/lib/application-agent/test-mode-policy.ts`, `tests/application-agent/test-mode-policy.test.ts`, `tsconfig.test.json`
  - Acceptance: gate, grant scope, recipient, fixture version, and legacy defaults are enforced by pure server policy.
  - Verify: `npm test -- tests/application-agent/test-mode-policy.test.ts`

- [x] **TM05 — Persist immutable mode during run creation**
  - Depends on: TM04
  - Files: `src/lib/application-agent/run-repository.ts`, `src/app/api/applications/[id]/runs/route.ts`, `tests/application-agent/run-repository.test.ts`
  - Acceptance: same-mode requests reuse; mismatched-mode requests return conflict; explicit restart creates a new correctly scoped run.
  - Verify: `npm test -- tests/application-agent/run-repository.test.ts`; `npm run build`

- [x] **TM06 — Expose capability and document configuration**
  - Depends on: TM04
  - Files: `src/app/api/dashboard/route.ts` or a dedicated capability route, `.env.example`, `README.md`
  - Acceptance: client receives one boolean only; both test flags are documented as independent; configured sending inbox requirement is explicit.
  - Verify: `npm run lint`; `npm run build`

## Phase 3A — Synthetic packet

- [x] **TM07 — Build synthetic supporting documents** *(parallel with TM05–TM06 after TM03)*
  - Depends on: TM03
  - Files: `src/lib/pdf/render-synthetic-test-documents.ts`, `tests/application-agent/render-synthetic-test-documents.test.ts`, `tsconfig.test.json`
  - Acceptance: one-page diagnosis letter and personal note are valid PDFs and visibly labeled synthetic/test-only.
  - Verify: `npm test -- tests/application-agent/render-synthetic-test-documents.test.ts`

- [x] **TM08 — Build and validate synthetic application packet**
  - Depends on: TM03, TM07
  - Files: `src/lib/pdf/build-remember-betty-test-packet.ts`, `src/lib/application-agent/types.ts`, `tests/application-agent/remember-betty-test-packet.test.ts`, `tsconfig.test.json`
  - Acceptance: all reviewed fields are filled from fixture; packet contains three documents, test marking, no signature, at most eight pages; output has a stored checksum.
  - Verify: `npm test -- tests/application-agent/remember-betty-test-packet.test.ts`

## Phase 3B — AgentMail delivery

- [x] **TM09 — Add fixed-recipient delivery service** *(parallel with TM07–TM08 after TM04)*
  - Depends on: TM04
  - Files: `src/lib/integrations/agentmail/application-test-delivery.ts`, `tests/application-agent/application-test-delivery.test.ts`, `tsconfig.test.json`
  - Acceptance: only configured inbox → Nicole is possible; packet is the only attachment; bytes match stored SHA-256; provider errors are typed.
  - Verify: `npm test -- tests/application-agent/application-test-delivery.test.ts`

- [x] **TM10 — Add durable delivery attempt/idempotency handling**
  - Depends on: TM05, TM09
  - Files: `src/lib/integrations/agentmail/application-test-delivery.ts`, `src/lib/application-agent/run-repository.ts`, `tests/application-agent/application-test-delivery.test.ts`
  - Acceptance: draft/attempt persist before send; confirmed delivery short-circuits; attempted/unconfirmed delivery becomes uncertain and cannot resend automatically.
  - Verify: `npm test -- tests/application-agent/application-test-delivery.test.ts tests/application-agent/run-repository.test.ts`

## Phase 4 — Worker integration

- [x] **TM11 — Add synthetic test phase handlers**
  - Depends on: TM02, TM05, TM08, TM10
  - Files: `src/lib/application-agent/phases/test-mode-handlers.ts`, `src/lib/application-agent/phases/initial-handlers.ts`, `src/lib/application-agent/phases/pdf-handlers.ts`, `tests/application-agent/test-mode-worker.test.ts`, `tsconfig.test.json`
  - Acceptance: inspected test runs bypass patient phases, build packet, send once, and terminate sent/uncertain correctly; normal branch is unchanged.
  - Verify: `npm test -- tests/application-agent/test-mode-worker.test.ts tests/application-agent/worker.test.ts`

- [x] **TM12 — Save test email audit record without submission state**
  - Depends on: TM10, TM11
  - Files: `src/lib/integrations/agentmail/application-test-delivery.ts`, `src/lib/store.ts`, `tests/application-agent/application-test-delivery.test.ts`
  - Acceptance: outbound record uses test labels/classification; parent application stays `Drafting`; no follow-up or submitted state is created.
  - Verify: `npm test -- tests/application-agent/application-test-delivery.test.ts`

## Phase 5 — UI

- [x] **TM13 — Add shared test-mode provider**
  - Depends on: TM06
  - Files: `src/components/application-test/TestModeContext.tsx`, `src/app/layout.tsx`
  - Acceptance: server capability controls availability; session storage preserves preference only; default is off.
  - Verify: `npm run lint`; `npm run build`

- [ ] **TM14 — Add top-header switch** *(implemented; interactive desktop/mobile check pending)*
  - Depends on: TM13
  - Files: `src/components/dashboard/AppShell.tsx`
  - Acceptance: accessible switch clearly says fake data and Nicole; responsive header remains usable; no recipient editing exists.
  - Verify: `npm run lint`; `npm run build`; manual desktop/mobile keyboard check

- [ ] **TM15 — Start/restart runs in selected mode** *(implemented; interactive conflict check pending)*
  - Depends on: TM05, TM13
  - Files: `src/components/application-agent/StartApplicationButton.tsx`
  - Acceptance: request sends only `testMode`; mismatch shows explicit restart action; selected mode cannot alter an existing run.
  - Verify: `npm run lint`; `npm run build`; manual normal/test mismatch check

- [ ] **TM16 — Label test workspace and delivery outcomes** *(implemented; interactive refresh check pending)*
  - Depends on: TM11
  - Files: `src/components/application-agent/ApplicationWorkspace.tsx`, `src/components/application-agent/PdfPacketPreview.tsx`, `src/components/application-agent/useApplicationRun.ts`
  - Acceptance: workspace reads persisted mode; shows test/fake-data/Nicole throughout; displays sent or uncertain without saying submitted; packet remains previewable.
  - Verify: `npm run lint`; `npm run build`; manual refresh/session-storage-clear check

## Phase 6 — Regression and live verification

- [x] **TM17 — Prove patient-data isolation and normal-flow regression**
  - Depends on: TM11, TM12
  - Files: `tests/application-agent/test-mode-worker.test.ts`, `tests/application-agent/pdf-pipeline.test.ts`, `tests/application-agent/state-machine.test.ts`
  - Acceptance: unique patient markers and uploads never appear in test packet; normal run still waits for inputs/review; no foundation address appears in test delivery.
  - Verify: `npm test`

- [x] **TM18 — Run final automated quality gates**
  - Depends on: TM14–TM17
  - Files: none unless a failure requires an in-scope correction
  - Acceptance: full suite, integration alias, lint, and production build pass.
  - Verify: `npm test`; `npm run test:integration`; `npm run lint`; `npm run build`

- [ ] **TM19 — Execute one guarded live end-to-end send**
  - Depends on: TM18
  - Files: no source changes expected
  - Acceptance: real Browserbase discovers/downloads; no questions/uploads; one test-only combined PDF is sent exactly once only to Nicole; Nicole confirms receipt/readability; UI never says submitted.
  - Verify: manual live acceptance steps in `tasks/remember-betty-test-mode-plan.md`
