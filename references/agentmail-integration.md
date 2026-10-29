# AgentMail integration reference

This document describes how to connect AgentMail to this Next.js application so each patient can receive a dedicated care inbox, inbound mail can populate the Care Inbox, and follow-up messages can be sent through a real mailbox.

It is based on the AgentMail documentation available on October 26, 2026. AgentMail's current REST base URL is `https://api.agentmail.to/v0`.

## Integration map

| Application concern | Existing location | AgentMail operation |
| --- | --- | --- |
| Provision a patient inbox | `POST /api/patients/[id]/inbox` | `POST /v0/inboxes` |
| Receive inbound messages | `POST /api/webhooks/agentmail` | `message.received` webhook |
| Send a new follow-up | `POST /api/applications/[id]/followup` | `POST /v0/inboxes/{inbox_id}/messages/send` |
| Continue an email thread | Not implemented | `POST /v0/inboxes/{inbox_id}/messages/{message_id}/reply` |
| Store local inbox state | `src/lib/store.ts` | Persist AgentMail `inbox_id`, `message_id`, and `thread_id` |

Official references: [Welcome](https://docs.agentmail.to/), [create an inbox](https://docs.agentmail.to/api-reference/inboxes/create), [send a message](https://docs.agentmail.to/api-reference/inboxes/messages/send), [reply to a message](https://docs.agentmail.to/api-reference/inboxes/messages/reply), and [webhooks](https://docs.agentmail.to/webhooks-overview).

## 1. Configure the environment

The repository root contains `.env.local` with:

```dotenv
AGENTMAIL_API_KEY=
AGENTMAIL_WEBHOOK_SECRET=
APP_BASE_URL=http://localhost:3000
```

1. Create or copy an API key from the AgentMail Console and set `AGENTMAIL_API_KEY`.
2. Register the webhook, copy the returned `secret`, and set `AGENTMAIL_WEBHOOK_SECRET`.
3. Set `APP_BASE_URL` to the public HTTPS origin in deployed environments. During local development, use an HTTPS tunnel because AgentMail must reach the webhook from the internet.
4. Restart `npm run dev` after changing `.env.local`.

Keep the API key and webhook secret server-only. Do not add `NEXT_PUBLIC_` to either name. Next.js loads root `.env*` files into `process.env`, and this repository already ignores them.

Only `AGENTMAIL_API_KEY` is read by the current code. `AGENTMAIL_WEBHOOK_SECRET` and `APP_BASE_URL` are included for the secure webhook implementation and registration flow described below.

## 2. Install the supported client and webhook verifier

The application can continue using `fetch`, but the official TypeScript SDK reduces request-shape drift. Svix verifies AgentMail's signed webhook requests.

```bash
npm install agentmail svix
```

For a small integration surface, direct REST calls are also reasonable. If using REST, centralize them in a server-only module such as `src/lib/agentmail.ts` and use:

```ts
const AGENTMAIL_API_BASE_URL = 'https://api.agentmail.to/v0'
```

Never call AgentMail directly from a Client Component; that would expose the API key.

## 3. Provision a patient inbox

The existing `src/app/api/patients/[id]/inbox/route.ts` already owns this workflow, but its API call needs to match AgentMail's current contract.

Request:

```http
POST https://api.agentmail.to/v0/inboxes
Authorization: Bearer $AGENTMAIL_API_KEY
Content-Type: application/json
```

```json
{
  "username": "maria.garcia",
  "display_name": "Maria Garcia (Care Concierge)",
  "client_id": "apovo-patient-patient_123",
  "metadata": {
    "patient_id": "patient_123"
  }
}
```

Important details:

- Use `/v0/inboxes`, not the `/v1/inboxes` URL currently in the route.
- REST fields are snake case, including `display_name` and `client_id`; the current route sends `displayName`.
- Set a stable `client_id` derived from the patient ID. AgentMail treats it as an idempotency key, preventing duplicate inboxes when onboarding is retried.
- Persist both `response.email` and the real `response.inbox_id`. `ApovoStore.assignCareInbox` currently generates a synthetic `inbox_${Date.now()}` ID and should be changed to accept the returned ID.
- Treat a username collision as an actionable error or retry with a stable suffix. Do not silently claim a fallback `@agentmail.to` address exists when the API call failed.

The expected success response includes:

```json
{
  "inbox_id": "inbox_...",
  "email": "maria.garcia@agentmail.to",
  "display_name": "Maria Garcia (Care Concierge)",
  "status": "active"
}
```

## 4. Register the inbound webhook

Register one organization-level webhook and filter it to the inboxes this app owns, or create an inbox-scoped webhook after each inbox is provisioned. For this MVP, one organization webhook is simpler:

```http
POST https://api.agentmail.to/v0/webhooks
Authorization: Bearer $AGENTMAIL_API_KEY
Content-Type: application/json
```

```json
{
  "url": "https://your-app.example/api/webhooks/agentmail",
  "event_types": ["message.received"],
  "client_id": "apovo-inbound-mail-v1"
}
```

Save the `secret` returned by this call as `AGENTMAIL_WEBHOOK_SECRET`. Event types are explicit: there is no subscribe-to-all default.

For local development, expose port 3000 through an HTTPS tunnel and register:

```text
https://<tunnel-host>/api/webhooks/agentmail
```

## 5. Verify and normalize webhook deliveries

AgentMail signs deliveries using the `svix-id`, `svix-timestamp`, and `svix-signature` headers. Verify the signature against the raw request body before parsing JSON. A Next.js Route Handler can follow this shape:

```ts
import { Webhook } from 'svix'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET

  if (!secret) {
    return Response.json({ error: 'Webhook is not configured' }, { status: 503 })
  }

  let event: AgentMailEvent

  try {
    event = new Webhook(secret).verify(rawBody, {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    }) as AgentMailEvent
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (event.event_type !== 'message.received') {
    return Response.json({ received: true })
  }

  // Deduplicate event.event_id, then process event.message.
  return Response.json({ received: true })
}
```

The current webhook route parses JSON immediately and does not verify signatures. It also treats `rawBody.message` as a generic payload, which discards `event_id` and `event_type`. Preserve the full envelope first, then extract `event.message`.

Normalize the message fields before passing them to the existing classifier:

| AgentMail field | Local field | Notes |
| --- | --- | --- |
| `message.inbox_id` | Patient lookup | Match the persisted `agentmail_inbox_id` |
| `message.message_id` | `message_id` | Unique with `inbox_id`; preserve exactly |
| `message.thread_id` | `thread_id` | Use AgentMail's thread ID instead of synthesizing one |
| `message.from` or `message.from_` | `from` | The current docs show both representations; normalize an array to a string |
| `message.to` | `to` | Normalize the address array for the local display model |
| `message.subject` | `subject` | May be empty |
| `message.extracted_text` | `body_text` | Prefer it because it excludes quoted reply history; fall back to `text` |
| `message.extracted_html` | `body_html` | Fall back to `html`, then escape/render plain text safely |

AgentMail omits inline body fields when stored content exceeds 64 KiB. In that case, promptly fetch `body_url` (valid for one hour) or retrieve the message through the API.

### Reliability requirements

- AgentMail delivery is at least once. Store and deduplicate on `event_id`; do not use `svix-id` as the business deduplication key.
- Events may arrive out of order. Use the payload timestamp when ordering state changes.
- Return a `2xx` response within 15 seconds. Move expensive classification or agent work to a queue before production use.
- AgentMail retries failed deliveries eight times over roughly 27.5 hours. Repeated failures over five days can disable the webhook without a separate notification.
- For catch-up after downtime, list messages after the last processed timestamp and deduplicate on `inbox_id + message_id`.

See [message.received payload](https://docs.agentmail.to/api-reference/webhooks/events/message-received) and [webhook delivery behavior](https://docs.agentmail.to/webhooks-overview).

## 6. Send real follow-up messages

`ApovoStore.triggerFollowUp` currently creates a synthetic outbound email record. Replace that simulation at the Route Handler boundary with an AgentMail send, then save the local record only after AgentMail succeeds.

For a new conversation:

```http
POST https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/send
Authorization: Bearer $AGENTMAIL_API_KEY
Content-Type: application/json
```

```json
{
  "to": "program@example.org",
  "subject": "Status inquiry for grant application",
  "text": "Plain-text version of the follow-up",
  "html": "<p>HTML version of the follow-up</p>"
}
```

Persist the returned `message_id` and `thread_id`. For later messages in the same conversation, reply to the most recent AgentMail message:

```http
POST /v0/inboxes/{inbox_id}/messages/{message_id}/reply
```

Provide both `text` and `html`. AgentMail manages standard email threading headers when the reply endpoint is used.

Recommended send sequence:

1. Load the patient, application, and persisted AgentMail inbox ID.
2. Validate recipient, subject, and message content.
3. Apply the application's existing approval/consent policy.
4. Send or reply through AgentMail.
5. Save the outbound `EmailRecord` with the real IDs.
6. Advance the follow-up ladder and append the timeline event.
7. If sending fails, leave the ladder unchanged and return a non-`2xx` error to the UI.

## 7. Data model changes to plan

The local models should retain AgentMail identity rather than recreating it:

- `PatientProfile.agentmail_inbox_id`: real `inbox_id` from AgentMail.
- `EmailRecord.message_id`: real AgentMail message ID.
- `EmailRecord.thread_id`: real AgentMail thread ID.
- A webhook receipt store keyed by `event_id` for idempotency.
- Optional delivery state for `message.sent`, `message.delivered`, `message.bounced`, and `message.rejected` events.

The current file-backed store is acceptable for demos, but it is not safe for multi-instance or serverless production deployments. Use a shared transactional database before relying on webhook deduplication or workflow state in production.

## 8. End-to-end verification checklist

1. Fill in `.env.local` and restart the development server.
2. Provision a new patient inbox and confirm that the stored email and inbox ID match the AgentMail response.
3. Register the public webhook URL and store its secret.
4. Send an external test email to the provisioned address.
5. Confirm the webhook returns `2xx`, creates exactly one local record, and displays it in `/inbox`.
6. Redeliver the same event and confirm no duplicate record is created.
7. Tamper with the payload and confirm the endpoint returns `401`.
8. Send a follow-up from the application and confirm the recipient receives it.
9. Reply externally and confirm AgentMail's `thread_id` remains associated with the local conversation.
10. Test missing API key, AgentMail `4xx`/`5xx`, oversized body, and duplicate webhook cases.

## 9. Attachments and isolated synthetic email test

`src/lib/integrations/agentmail/api.ts` supports inline attachments on sends, replies, and draft creation. Each attachment uses Base64 `content`, a safe `filename`, and a snake-case `content_type`. Draft updates use `add_attachments` and `remove_attachments`. The client rejects malformed Base64 and filenames, and rejects serialized inline requests at AgentMail's 6 MiB limit before making a request. Message and draft responses expose only sanitized attachment metadata, never Base64 content or signed download URLs.

To verify stored attachment bytes, retrieve `GET /v0/inboxes/{inbox_id}/messages/{message_id}/attachments/{attachment_id}`, then download the returned short-lived URL. `src/lib/integrations/agentmail/integration-test.ts` compares SHA-256 hashes of both generated PDFs with the downloaded bytes.

The isolated `POST /api/test-care-email` test route is disabled unless the server starts with `APOVO_EMAIL_TEST_MODE=1`. It requires `confirmation: "SEND_TO_NICOLE"` and `recipient: "nicole.wu.mail@gmail.com"`; the recipient is also fixed in the orchestration so a request cannot redirect it to a resource. Gemini writes only the subject and body from synthetic context. The route generates two synthetic PDFs, creates and sends one AgentMail draft, and verifies the stored attachments. It does not submit an application or advance application or follow-up state. Provider acceptance is not proof of Gmail delivery; Nicole must confirm receipt and open both PDFs manually.

```bash
APOVO_EMAIL_TEST_MODE=1 npm run dev
# In a separate terminal, invoke this exactly once:
npm run test:email:live
```

Do not automatically retry this command. A timeout after the send request may still have produced an email.

## Current-state summary

The AgentMail integration supports real inbox provisioning, signed webhook handling, outbound messages and replies, drafts, and attachments. The isolated synthetic test above verifies Gemini composition and AgentMail attachment delivery without using patient documents or contacting an assistance resource. Gmail receipt remains a separate manual check.
