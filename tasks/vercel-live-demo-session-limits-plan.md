# Implementation Plan: Vercel Live Demo, Workflows, and Session Limits

Date: 2026-10-29  
Status: Approved  
Approved specification: `docs/superpowers/specs/2026-10-29-vercel-live-demo-session-limits-design.md`

## Outcome

Deploy an invite-only, database-free Apovo demo on Vercel where an authorized reviewer can:

1. Start a 15-minute signed demo session.
2. Use Gemini for at most ten chat turns.
3. Launch one durable Vercel Workflow.
4. Watch one real Browserbase session discover the current Remember Betty PDF.
5. Watch Apovo fill the PDF and assemble a synthetic packet.
6. Review the packet and explicitly approve one email attempt.
7. Send only to the existing fixed Nicole test recipient through AgentMail.

The Vercel deployment never reads or writes `.data`. Vercel Workflows owns temporary synthetic run state and events; no user-managed database or object store is created.

## Architecture

```text
Vercel Authentication
        |
        v
15-minute signed HttpOnly session cookie <---- Vercel WAF/IP ceiling
        |
        +---- /api/demo/chat ----> Gemini (10 turns)
        |
        +---- /api/demo/workflows/start
                         |
                         v
               Vercel Workflow run
               ├─ Browserbase discovery step
               ├─ in-memory synthetic PDF/packet step
               ├─ durable event stream ─────> workspace UI
               ├─ approval hook <─────────── explicit user confirmation
               └─ non-retrying AgentMail step ──> fixed recipient
```

The existing localhost `.data` worker remains available when Vercel demo mode is disabled. The production demo path does not call `ApovoStore`, `RunRepository`, or `localArtifactStore`.

## Technical decisions

### Runtime mode

- Add `APOVO_DEPLOYMENT_MODE=vercel_demo` as an explicit server-side switch.
- Add `APOVO_DEMO_SESSION_SECRET` for HMAC signing.
- In demo mode, route the existing test-mode start interaction to the durable workflow path.
- Deny legacy mutation, upload, webhook, reset, patient, inbox, and local-run APIs in the deployed demo.
- Preserve local behavior when the deployment mode is absent.

### Signed session

- Use a compact versioned payload containing session ID, issued/expiry timestamps, sequence, remaining chat turns, workflow allowance, packet allowance, send allowance, retry allowance, and optional bound workflow run ID.
- Sign with HMAC-SHA-256 using a server-only 32-byte-or-longer secret.
- Set a `HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/`, 15-minute cookie.
- Validate the signature with constant-time comparison and reject malformed, expired, wrong-version, or oversized tokens.
- Rotate the token after every metered action.
- Do not place chat text, applicant data, provider IDs, packet bytes, or URLs in the cookie.

### Durable workflow

- Install the stable `workflow` package and wrap `next.config.ts` with `withWorkflow()`.
- Use the managed Vercel World in deployed environments and the local World for development/tests.
- Keep the workflow orchestrator deterministic; all network, PDF, Browserbase, AgentMail, and cryptographic side effects live in `"use step"` functions.
- Emit only safe, synthetic progress events through the workflow durable stream.
- Bind the workflow run ID into the newly rotated signed session immediately after `start()` succeeds.
- Expire the approval hook at the original session deadline.

### Browserbase and packet handling

- Run Browserbase launch, live-view publication, site inspection, PDF download, and cleanup inside one durable step so non-serializable Stagehand/browser handles never cross a step boundary.
- Refactor the existing Browserbase download path to offer an in-memory byte result instead of requiring `localArtifactStore`.
- Always close Browserbase in `finally` and keep session recording/logging disabled.
- Pass PDF data between workflow steps as validated base64 plus SHA-256 and byte metadata.
- Reuse the existing pure synthetic form-fill, supporting-document, and packet-assembly functions.
- Enforce PDF magic bytes, reviewed template checksum, page limit, and the approved packet-size limit before persisting step output.
- Create a browser `Blob` URL for preview and revoke it when the workspace unmounts; do not create a public artifact URL.

### AgentMail safety

- Split the current delivery helper into a reusable stateless synthetic-delivery core and the existing local repository adapter.
- The workflow email step accepts packet bytes and run metadata only; the recipient remains a server constant.
- Set `sendSyntheticPacket.maxRetries = 0`.
- Use the workflow step ID as the stable AgentMail `clientId`/idempotency value.
- Treat ambiguous outcomes as terminal and never automatically retry them.
- Persist provider IDs only as workflow step output for the confirmation screen and reconciliation.

### Gemini chat

- Meter before calling Gemini and reject prompts above 2,000 characters.
- Key the existing ADK in-memory runner by the signed session ID, never by a client-provided session ID.
- Use only the synthetic demo fixture/context in deployed demo mode; do not read `ApovoStore`.
- Treat runner memory as best-effort across serverless invocations. Chat transcripts remain browser-local and synthetic.
- Return the rotated safe budget summary with every response.

### UI

- Add a demo-session provider that creates/refreshes the safe session summary, maintains the local countdown, and exposes remaining budgets.
- Add a persistent synthetic-demo warning and compact countdown/usage indicator to the shell.
- Update chat to show remaining turns, handle `429`, and disable at zero/expiry.
- Update the application start control to consume the single workflow allowance and navigate using the Vercel workflow run ID.
- Replace polling with the workflow durable event stream in Vercel demo mode; retain existing polling locally.
- Render the Browserbase live URL only while its safe event is active.
- Pause at packet review and show an explicit one-send confirmation sheet before resuming the approval hook.
- Make expiration, consumed limits, ambiguous delivery, and completed delivery visually distinct on desktop and mobile.

## Dependency graph

```text
workflow-foundation
       |
       +----> signed-session ----> demo-session-api ----> UI budget shell
       |
       +----> workflow-steps ----> durable-run-api ----> live workspace
                                      |                       |
                                      v                       v
                               approval + email -------> confirmation UI
       |
       +----> demo-route-boundary ----> deployment hardening
```

## Implementation phases

### Phase 0 — Workflow and deployment foundation

Work:

- Install `workflow` and wrap the Next.js configuration with `withWorkflow()`.
- Add the Workflow TypeScript plugin if supported by the installed stable version.
- Add explicit deployment-mode and signing-secret configuration validation.
- Ignore the complete `.data/` tree and add `.vercelignore` for `.data`, environment files, local test output, logs, and generated PDFs.
- Document the new non-secret variables in `.env.example` without values.

Checkpoint:

```bash
npm run test
npm run lint
npm run build
```

Acceptance:

- Existing local tests still pass with demo mode off.
- The Next build detects workflow directives.
- No local state, PDF, or environment file enters the Vercel source bundle.

### Phase 1 — Signed 15-minute session budget

Work:

- Implement versioned session types, defaults, safe public summary, signing, verification, expiry, and immutable budget transitions.
- Implement shared cookie helpers and structured `401`/`429` errors.
- Add session creation/status/expiry Route Handlers.
- Add deterministic clock and secret injection for tests.

Verification:

- Modified payloads, signatures, versions, and expiries are rejected.
- The eleventh chat, second workflow, third retry, second packet, and second email attempt are rejected.
- Cookie flags and 15-minute expiry are correct.
- No sensitive value appears in the public summary.

### Phase 2 — Safe Gemini demo chat

Work:

- Add the demo-mode Gemini route adapter.
- Remove trust in client-provided chat session IDs in demo mode.
- Add the prompt-length gate and consume a turn before the provider call.
- Use static synthetic context instead of patient/store context.
- Return the updated budget and display remaining turns in the chat UI.

Verification:

- Ten turns succeed with provider fakes and turn eleven returns `429`.
- Empty/oversized prompts do not invoke Gemini.
- Demo chat never imports or calls `ApovoStore`.
- The chat stays usable and legible on mobile at zero, expired, loading, and error states.

### Phase 3 — Durable Browserbase and packet workflow

Work:

- Create the deterministic workflow orchestrator and typed safe event stream.
- Create a Browserbase step that publishes the live URL, discovers/downloads the PDF to memory, and closes the session.
- Create packet steps that validate, fill, generate supporting documents, assemble, hash, and size-check the synthetic packet without filesystem storage.
- Add retry classification: bounded retries for eligible discovery/fill failures and fatal errors for validation/configuration failures.
- Return packet preview data through the managed workflow result/event stream.

Verification:

- Workflow replay skips completed steps.
- Browserbase closes on success, failure, expiry, and cancellation.
- Real-patient sentinel values never appear in workflow inputs, outputs, events, or packet text.
- The packet passes the existing fixture and PDF assertions.
- No step imports `RunRepository`, `ApovoStore`, or `localArtifactStore`.

### Phase 4 — Human approval and one email attempt

Work:

- Add a workflow approval hook with the original session deadline.
- Add a session-bound approval Route Handler.
- Add the confirmation sheet and disable it after consumption.
- Implement the zero-retry AgentMail workflow step with the fixed recipient and stable step/client ID.
- Classify confirmed success, definitive failure, ambiguous delivery, rejection, and expiration.

Verification:

- No email occurs before explicit approval.
- A foreign, expired, or mismatched session cannot resume the hook.
- Replaying the approval request does not rerun a completed email step.
- The send step makes only one provider attempt in every test.
- No client request can alter sender, recipient, subject policy, or attachment metadata.

### Phase 5 — Live workspace and mobile session UI

Work:

- Add the demo-session provider, warning banner, countdown, and usage display.
- Start the workflow from the existing application interaction in demo mode.
- Read/replay workflow events across refresh and map them to the existing activity rail.
- Integrate Browserbase live view, packet preview, approval, completion, and uncertain-delivery states.
- Preserve the existing responsive full-screen Browserbase experience and sticky mobile controls.

Verification:

- Refresh reconstructs the activity timeline from the workflow stream.
- The Browserbase pane appears while live and disappears after cleanup.
- Packet preview uses a revocable local Blob URL.
- The 15-minute countdown and all remaining budgets are understandable at 320 px width.
- Expired sessions cannot start or resume work.

### Phase 6 — Deployment boundary and security hardening

Work:

- Add a Next.js 16 `proxy.ts` demo-mode allowlist for the demo pages, required static assets, workflow infrastructure endpoints, and approved `/api/demo/*` handlers.
- Return `404` for legacy mutations, uploads, webhooks, reset routes, local application runs, test-email routes, patient routes, inbox routes, and arbitrary artifact routes in demo mode.
- Add restrictive security headers and an explicit Browserbase `frame-src` allowlist.
- Ensure production source maps remain disabled and logs redact session/provider data.
- Create a Vercel deployment checklist covering Authentication, WAF, Sensitive variables, Fluid Compute, Workflow observability, spend alerts, and rollback.

Verification:

- API enumeration confirms only approved demo endpoints are reachable.
- Incognito access without Vercel authorization is blocked.
- Build output contains no `.env`, `.data`, PDF artifacts, local patient JSON, or known secret patterns.
- Browserbase iframe works under the final CSP.
- WAF returns `429` before an excess expensive request reaches application code.

### Phase 7 — End-to-end release gate

Run:

```bash
npm run test
npm run lint
npm run build
```

Then deploy a protected preview and execute exactly one live synthetic workflow.

Acceptance:

- Gemini interaction, Browserbase live view, PDF filling, packet review, explicit approval, and one AgentMail delivery all complete.
- Nicole receives one clearly synthetic packet.
- A second workflow/email attempt is refused for the same session.
- The workflow is visible in Vercel observability without secrets, real patient data, or full signed cookies.
- Browserbase, Workflow, AgentMail, and Vercel spend/usage remain within configured limits.
- The exact verified preview can be promoted or rolled back without rebuilding.

## Risks and mitigations

- **Workflow observability retains step inputs/outputs:** allow only synthetic inputs, safe events, and packet bytes; never feed real profile data into the workflow.
- **Automatic retries duplicate email:** set the delivery step to zero retries, use a stable provider client ID, and make ambiguous outcomes terminal.
- **Stagehand handles cannot cross durable boundaries:** keep launch through cleanup inside one step and stream only the safe live URL.
- **Packet output is too large:** enforce the size ceiling before workflow persistence and keep the current test packet well below provider/platform limits.
- **Signed-cookie replay starts extra work:** bind one run ID into the cookie, use workflow one-way transitions, require Vercel Authentication, and apply the WAF ceiling.
- **Legacy API remains reachable:** use a deny-by-default production allowlist and verify through route enumeration.
- **Workflow package/Next 16 integration changes:** pin the stable package version and follow the installed package plus Next 16 documentation rather than older examples.

## Review checkpoint

Approve this plan before implementation. The first code change will be Phase 0; each later phase will run its task-specific tests before proceeding.
