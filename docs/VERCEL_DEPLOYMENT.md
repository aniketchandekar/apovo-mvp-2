# Protected Vercel MVP Deployment

This deployment is an invite-only synthetic demonstration. It must never receive real patient, medical, financial, or identity information.

## Required architecture

- Vercel Authentication protects **All Deployments**.
- `APOVO_DEPLOYMENT_MODE=vercel_demo` enables the protected demo boundary.
- Vercel Workflows retains temporary synthetic run state. No application database, Redis instance, or Blob store is required.
- Browserbase, Gemini, and AgentMail credentials remain server-only Sensitive environment variables.
- The recipient is fixed in server code. The browser cannot provide or override it.
- The local `.data` store is excluded and is never used by the deployed demo.

## Pre-deployment checks

Run locally:

```bash
npm test
npm run lint
npm run build
```

Confirm the deployment input contains no private keys or provider tokens and that tracked files do not include `.data`, `.env.local`, generated packets, or patient documents. Synthetic PDF fixtures under `tests/fixtures` are expected.

## Vercel project configuration

1. Import the sanitized repository into a new Vercel project.
2. Confirm the framework is detected as Next.js.
3. Keep Fluid Compute enabled.
4. Open **Security → Deployment Protection** and select **Vercel Authentication → All Deployments**.
5. Grant access only to the intended reviewers.
6. Open **Firewall** and publish a fixed-window rate-limit rule for `/api/demo/*`, identified by source IP, using a ten-minute window and initially allowing approximately 30 requests before returning `429`.
7. Add a stricter workflow-start condition if the plan supports multiple WAF rules: no more than two starts per source IP per ten minutes.
8. Enable spend notifications for Functions, Workflows, Browserbase, Gemini, and AgentMail.

## Environment variables

Add only the variables needed by the synthetic demo:

```text
APOVO_DEPLOYMENT_MODE=vercel_demo
APOVO_DEMO_SESSION_SECRET=<unique random value of at least 32 characters>
GEMINI_API_KEY=<server credential>
BROWSERBASE_API_KEY=<server credential>
BROWSERBASE_PROJECT_ID=<server credential>
AGENTMAIL_API_KEY=<server credential>
AGENTMAIL_INBOX_ID=<approved sender inbox>
APOVO_APPLICATION_TEST_MODE=1
APOVO_EMAIL_TEST_MODE=0
```

Mark credentials and the signing secret as **Sensitive** and scope them only to the intended Preview/Production environments. Do not configure fax credentials. Never use a `NEXT_PUBLIC_` prefix for a secret.

## Preview verification

- An incognito visitor without Vercel access receives the Vercel login screen.
- An approved reviewer sees the synthetic-demo banner and 15-minute countdown.
- Gemini stops after ten metered turns.
- Only one Browserbase workflow can start in the session.
- The Browserbase live view works under the final Content Security Policy.
- The packet contains Ava Testperson and visible synthetic/test-only markings.
- The workflow pauses for explicit confirmation before email delivery.
- The recipient is fixed and no editable address is shown.
- One AgentMail attempt succeeds or enters a terminal uncertain state.
- A second workflow or email attempt is refused.
- Refresh restores workflow events through Vercel Workflows.
- Logs contain no credentials, signed cookies, real patient data, or Browserbase connection/debug URLs.
- Legacy patient, upload, reset, inbox, webhook, local-run, artifact, and test-email endpoints return `404` in demo mode.

## Promotion and rollback

Promote the exact verified preview deployment; do not rebuild between verification and promotion. Keep the prior production deployment available. If the demo leaks data, sends unexpectedly, exceeds spend, or loses its security boundary:

1. Disable or roll back the deployment.
2. Revoke reviewer/share access.
3. Rotate the affected provider and signing credentials.
4. Inspect Vercel Function and Workflow logs without copying sensitive payloads.
5. Reproduce with provider fakes before redeploying.

## Known constraint

The source tree contains an older localhost workflow backed by `.data`. It remains available only when `APOVO_DEPLOYMENT_MODE` is not `vercel_demo`. The production proxy must continue denying those legacy APIs.
