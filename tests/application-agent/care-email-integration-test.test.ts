import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertIntegrationTestAccess,
  INTEGRATION_TEST_CONFIRMATION,
  INTEGRATION_TEST_RECIPIENT,
  runCareEmailIntegrationTest,
} from '../../src/lib/integrations/agentmail/integration-test';
import type { AgentMailAttachmentInput } from '../../src/lib/integrations/agentmail/api';

test('requires opt-in, explicit confirmation, and Nicole as the sole recipient', () => {
  assert.throws(
    () => assertIntegrationTestAccess({ enabled: false, confirmation: INTEGRATION_TEST_CONFIRMATION, recipient: INTEGRATION_TEST_RECIPIENT }),
    (error: unknown) => (error as { status?: number }).status === 404
  );
  assert.throws(
    () => assertIntegrationTestAccess({ enabled: true, confirmation: 'wrong', recipient: INTEGRATION_TEST_RECIPIENT }),
    (error: unknown) => (error as { status?: number }).status === 403
  );
  assert.throws(
    () => assertIntegrationTestAccess({ enabled: true, confirmation: INTEGRATION_TEST_CONFIRMATION, recipient: 'grants@rememberbetty.com' }),
    (error: unknown) => (error as { status?: number }).status === 403
  );
  assert.doesNotThrow(() => assertIntegrationTestAccess({
    enabled: true,
    confirmation: INTEGRATION_TEST_CONFIRMATION,
    recipient: INTEGRATION_TEST_RECIPIENT,
  }));
});

test('rejects another recipient before generation or provider calls', async () => {
  let called = false;
  await assert.rejects(
    runCareEmailIntegrationTest(
      { inboxId: 'care@agentmail.to', recipient: 'grants@rememberbetty.com' },
      {
        compose: async () => {
          called = true;
          throw new Error('must not run');
        },
      }
    ),
    /approved test recipient/
  );
  assert.equal(called, false);
});

function fakeProviders(options?: { corruptDownload?: boolean }) {
  const state = {
    draftCalls: 0,
    sendCalls: 0,
    attachments: [] as AgentMailAttachmentInput[],
  };
  const dependencies = {
    compose: async () => ({
      subject: '[Apovo Test] Synthetic check',
      text: 'Synthetic test body. No grant application was submitted.',
      model: 'gemini-3.7-flash',
      source: 'gemini' as const,
    }),
    createDraft: async (input: { attachments?: AgentMailAttachmentInput[]; clientId?: string }) => {
      state.draftCalls += 1;
      state.attachments = input.attachments || [];
      return {
        draftId: 'drf_test_1',
        inboxId: 'care@agentmail.to',
        to: [INTEGRATION_TEST_RECIPIENT],
        subject: '[Apovo Test] Synthetic check',
        text: 'Synthetic test body.',
        html: '',
        labels: ['apovo_integration_test'],
        attachments: [],
        createdAt: '2026-10-28T00:00:00Z',
        updatedAt: '2026-10-28T00:00:00Z',
      };
    },
    sendDraft: async () => {
      state.sendCalls += 1;
      return { messageId: 'msg_test_1', threadId: 'thr_test_1' };
    },
    getMessage: async () => ({
      messageId: 'msg_test_1',
      threadId: 'thr_test_1',
      inboxId: 'care@agentmail.to',
      from: 'care@agentmail.to',
      to: [INTEGRATION_TEST_RECIPIENT],
      subject: '[Apovo Test] Synthetic check',
      text: 'Synthetic test body.',
      html: '',
      labels: [],
      attachments: state.attachments.map((item, index) => ({
        attachmentId: `att_${index}`,
        filename: item.filename,
        contentType: item.content_type,
        size: Buffer.from(item.content, 'base64').byteLength,
      })),
      createdAt: '2026-10-28T00:00:00Z',
    }),
    getAttachment: async (input: { attachmentId: string }) => ({
      attachmentId: input.attachmentId,
      filename: 'synthetic.pdf',
      contentType: 'application/pdf',
      size: 1,
      downloadUrl: `https://cdn.example/${input.attachmentId}`,
      expiresAt: '2026-10-28T01:00:00Z',
    }),
    fetchImpl: (async (url: string | URL | Request) => {
      const index = Number(String(url).split('/').at(-1)?.replace('att_', ''));
      const bytes = options?.corruptDownload
        ? new TextEncoder().encode('corrupted')
        : Buffer.from(state.attachments[index].content, 'base64');
      return new Response(bytes, { status: 200 });
    }) as typeof fetch,
  };
  return { state, dependencies };
}

test('runs the synthetic two-attachment flow and verifies stored bytes', async () => {
  const { state, dependencies } = fakeProviders();
  const result = await runCareEmailIntegrationTest(
    { inboxId: 'care@agentmail.to', recipient: INTEGRATION_TEST_RECIPIENT, testRunId: 'email_test_offline_1' },
    dependencies
  );
  assert.equal(state.draftCalls, 1);
  assert.equal(state.sendCalls, 1);
  assert.equal(state.attachments.length, 2);
  assert.equal(result.attachments.length, 2);
  assert.ok(result.attachments.every((item) => item.verified && item.sha256.length === 64));
  assert.ok(!JSON.stringify(result).includes(state.attachments[0].content));
  assert.equal(result.recipient, INTEGRATION_TEST_RECIPIENT);
});

test('fails if AgentMail changes an attachment byte', async () => {
  const { dependencies } = fakeProviders({ corruptDownload: true });
  await assert.rejects(
    runCareEmailIntegrationTest(
      { inboxId: 'care@agentmail.to', recipient: INTEGRATION_TEST_RECIPIENT, testRunId: 'email_test_offline_2' },
      dependencies
    ),
    /checksum verification/
  );
});
