# iFax API integration reference

This document defines the production-default fax-delivery adapter for grant applications that require fax submission. It is designed to receive a finalized, patient-approved PDF packet from the application workflow and deliver it through the [iFax Programmable Fax API](https://www.ifaxapp.com/fax-api/). See [gotfreefax-integration.md](./gotfreefax-integration.md) for the optional prepaid alternative and provider comparison.

It is based on the iFax v1 documentation available on October 26, 2026. The API base URL is:

```text
https://api.ifaxapp.com/v1
```

## Role in the grant workflow

iFax is a delivery adapter, not the agent that decides what to send. Before iFax is called, the application must already have:

- re-read the grant's current official submission instructions;
- assembled the exact application and supporting documents;
- validated field completeness, dates, page limits, and destination;
- obtained the applicant's required signature;
- shown the final packet and destination to the patient;
- recorded explicit approval for one transmission attempt.

For Remember Betty, the current packet must be no more than eight pages, include a diagnosis letter and personal note, be signed by the applicant, and be submitted only during days 1–7 of the month. Its current fax destination is part of the source PDF and must be revalidated when the packet is finalized.

Related references: [Browserbase + Stagehand discovery](./browserbase-stagehand-integration.md) and [iFax API documentation](https://www.ifaxapp.com/docs/api/v1).

## Integration map

| Concern | iFax operation | Local behavior |
| --- | --- | --- |
| Send the approved packet | `POST /customer/fax-send` | Persist returned `jobId` and mark transmitting |
| Receive completion notice | Configured postflight webhook | Treat as a notification, not authoritative proof |
| Confirm outcome | `POST /customer/fax-status` | Reconcile status using the API key |
| Store delivery evidence | `POST /customer/transmission-receipt` | Save receipt for delivered faxes |
| Handle ambiguity | Status polling | Never automatically create a second job |

## 1. Environment

The repository root `.env.local` includes:

```dotenv
IFAX_API_KEY=
IFAX_CALLER_ID=
IFAX_WEBHOOK_TOKEN=
```

- `IFAX_API_KEY`: live or test API key from the iFax dashboard.
- `IFAX_CALLER_ID`: verified outbound fax number in E.164 format, such as `+15125550123`.
- `IFAX_WEBHOOK_TOKEN`: app-generated high-entropy token used in the callback route path.

Keep all three values server-only. Do not use `NEXT_PUBLIC_`, return them from Route Handlers, or include them in application logs.

The test key may be restricted to a designated destination and page allowance. Use synthetic documents and the test destination until production access, billing, and healthcare terms are configured.

## 2. Authentication and request helper

iFax authenticates requests using the `accessToken` header. Centralize requests in a server-only module such as `src/lib/ifax.ts`:

```ts
const IFAX_API_BASE_URL = 'https://api.ifaxapp.com/v1'

async function ifaxRequest<T>(path: string, body: unknown): Promise<T> {
  const apiKey = process.env.IFAX_API_KEY

  if (!apiKey) throw new Error('IFAX_API_KEY is not configured')

  const response = await fetch(`${IFAX_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      accessToken: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const result = await response.json().catch(() => null)

  if (!response.ok || !result || result.status !== 1) {
    throw new Error(`iFax request failed with HTTP ${response.status}`)
  }

  return result as T
}
```

Do not log raw request bodies or iFax responses indiscriminately. They can contain fax numbers, file content, and patient data. Emit opaque application IDs, iFax job IDs, status, timestamps, and sanitized error codes instead.

## 3. Persist a fax delivery record before sending

Create the durable record before the external API call. A suggested model is:

```ts
interface FaxDelivery {
  id: string
  application_id: string
  provider: 'ifax'
  destination_e164: string
  caller_id_e164: string
  packet_sha256: string
  packet_page_count: number
  approval_id: string
  state:
    | 'approved'
    | 'sending'
    | 'transmitting'
    | 'delivered'
    | 'failed'
    | 'canceled'
    | 'needs_reconciliation'
  ifax_job_id?: string
  ifax_transaction_id?: string
  provider_code?: number
  provider_message?: string
  attempted_at?: string
  delivered_at?: string
  receipt_storage_key?: string
}
```

Add a uniqueness constraint that prevents more than one active delivery for the same `application_id + packet_sha256 + destination_e164`. The iFax send endpoint does not document an idempotency key, so the application must enforce one.

## 4. Preflight checks

Before changing the delivery state from `approved` to `sending`, validate in deterministic code:

1. The patient approval references the exact packet SHA-256 checksum.
2. The approved destination matches the latest official grant instructions.
3. The caller ID matches `IFAX_CALLER_ID` and is verified in iFax.
4. Both numbers are normalized to E.164.
5. The packet is a valid PDF with the expected checksum.
6. Packet page count and size meet both grant and iFax limits.
7. Every required attachment is present.
8. The grant's submission window is currently open in its documented timezone.
9. There is no active or delivered fax for the same packet and destination.

iFax permits PDF, document, and image attachments. Its documented API limits are 20 MB per request, 200 pages, 20 files, and 15 recipients. Program-specific limits can be much stricter; Remember Betty's eight-page maximum controls.

## 5. Send the packet

Use `POST https://api.ifaxapp.com/v1/customer/fax-send`. Prefer a direct multipart upload for protected documents. It avoids creating an internet-accessible file URL and avoids base64 expansion.

The JSON API also accepts base64 content:

```ts
interface IFaxSendResponse {
  status: 1
  message: string
  data: { jobId: number }
}

const result = await ifaxRequest<IFaxSendResponse>('/customer/fax-send', {
  faxNumber: destinationE164,
  callerId: process.env.IFAX_CALLER_ID,
  subject: 'Application for Assistance',
  from_name: applicantDisplayName,
  to_name: 'Review Committee',
  message: 'Application packet and required supporting documents.',
  faxQuality: 'Standard',
  faxData: [
    {
      fileName: 'application-packet.pdf',
      fileData: packetBuffer.toString('base64'),
    },
  ],
})
```

If JSON/base64 would approach the 20 MB request limit, use multipart upload rather than splitting the approved packet without another review. Do not use a long-lived public `fileUrl` for patient documents. If a private URL is unavoidable, make it single-use, short-lived, HTTPS-only, and excluded from logs.

On a successful response:

1. Persist `data.jobId` immediately.
2. Set local state to `transmitting`, not `delivered` or `Submitted`.
3. Return the job ID and transmitting state to the workflow.
4. Do not call the send endpoint again because the client disconnected or the response was lost.

If the request outcome is ambiguous, set `needs_reconciliation`. Search/poll iFax and involve a human before creating another transmission.

## 6. Delivery status

Confirm status using the authenticated endpoint:

```http
POST https://api.ifaxapp.com/v1/customer/fax-status
accessToken: $IFAX_API_KEY
Content-Type: application/json
Accept: application/json
```

```json
{
  "jobId": 12345
}
```

Important iFax statuses include:

| iFax status | Local state | Action |
| --- | --- | --- |
| `sending` | `transmitting` | Continue polling with bounded backoff |
| `delivered` | `delivered` | Verify page counts, save receipt, then mark application submitted |
| `canceled` | `canceled` | Do not retry without new approval |
| `partially_cancelled` | `needs_reconciliation` | Human review; some transmission may have occurred |
| `failed` | `failed` | Preserve error; require an explicit retry decision |
| `failed_chargeable` | `failed` | Preserve charge/error; require explicit retry decision |
| `blocked` | `failed` | Correct policy/account issue before a new approval |

For `delivered`, verify that:

- returned `jobId` matches the stored job;
- `toNumber` matches the approved destination;
- `faxTotalPages` matches the approved packet page count;
- `faxTransferredPages` equals `faxTotalPages`;
- the provider code/message is consistent with delivery.

Only after those checks should the grant application transition to `Submitted` or `AwaitingResponse`.

## 7. Webhook callback

Configure iFax's global sent-fax/postflight callback in its dashboard to a route such as:

```text
https://your-app.example/api/webhooks/ifax/<IFAX_WEBHOOK_TOKEN>
```

The public iFax v1 documentation describes completion webhooks and retries but does not document a request-signature scheme. Therefore:

- use a high-entropy callback route token and rotate it if exposed;
- rate-limit the endpoint and accept only expected content types and body sizes;
- look up the `jobId` and ensure it belongs to this account/application;
- treat all callback fields as untrusted hints;
- fetch authoritative status through `/customer/fax-status` using `IFAX_API_KEY`;
- make processing idempotent by `jobId + faxStatus + faxCallEnd`;
- return `2xx` after the event is durably recorded or queued.

iFax documents up to five retries for failed postflight webhook delivery. Duplicate callbacks must not create duplicate events or transmission receipts.

If iFax later provides signed webhooks or authenticated custom headers, replace the route-token mechanism with signature verification.

## 8. Transmission receipt

After authenticated status reconciliation confirms delivery, request the receipt:

```http
POST https://api.ifaxapp.com/v1/customer/transmission-receipt
accessToken: $IFAX_API_KEY
Content-Type: application/json
Accept: application/json
```

```json
{
  "transactionId": 1234657,
  "direction": "OB"
}
```

The API returns a base64-encoded receipt PDF. Decode it server-side, verify that it is a PDF, and store it in encrypted private storage under a random object key. Persist the storage key and checksum, not the base64 data, in the database.

The fax-status response shown in iFax documentation centers on `jobId`; the receipt endpoint requires `transactionId`. Confirm in the test account where the outbound transaction ID appears in the status, list, callback, or download response before implementing receipt retrieval. Do not assume that `jobId` and `transactionId` are interchangeable.

## 9. Compliance and retention

iFax markets its API as HIPAA compliant and says a BAA is available to API customers. Before sending real patient data:

- execute and archive the applicable BAA and service agreement;
- verify the correct production account, users, permissions, and retention settings;
- document where fax files, logs, previews, and receipts are stored and for how long;
- restrict access to patients and authorized operations staff;
- encrypt local packet and receipt storage;
- redact fax numbers and patient fields from application logs and error trackers;
- define deletion and incident-response procedures;
- test only with synthetic information until this review is complete.

A vendor marketing statement is not itself sufficient evidence that this application's configuration and use are compliant.

## 10. Application state machine

Do not reuse the current synthetic `approve_submit` behavior. Separate approval, send initiation, and confirmed delivery:

```text
AwaitingPatientApproval
  -> ApprovedForDelivery
  -> FaxSending
  -> FaxTransmitting
  -> Submitted / AwaitingResponse       (only after delivered)
  -> FaxFailed                          (terminal until explicit retry approval)
  -> NeedsReconciliation                (ambiguous or partial outcome)
```

Recommended endpoints:

| Route | Purpose |
| --- | --- |
| `POST /api/applications/[id]/approve-delivery` | Bind approval to checksum and destination |
| `POST /api/applications/[id]/fax` | Preflight and initiate exactly one iFax job |
| `GET /api/applications/[id]/fax` | Read reconciled delivery status |
| `POST /api/webhooks/ifax/[token]` | Receive notification and enqueue authenticated reconciliation |

Run transmission and reconciliation in a durable worker rather than depending on one browser request remaining open.

## 11. Failure and retry policy

- Never automatically resend after an HTTP timeout or lost response.
- Never call iFax's resend endpoint without a fresh explicit patient/operations decision.
- Distinguish provider automatic busy-line retries within one job from creating another job.
- A failed fax retains its original packet checksum, destination, job ID, provider code, and receipt/status history.
- If the packet or destination changes, obtain new approval.
- For terminal failure, surface the provider message in safe language and offer mail or an explicitly approved retry.
- Use exponential backoff with a maximum polling interval and overall reconciliation deadline.

## 12. Verification checklist

Use the iFax test key and synthetic PDFs first.

1. Validate missing API key and unverified caller ID failures.
2. Reject non-E.164 destinations and unexpected foundation fax numbers.
3. Reject a packet whose checksum differs from the approved checksum.
4. Reject packets exceeding the program page limit or iFax request limit.
5. Confirm one approval can create at most one active iFax job.
6. Confirm send success stores `jobId` but does not mark the application submitted.
7. Confirm callbacks cannot directly set `delivered` without authenticated reconciliation.
8. Confirm duplicate callbacks produce one local transition.
9. Confirm `delivered` requires matching destination and complete page transfer.
10. Confirm a receipt PDF is fetched, validated, encrypted, and linked to the timeline.
11. Simulate timeout after send and verify no automatic second job is created.
12. Simulate `failed`, `failed_chargeable`, `blocked`, and `partially_cancelled` statuses.
13. Confirm real patient data is impossible to send from non-approved environments.

## Current implementation impact

No iFax integration currently exists in the repository. The application presently changes a grant to `Submitted` through a simulated action. Implementing this reference requires a durable fax-delivery record, an iFax client, callback/status reconciliation, private packet/receipt storage, and state/UI changes that distinguish approval, transmission, delivery, and failure.
