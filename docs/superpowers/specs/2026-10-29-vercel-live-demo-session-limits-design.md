# Design and Specification: Database-Free Live Demo Session Limits

Date: 2026-10-29  
Status: Approved  
Target: Invite-only Vercel MVP

## Objective

Deploy the existing synthetic Remember Betty workflow on Vercel while keeping Gemini chat, the Browserbase live browser, PDF form filling, and AgentMail delivery interactive. Each authorized visitor receives one short-lived demo session with a fixed resource budget. The deployment stores no patient profiles, application records, artifacts, or usage counters in a database.

Success means an invited reviewer can watch Apovo use AI to prepare the fictional application and send one synthetic test packet to the single server-owned recipient, while ordinary refreshes, altered browser requests, and accidental clicks cannot create unlimited AI, browser, or email usage.

## Decisions and Assumptions

1. Vercel Authentication protects every preview and production URL.
2. Every applicant, supporting document, and form value is synthetic and code-owned.
3. The AgentMail recipient remains a server constant; no request accepts a recipient address.
4. The deployment uses Gemini, Browserbase, and AgentMail credentials stored only as Vercel Sensitive environment variables.
5. There is no user-managed application database, Vercel Blob store, or Redis instance. Vercel Workflows provides managed, encrypted durability for synthetic run state, step results, approval hooks, and the event stream.
6. Session limits are carried in a signed, short-lived, `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The browser cannot read or edit the budget.
7. Vercel WAF supplies the outer IP-based request ceiling. The application cookie supplies the finer per-session budget, and the workflow run enforces one-time workflow, packet, and email transitions.
8. AgentMail delivery is a non-retrying workflow step. A stable workflow step ID/client ID is used as the provider idempotency key where supported, and ambiguous delivery outcomes are terminal pending manual reconciliation.
9. The existing local `.data` repository is not used by the Vercel demo path.

## Session Budget

Every session has these server-authoritative limits:

| Resource | Limit |
|---|---:|
| Session lifetime | 15 minutes |
| Browserbase idle time | 3 minutes |
| Gemini chat turns | 10 |
| Browserbase workflows | 1 |
| Failed form-step retries | 2 |
| Generated submission packets | 1 |
| AgentMail send attempts | 1 |
| Combined attachment bytes | 5 MB |
| User prompt length | 2,000 characters |

The UI displays remaining chat turns, workflow availability, email availability, and session expiration. Exhausted actions become disabled and the server returns `429` with a safe structured error. A new session cannot be created merely by deleting the cookie because the Vercel WAF also limits expensive endpoints by source IP.

## Approaches Considered

### A. Vercel Workflows plus signed session budget and WAF — selected

Vercel Workflows owns the durable synthetic run, step outputs, approval hook, and replayable event stream. The server signs the session budget and returns an updated token after each successful metered action. Vercel rate-limits session creation and expensive API requests by IP.

This preserves the no-user-managed-database constraint, survives refreshes and deployments, and makes completed steps replay-safe. A stale signed token can theoretically be replayed at the route boundary, so workflow start and message routes still bind the workflow run ID to the signed session and reject incompatible or consumed transitions.

### B. One long-lived streaming Function

Run Browserbase, PDF generation, confirmation, and delivery in one open HTTP request.

Rejected because refreshes lose the run, human confirmation is awkward, Hobby execution is capped at five minutes, and the complete workflow remains tied to one network connection.

### C. Client-side counters

Store counters in React state or browser storage.

Rejected because visitors can edit or clear the values and invoke server routes directly.

## Session and API Contract

### Session creation

`POST /api/demo/session` creates a random session ID, issued/expiry timestamps, a token version, and the initial budget. It sets the signed cookie and returns only safe display data. It never returns the signature or integration credentials in JSON.

Session creation must:

- require the Vercel-protected deployment;
- accept no identity, applicant, recipient, or quota fields;
- use constant-time signature verification;
- reject expired, malformed, or unsupported token versions;
- rotate the token after every successful metered mutation;
- clear the cookie when the session expires.

### Metered actions

The following server operations consume budget before starting external work. Workflow state also makes the workflow, packet, and delivery transitions one-way:

- Gemini chat consumes one chat turn.
- Starting Browserbase consumes the single workflow allowance.
- A failed eligible form phase may consume one retry.
- Packet assembly consumes the single packet allowance.
- AgentMail delivery consumes the single send allowance.

If an external call definitively fails before the provider accepts work, the server may return a replacement token that restores the relevant allowance. Ambiguous provider outcomes do not restore email or workflow allowances.

All metered responses return a fresh safe budget summary. The UI replaces its prior summary and never calculates authoritative counters locally.

### Email safety

- Delivery is reachable only as the terminal action of the synthetic test workflow.
- The request contains a run/session reference, never a recipient.
- The recipient and sender inbox are server-owned constants/configuration.
- The packet must carry the existing synthetic/test-only markings.
- The send action requires an explicit user confirmation in the live workspace.
- After the first send attempt, the current session token can no longer authorize another send.
- Provider message identifiers may be returned to the current browser for confirmation and retained only as synthetic workflow step output for reconciliation.

### Concurrency

The client permits only one metered mutation at a time using an in-flight action lock. Server tokens include a monotonically increasing sequence value. The signed session is bound to one workflow run ID, and the workflow's durable transitions prevent a completed workflow, packet, approval hook, or delivery step from being consumed twice. Vercel Authentication, the WAF ceiling, short expiry, and fixed recipient remain defense in depth.

## User Experience

- A persistent banner reads **Synthetic live demo — do not enter real personal or medical information**.
- The header shows time remaining and a compact usage indicator.
- The chat composer shows remaining AI turns.
- The Browserbase window remains live and displays the remote session, but only the approved synthetic workflow can launch.
- On mobile, the live browser uses the existing full-screen workspace with a sticky status/control area.
- Before delivery, a confirmation sheet states that one synthetic packet will be emailed to the approved test recipient and that the action cannot be repeated in this session.
- When a limit is reached, the affected control is disabled with a specific explanation; other unconsumed demo capabilities remain available.
- Expiration closes the Browserbase session when possible, disables metered controls, and offers a fresh-session action subject to the WAF ceiling.

## Vercel Controls

- Enable Vercel Authentication for **All Deployments** before any credential is configured.
- Enable Fluid Compute and Vercel Workflows; use the managed Vercel World in production and the local World for tests/development.
- Add a WAF rate-limit rule covering session creation and expensive demo APIs. Initial target: at most two new sessions and approximately thirty expensive requests per source IP per ten-minute window; final path grouping will account for required Browserbase status polling.
- Store `GEMINI_API_KEY`/`GOOGLE_GENAI_API_KEY`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `AGENTMAIL_API_KEY`, and the signing secret as Sensitive variables scoped only to the required environment.
- Do not configure fax credentials or enable unrelated email-test endpoints.
- Configure provider-side spend/usage alerts where available.

## Commands

```text
Development: npm run dev
Lint:        npm run lint
Test:        npm test
Build:       npm run build
```

The Vercel WAF rule and Deployment Protection are infrastructure settings and require separate verification in the Vercel dashboard after deployment.

## Project Structure

```text
src/app/api/demo/              Session, workflow start, event stream, chat, and approval routes
src/lib/demo-session/          Token schema, signing, verification, and metering
workflows/                     Durable synthetic application workflow and side-effecting steps
src/components/demo/           Banner, budget indicator, live workflow, and send confirmation UI
tests/demo-session/            Token, expiry, metering, and route-policy tests
tests/workflows/               Durable transition, retry, event, and delivery tests
```

Existing application-agent and integration modules remain responsible for Browserbase, PDF, Gemini, and AgentMail behavior. Session code must not import client components or expose server configuration.

## Code Style

Use TypeScript, Zod validation at request/token boundaries, early returns for rejected sessions, and immutable budget transitions:

```ts
const result = consumeBudget(session, 'chatTurns');
if (!result.ok) {
  return limitExceeded(result.reason, result.session);
}

const response = await runGeminiTurn(input);
return withDemoSession(response, result.session);
```

Do not mutate a decoded token in place or let route handlers construct cookies independently. Cookie issuance and safe error responses belong in the shared server-only session module.

## Testing Strategy

Add Node tests for:

- valid signing and verification;
- altered, malformed, expired, and wrong-version tokens;
- every budget boundary and off-by-one case;
- token rotation after successful actions;
- no allowance restoration after ambiguous email outcomes;
- workflow replay does not repeat completed Browserbase, packet, or email steps;
- the email step has zero automatic retries and uses a stable provider client/idempotency key;
- the approval hook expires with the 15-minute session;
- prompt and attachment size rejection;
- recipient fields being rejected or ignored at all relevant boundaries;
- safe `429`, `401`, and expiration responses;
- cookie security attributes;
- existing workflow behavior when demo-session enforcement is disabled locally.

Run the full existing test suite, lint, and a production build. Manually verify two browser sessions, mobile live-view behavior, expired-session behavior, and the Vercel WAF/deployment-protection configuration.

## Boundaries

### Always

- Validate and meter on the server before external work begins.
- Use only synthetic fixtures in the deployed test workflow.
- Redact prompts, documents, cookies, signatures, credentials, and attachment bytes from logs.
- Close Browserbase sessions on completion, failure, and expiration when possible.
- Return consistent structured errors without stack traces or provider response bodies.

### Ask first

- Add any user-managed persistent storage or database outside Vercel Workflows.
- Change the fixed recipient.
- Make the deployment public.
- Increase session, email, attachment, or workflow limits.
- Add a dependency not already required by the selected implementation.

### Never

- Put signing or provider secrets in `NEXT_PUBLIC_*` variables.
- Trust a client-provided counter, expiry, recipient, or workflow state.
- Persist real patient data, session tokens, or artifacts outside the managed synthetic workflow run.
- Log full signed cookies or live Browserbase connection/debug URLs.
- Retry an ambiguous email send automatically.

## Success Criteria

1. An authorized reviewer can create a session, chat with Gemini, watch one real Browserbase workflow, review the generated synthetic packet, and make one AgentMail send attempt.
2. The server rejects the eleventh chat turn, second workflow, third eligible retry, second packet, second send attempt, prompts over 2,000 characters, attachments over 5 MB, and actions after 15 minutes.
3. The client cannot choose or alter the email recipient.
4. Altering the cookie or its counters invalidates the session.
5. No deployed path writes `.data`, patient records, artifacts, or usage counters to local disk; temporary synthetic state exists only in the managed workflow run.
6. No credential, signed token, applicant content, attachment, or Browserbase debug URL appears in client bundles or logs.
7. Existing unit/integration tests, new session tests, lint, and `next build` pass.
8. An incognito visitor without Vercel access cannot reach pages or API routes.
9. WAF requests above the configured ceiling receive `429` before expensive application work begins.

## Open Questions

None. Vercel Workflows was approved as managed temporary durability without creating a user-managed database.
