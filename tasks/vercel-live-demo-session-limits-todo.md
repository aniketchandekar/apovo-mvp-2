# Task Checklist: Vercel Live Demo, Workflows, and Session Limits

Approved spec: `docs/superpowers/specs/2026-10-29-vercel-live-demo-session-limits-design.md`  
Approved plan: `tasks/vercel-live-demo-session-limits-plan.md`

Current status: the local implementation and release gate are complete. One protected Vercel Preview run remains before production promotion.

Rules:

- Complete tasks in dependency order.
- Keep every deployed fixture and workflow input synthetic.
- Keep each task to approximately five files or fewer.
- Run the listed verification before checking a task off.
- Do not configure or print real secret values.
- Do not deploy until the local release gate passes.

## Phase 0 — Foundation

- [x] **VLD01 — Install and configure Vercel Workflows**
  - Depends on: —
  - Files: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`
  - Acceptance: Workflow directives compile; the existing build and local mode remain valid.
  - Verify: `npm run test && npm run lint && npm run build`

- [x] **VLD02 — Add deployment configuration and exclusions**
  - Depends on: VLD01
  - Files: `.env.example`, `.gitignore`, `.vercelignore`, `src/lib/demo-session/config.ts`, `tests/demo-session/config.test.ts`
  - Acceptance: Demo mode and signing secret fail closed; `.data`, environments, PDFs, logs, and test output are excluded.
  - Verify: `npm run test -- tests/demo-session/config.test.ts`

## Phase 1 — Signed session

- [x] **VLD03 — Implement signed session contracts and HMAC verification**
  - Depends on: VLD02
  - Files: `src/lib/demo-session/types.ts`, `src/lib/demo-session/token.ts`, `tests/demo-session/token.test.ts`
  - Acceptance: Versioned 15-minute tokens reject alteration, expiry, bad signatures, and excessive size.
  - Verify: `npm run test -- tests/demo-session/token.test.ts`

- [x] **VLD04 — Implement immutable budget transitions and cookie helpers**
  - Depends on: VLD03
  - Files: `src/lib/demo-session/budget.ts`, `src/lib/demo-session/cookie.ts`, `src/lib/demo-session/responses.ts`, `tests/demo-session/budget.test.ts`
  - Acceptance: Every approved quota and boundary has an off-by-one test; cookie flags are correct.
  - Verify: `npm run test -- tests/demo-session/budget.test.ts`

- [x] **VLD05 — Add session creation and status APIs**
  - Depends on: VLD04
  - Files: `src/app/api/demo/session/route.ts`, `tests/demo-session/session-route.test.ts`
  - Acceptance: Creation returns only the safe summary; status rotates/clears correctly at expiry.
  - Verify: `npm run test -- tests/demo-session/session-route.test.ts`

## Phase 2 — Gemini chat

- [x] **VLD06 — Add session-metered synthetic Gemini chat**
  - Depends on: VLD05
  - Files: `src/app/api/demo/chat/route.ts`, `src/lib/integrations/gemini/demo-chat-service.ts`, `tests/demo-session/demo-chat.test.ts`
  - Acceptance: Ten bounded turns work; turn eleven and oversized prompts never call Gemini; no patient store is read.
  - Verify: `npm run test -- tests/demo-session/demo-chat.test.ts`

- [x] **VLD07 — Surface chat budget in the existing conversation UI**
  - Depends on: VLD06
  - Files: `src/components/demo/DemoSessionProvider.tsx`, `src/components/demo/DemoBudget.tsx`, `src/components/talk/TalkWithApovoView.tsx`, `tests/mobile-ui.test.ts`
  - Acceptance: Countdown and remaining turns are accessible, responsive, and disable correctly.
  - Verify: `npm run test -- tests/mobile-ui.test.ts && npm run lint`

## Phase 3 — Durable workflow

- [x] **VLD08 — Define workflow contracts and safe event stream**
  - Depends on: VLD01, VLD05
  - Files: `workflows/remember-betty-demo.ts`, `workflows/types.ts`, `workflows/events.ts`, `tests/workflows/contracts.test.ts`
  - Acceptance: The orchestrator is deterministic and emits only allowlisted event fields.
  - Verify: `npm run test -- tests/workflows/contracts.test.ts`

- [x] **VLD09 — Add in-memory Browserbase discovery step**
  - Depends on: VLD08
  - Files: `workflows/steps/browser-discovery.ts`, `src/lib/integrations/browserbase/download-bytes.ts`, `tests/workflows/browser-discovery.test.ts`
  - Acceptance: Live URL is streamed safely; validated PDF bytes return; browser cleanup occurs on every outcome.
  - Verify: `npm run test -- tests/workflows/browser-discovery.test.ts`

- [x] **VLD10 — Add in-memory synthetic packet steps**
  - Depends on: VLD09
  - Files: `workflows/steps/build-packet.ts`, `workflows/remember-betty-demo.ts`, `tests/workflows/build-packet.test.ts`
  - Acceptance: The reviewed form is filled with only the versioned fixture and returned as a bounded, hashed packet without filesystem access.
  - Verify: `npm run test -- tests/workflows/build-packet.test.ts`

- [x] **VLD11 — Add workflow start and readable-event APIs**
  - Depends on: VLD08, VLD10
  - Files: `src/app/api/demo/workflows/start/route.ts`, `src/app/api/demo/workflows/[runId]/events/route.ts`, `tests/workflows/workflow-routes.test.ts`
  - Acceptance: Start consumes/binds one workflow allowance; events are replayable only for the bound session.
  - Verify: `npm run test -- tests/workflows/workflow-routes.test.ts`

## Phase 4 — Approval and email

- [x] **VLD12 — Add expiring workflow approval hook**
  - Depends on: VLD10
  - Files: `workflows/remember-betty-demo.ts`, `workflows/approval.ts`, `src/app/api/demo/workflows/[runId]/approve/route.ts`, `tests/workflows/approval.test.ts`
  - Acceptance: Only the bound, unexpired session can consume the one approval; no email occurs first.
  - Verify: `npm run test -- tests/workflows/approval.test.ts`

- [x] **VLD13 — Add zero-retry fixed-recipient AgentMail step**
  - Depends on: VLD12
  - Files: `workflows/steps/send-test-email.ts`, `src/lib/integrations/agentmail/application-test-delivery.ts`, `tests/workflows/send-test-email.test.ts`
  - Acceptance: One provider attempt, fixed recipient, stable client ID, terminal ambiguous outcome, no local persistence.
  - Verify: `npm run test -- tests/workflows/send-test-email.test.ts`

## Phase 5 — Workspace UI

- [x] **VLD14 — Connect application start and durable event state**
  - Depends on: VLD11
  - Files: `src/components/application-agent/StartApplicationButton.tsx`, `src/components/application-agent/useApplicationRun.ts`, `src/components/application-agent/ApplicationWorkspace.tsx`, `tests/mobile-ui.test.ts`
  - Acceptance: Demo mode starts one workflow, restores events after refresh, and preserves local polling outside demo mode.
  - Verify: `npm run test -- tests/mobile-ui.test.ts && npm run lint`

- [x] **VLD15 — Add packet preview and send confirmation UX**
  - Depends on: VLD12, VLD13, VLD14
  - Files: `src/components/demo/DemoPacketPreview.tsx`, `src/components/demo/DemoSendConfirmation.tsx`, `src/components/application-agent/ApplicationWorkspace.tsx`, `tests/mobile-ui.test.ts`
  - Acceptance: Blob URLs are revoked; explicit confirmation is required; completion/uncertain/expired states work on mobile.
  - Verify: `npm run test -- tests/mobile-ui.test.ts && npm run lint`

## Phase 6 — Deployment hardening

- [x] **VLD16 — Deny legacy deployed APIs and add security headers**
  - Depends on: VLD11, VLD13
  - Files: `src/proxy.ts`, `next.config.ts`, `tests/demo-session/deployment-boundary.test.ts`
  - Acceptance: Only approved demo/workflow routes are reachable in demo mode; Browserbase iframe works under CSP.
  - Verify: `npm run test -- tests/demo-session/deployment-boundary.test.ts && npm run build`

- [x] **VLD17 — Add deployment runbook and secret/bundle audit**
  - Depends on: VLD16
  - Files: `docs/VERCEL_DEPLOYMENT.md`, `README.md`
  - Acceptance: Runbook covers Authentication, WAF, Sensitive variables, Fluid Compute, Workflows, spend alerts, preview verification, promotion, and rollback.
  - Verify: inspect `npm run build` output and run repository secret/path scans without printing secret values.

## Phase 7 — Release gate

- [x] **VLD18 — Run full local verification**
  - Depends on: VLD01–VLD17
  - Acceptance: all automated checks pass and no local data appears in build output.
  - Verify: `npm run test && npm run lint && npm run build`
  - Result: 125 tests, lint, Workflow compilation, TypeScript, and the webpack production build pass.

- [ ] **VLD19 — Verify one protected Vercel preview workflow**
  - Depends on: VLD18
  - Acceptance: one authorized synthetic run completes and one email arrives; repeat actions are refused; anonymous access is blocked.
  - Verify: manual protected-preview checklist in `docs/VERCEL_DEPLOYMENT.md`.
