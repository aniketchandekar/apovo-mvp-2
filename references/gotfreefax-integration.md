# GotFreeFax API integration reference

This document defines GotFreeFax as an optional outbound fax adapter for approved grant-application packets.

It is based on the GotFreeFax REST API v2 documentation available on October 26, 2026:

```text
Base URL: https://www.gotfreefax.com
Send:    POST /api/v2/fax
Status:  GET  /api/v2/fax/{job_id}
```

Official references: [Fax API](https://www.gotfreefax.com/fax-api), [service limits and pricing](https://www.gotfreefax.com/how-it-works), and [privacy policy](https://www.gotfreefax.com/privacy.aspx).

## Important: the REST API is not the free consumer tier

GotFreeFax has a free consumer fax flow, but the documented REST API is available to prepaid account holders. The word “free” in the product name does not mean automated API transmissions have no delivery cost.

The consumer/MCP free flow has additional constraints:

- three pages per fax;
- two free faxes per day;
- human email-link confirmation before the fax is queued;
- daily limits enforced at confirmation time.

That free flow does not fit the current Remember Betty application. The form alone is three pages and requires a diagnosis letter plus a personal statement, while the foundation permits up to eight pages. Use prepaid API page credits if GotFreeFax is selected.

## Provider decision

| Capability | GotFreeFax prepaid API | iFax API |
| --- | --- | --- |
| Authentication | Base64-encoded account number and PIN | API key header |
| Send format | JSON with base64 files | Multipart, base64, or file URL |
| Status API | Yes: `pending`, `success`, `failure` | Yes, with more detailed terminal states/codes |
| Per-fax callback | `notify_url` | Global postflight callback |
| Documented receipt API | Not documented | Yes |
| Documented API webhook signing | Not documented | Not documented |
| Published BAA/HIPAA API terms | Not found in reviewed official pages | iFax states BAA availability for API customers |
| API pricing model | Prepaid page credits | Usage/plan pricing |

Recommendation: keep iFax as the production default for patient packets unless GotFreeFax provides a signed BAA, healthcare security terms, retention details, and operational controls acceptable to the project. GotFreeFax is attractive for low-volume cost control, but its public API documentation is less complete for a healthcare audit trail.

## 1. Environment

The repository root `.env.local` includes:

```dotenv
GOTFREEFAX_ACCOUNT_NUMBER=
GOTFREEFAX_PIN=
GOTFREEFAX_WEBHOOK_TOKEN=
```

- `GOTFREEFAX_ACCOUNT_NUMBER`: prepaid account number.
- `GOTFREEFAX_PIN`: prepaid account PIN.
- `GOTFREEFAX_WEBHOOK_TOKEN`: application-generated high-entropy callback token.

Keep these server-only. The API bearer token is only Base64 encoding of `account:PIN`; Base64 is not encryption. Derive the token at request time and never log either credentials or the result.

## 2. Server-only client

```ts
const GOTFREEFAX_BASE_URL = 'https://www.gotfreefax.com'

function getGotFreeFaxToken() {
  const account = process.env.GOTFREEFAX_ACCOUNT_NUMBER
  const pin = process.env.GOTFREEFAX_PIN

  if (!account || !pin) {
    throw new Error('GotFreeFax credentials are not configured')
  }

  return Buffer.from(`${account}:${pin}`, 'utf8').toString('base64')
}

async function gotFreeFaxRequest<T>(path: string, init: RequestInit) {
  const response = await fetch(`${GOTFREEFAX_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getGotFreeFaxToken()}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  })

  const result = await response.json().catch(() => null)

  if (!response.ok || !result?.success) {
    throw new Error(`GotFreeFax request failed with HTTP ${response.status}`)
  }

  return result.data as T
}
```

Log only internal application IDs, provider job IDs, status, timestamps, and sanitized error codes.

## 3. Use the shared delivery model

Use the same durable delivery record and approval rules described in [ifax-integration.md](./ifax-integration.md), with a provider discriminator:

```ts
provider: 'ifax' | 'gotfreefax'
```

Add provider-specific fields:

```ts
gotfreefax_job_id?: string
gotfreefax_detail?: string
```

Enforce a database uniqueness constraint across:

```text
application_id + packet_sha256 + destination + active/delivered state
```

GotFreeFax does not document an idempotency key. The application must prevent duplicate jobs.

## 4. Preflight

Before sending:

1. Re-read and persist the grant's current official delivery instructions.
2. Bind patient approval to the exact packet checksum and fax destination.
3. Confirm the current date is inside the grant's submission window.
4. Confirm all required documents and the applicant's signature are present.
5. Validate PDF type, checksum, page count, and file size.
6. Confirm the destination is a 10-digit US or Canadian number; the v2 API documents US/Canada only.
7. Confirm no active or successful job exists for the same approved packet.
8. Check prepaid balance through `GET /api/v2/account/balance`.
9. Verify the application's environment is authorized to transmit patient data.

GotFreeFax v2 documents a maximum of ten files. Always apply the grant's stricter page limit; Remember Betty allows at most eight pages.

## 5. Send a fax

GotFreeFax accepts JSON with base64-encoded file content:

```ts
interface GotFreeFaxSendResult {
  job_id: string
}

const callbackToken = process.env.GOTFREEFAX_WEBHOOK_TOKEN

if (!callbackToken) {
  throw new Error('GOTFREEFAX_WEBHOOK_TOKEN is not configured')
}

const result = await gotFreeFaxRequest<GotFreeFaxSendResult>('/api/v2/fax', {
  method: 'POST',
  body: JSON.stringify({
    fax_number: destinationTenDigits,
    notify_url: `${process.env.APP_BASE_URL}/api/webhooks/gotfreefax/${callbackToken}`,
    files: [
      {
        filename: 'application-packet.pdf',
        content: packetBuffer.toString('base64'),
      },
    ],
  }),
})
```

On success:

1. Persist `job_id` immediately.
2. Mark the delivery `transmitting`, not delivered.
3. Do not resend after a client disconnect, timeout, or lost response.
4. Resolve ambiguous outcomes through provider/account history or support before another attempt.

The API only accepts 10-digit US/Canada destinations, not E.164. Keep the canonical destination in E.164 internally and derive the ten-digit value after confirming the country code is `+1`.

## 6. Check status

```ts
interface GotFreeFaxStatus {
  job_id: string
  fax_number: string
  status: 'pending' | 'success' | 'failure'
  page_count: number
  completed_at: string | null
  detail: string
}

const status = await gotFreeFaxRequest<GotFreeFaxStatus>(
  `/api/v2/fax/${encodeURIComponent(jobId)}`,
  { method: 'GET' },
)
```

Map states as follows:

| GotFreeFax status | Local state | Action |
| --- | --- | --- |
| `pending` | `transmitting` | Continue bounded polling |
| `success` | `delivered` | Verify destination and page count, then advance application |
| `failure` | `failed` | Preserve detail and require explicit retry approval |

Only transition the grant application to `Submitted` or `AwaitingResponse` after an authenticated status call returns `success`, the destination matches, and `page_count` matches the approved packet.

GotFreeFax does not document a separate transmission-receipt endpoint in v2. Store the authenticated final status response as provider evidence, but do not represent it as a formal transmission receipt. If the grant or compliance policy requires a receipt PDF, use iFax or obtain written confirmation of an equivalent GotFreeFax capability.

## 7. Callback handling

Set `notify_url` per fax to:

```text
https://your-app.example/api/webhooks/gotfreefax/<GOTFREEFAX_WEBHOOK_TOKEN>
```

The public v2 documentation exposes `notify_url` but does not document callback signatures or a callback payload contract. Therefore:

- use a long, random route token;
- rate-limit requests and cap body size;
- accept the callback only as a prompt to reconcile;
- extract only a candidate job ID if present;
- load the known local job and query the authenticated status endpoint;
- never set `success` directly from callback content;
- make reconciliation idempotent;
- return `2xx` after durable enqueue/recording.

Confirm callback payloads and retry behavior in a synthetic staging transmission before relying on notifications. Poll status as the reliable fallback.

## 8. Security and healthcare use

GotFreeFax's reviewed public pages describe HTTPS/encrypted connections and general privacy practices. They do not document a HIPAA program, BAA availability, healthcare API controls, retention configuration, or API-specific audit guarantees.

Do not send real patient or diagnosis information through GotFreeFax until the vendor provides written answers acceptable to the project's legal/security review, including:

- willingness to execute a BAA;
- storage and deletion periods for uploaded files and rendered fax images;
- subprocessors and storage regions;
- encryption at rest and key management;
- access controls and audit logs;
- breach notification and incident response;
- callback authentication options;
- deletion/export procedures.

The service's free shared inbound fax number explicitly warns against personal or sensitive documents. It must never be used for this application.

## 9. Provider selection policy

Represent provider choice as configuration, not branching spread throughout Route Handlers:

```ts
interface FaxProvider {
  send(input: ApprovedFaxInput): Promise<{ externalJobId: string }>
  getStatus(externalJobId: string): Promise<FaxProviderStatus>
  getReceipt?(externalJobId: string): Promise<Buffer>
}
```

Suggested selection:

- `ifax`: production default for patient documents after BAA/account review.
- `gotfreefax`: synthetic testing or approved low-volume production after equivalent compliance review.
- No automatic failover between providers. Failover could duplicate a fax whose first outcome is unknown.

Provider selection must be recorded on the approval and delivery record. Changing provider after approval requires another approval if it changes data handling or the exact cover sheet/packet.

## 10. Verification checklist

Use synthetic documents and a controlled fax destination.

1. Confirm REST access requires a prepaid account and sufficient page balance.
2. Verify credentials are derived server-side and never logged.
3. Reject non-US/Canada and malformed destination numbers.
4. Reject a packet whose checksum differs from the approved checksum.
5. Confirm one approval can create at most one active provider job.
6. Confirm send success stores `job_id` without marking the grant submitted.
7. Confirm callbacks cannot directly set delivery success.
8. Confirm authenticated polling maps all three statuses correctly.
9. Confirm final destination and page count match the approved delivery.
10. Confirm failure or ambiguous response never triggers automatic resend/failover.
11. Confirm the free shared inbound number is absent from all production paths.
12. Block real patient data until contractual and security review is complete.

## Current implementation impact

No GotFreeFax client or generic fax-provider interface currently exists. Adding this adapter requires the same durable approval/delivery state described in the iFax reference, optional provider configuration, callback and polling routes, and UI states that distinguish queued, transmitting, delivered, failed, and reconciliation-needed outcomes.
