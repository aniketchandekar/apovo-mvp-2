import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  pollForSessionPdf,
  type SessionDownloadsClient,
} from '../../src/lib/integrations/browserbase/downloads';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';

const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj <</Type /Page>> endobj\n%%EOF');
const pdfChecksum = crypto.createHash('sha256').update(pdf).digest('hex');

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    id: 'download_1',
    sessionId: 'session',
    filename: 'application.pdf',
    mimeType: 'application/pdf',
    size: pdf.byteLength,
    checksum: pdfChecksum,
    createdAt: '2026-10-26T00:00:00.000Z',
    ...overrides,
  };
}

function listResponse(downloads: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ downloads, total: downloads.length }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fileResponse(bytes: Uint8Array = pdf, status = 200): Response {
  return new Response(Buffer.from(bytes), {
    status,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

function clientFor(list: () => Promise<Response>, get?: () => Promise<Response>): SessionDownloadsClient {
  return {
    list,
    get: get || (async () => fileResponse()),
  };
}

function expectCode(code: string) {
  return (error: unknown) => error instanceof ApplicationRunError && error.code === code;
}

const fastOptions = { timeoutMs: 500, pollIntervalMs: 1, sleep: async () => undefined };

test('retrieves exactly one validated PDF through the downloads API', async () => {
  let listed = 0;
  let fetched = 0;
  const client = clientFor(
    async () => {
      listed += 1;
      return listed === 1 ? listResponse([]) : listResponse([metadata()]);
    },
    async () => {
      fetched += 1;
      return fileResponse();
    }
  );

  const result = await pollForSessionPdf(client, 'session', fastOptions);
  assert.deepEqual(result, pdf);
  assert.equal(listed, 2);
  assert.equal(fetched, 1);
});

test('rejects multiple PDFs in one session', async () => {
  const client = clientFor(async () =>
    listResponse([metadata(), metadata({ id: 'download_2', filename: 'other.pdf' })])
  );
  await assert.rejects(pollForSessionPdf(client, 'session', fastOptions), expectCode('DOWNLOAD_AMBIGUOUS'));
});

test('rejects disguised, oversized, and corrupted PDF downloads', async () => {
  const disguised = clientFor(
    async () => listResponse([metadata({ checksum: undefined })]),
    async () => fileResponse(new TextEncoder().encode('not a pdf file'))
  );
  await assert.rejects(pollForSessionPdf(disguised, 'session', fastOptions), expectCode('DOWNLOAD_INVALID'));

  const oversized = clientFor(async () => listResponse([metadata({ size: 50 * 1024 * 1024 })]));
  await assert.rejects(pollForSessionPdf(oversized, 'session', fastOptions), expectCode('DOWNLOAD_INVALID'));

  const corrupted = clientFor(
    async () => listResponse([metadata({ checksum: '0'.repeat(64) })]),
    async () => fileResponse()
  );
  await assert.rejects(pollForSessionPdf(corrupted, 'session', fastOptions), expectCode('DOWNLOAD_INVALID'));
});

test('times out when no PDF arrives without exposing provider details', async () => {
  const client = clientFor(async () => new Response(null, { status: 404 }));
  await assert.rejects(
    pollForSessionPdf(client, 'session', { timeoutMs: 0, sleep: async () => undefined }),
    expectCode('DOWNLOAD_TIMEOUT')
  );
});

test('fails safely on provider errors and failed file retrieval', async () => {
  const failingList = clientFor(async () => new Response('secret provider detail', { status: 500 }));
  await assert.rejects(pollForSessionPdf(failingList, 'session', fastOptions), (error: unknown) => {
    assert.ok(error instanceof ApplicationRunError);
    assert.equal(error.code, 'DOWNLOAD_INVALID');
    assert.ok(!error.message.includes('secret'));
    return true;
  });

  const failingGet = clientFor(
    async () => listResponse([metadata()]),
    async () => new Response(null, { status: 500 })
  );
  await assert.rejects(pollForSessionPdf(failingGet, 'session', fastOptions), expectCode('DOWNLOAD_INVALID'));
});
