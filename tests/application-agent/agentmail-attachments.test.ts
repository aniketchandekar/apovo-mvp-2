import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCareDraft,
  getInboxMessageAttachment,
  normalizeAgentMailMessage,
  replyToCareMessage,
  sendCareMessage,
  updateCareDraft,
  type AgentMailAttachmentInput,
} from '../../src/lib/integrations/agentmail/api';

const attachment: AgentMailAttachmentInput = {
  content: Buffer.from('%PDF-synthetic-test').toString('base64'),
  filename: 'synthetic.pdf',
  content_type: 'application/pdf',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test.beforeEach(() => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
});

test('serializes attachments for sends, replies, and draft create/update contracts', async () => {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    calls.push({ url: String(url), method: init?.method || 'GET', body });
    if (String(url).endsWith('/send') && String(url).includes('/drafts/')) {
      return jsonResponse({ message_id: 'msg_1', thread_id: 'thr_1' });
    }
    if (String(url).includes('/drafts')) {
      return jsonResponse({
        draft_id: 'drf_1',
        attachments: [{ attachment_id: 'att_1', filename: 'synthetic.pdf', content_type: 'application/pdf' }],
      });
    }
    return jsonResponse({ message_id: 'msg_1', thread_id: 'thr_1' });
  };

  await sendCareMessage(
    { inboxId: 'care@agentmail.to', to: ['test@example.com'], subject: 'Test', text: 'Body', attachments: [attachment] },
    fakeFetch
  );
  await replyToCareMessage(
    { inboxId: 'care@agentmail.to', messageId: 'msg_0', text: 'Body', attachments: [attachment] },
    fakeFetch
  );
  await createCareDraft(
    { inboxId: 'care@agentmail.to', to: ['test@example.com'], subject: 'Test', text: 'Body', attachments: [attachment] },
    fakeFetch
  );
  await updateCareDraft(
    { inboxId: 'care@agentmail.to', draftId: 'drf_1', addAttachments: [attachment], removeAttachments: ['att_old'] },
    fakeFetch
  );

  for (const call of calls.slice(0, 3)) {
    assert.deepEqual(call.body.attachments, [attachment]);
  }
  assert.deepEqual(calls[3].body.add_attachments, [attachment]);
  assert.deepEqual(calls[3].body.remove_attachments, ['att_old']);
  assert.equal(calls[3].body.attachments, undefined);
});

test('normalizes only safe attachment metadata', () => {
  const message = normalizeAgentMailMessage({
    message_id: 'msg_1',
    attachments: [{
      attachment_id: 'att_1',
      filename: 'synthetic.pdf',
      content_type: 'application/pdf',
      size: 123,
      content: 'secret-base64',
      download_url: 'https://secret.example/download',
    }],
  });
  assert.deepEqual(message.attachments, [{
    attachmentId: 'att_1',
    filename: 'synthetic.pdf',
    contentType: 'application/pdf',
    size: 123,
  }]);
  assert.ok(!JSON.stringify(message).includes('secret'));
});

test('rejects invalid and oversized inline attachments before any request', async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async () => {
    calls += 1;
    return jsonResponse({});
  };
  await assert.rejects(
    sendCareMessage(
      { inboxId: 'care@agentmail.to', to: ['test@example.com'], subject: 'Test', text: 'Body', attachments: [{ ...attachment, filename: '../secret.pdf' }] },
      fakeFetch
    ),
    (error: unknown) => (error as { code?: string }).code === 'invalid_attachment'
  );
  await assert.rejects(
    sendCareMessage(
      {
        inboxId: 'care@agentmail.to',
        to: ['test@example.com'],
        subject: 'Test',
        text: 'Body',
        attachments: [{ ...attachment, content: Buffer.alloc(5 * 1024 * 1024).toString('base64') }],
      },
      fakeFetch
    ),
    (error: unknown) => (error as { code?: string }).code === 'inline_request_too_large'
  );
  assert.equal(calls, 0);
});

test('retrieves an attachment download descriptor without exposing it in message metadata', async () => {
  let capturedUrl = '';
  const fakeFetch: typeof fetch = async (url) => {
    capturedUrl = String(url);
    return jsonResponse({
      attachment_id: 'att_1',
      filename: 'synthetic.pdf',
      content_type: 'application/pdf',
      size: 123,
      download_url: 'https://cdn.example/signed-download',
      expires_at: '2026-10-28T12:00:00Z',
    });
  };
  const result = await getInboxMessageAttachment(
    { inboxId: 'care@agentmail.to', messageId: 'msg_1', attachmentId: 'att_1' },
    fakeFetch
  );
  assert.equal(
    capturedUrl,
    'https://api.agentmail.to/v0/inboxes/care%40agentmail.to/messages/msg_1/attachments/att_1'
  );
  assert.equal(result.downloadUrl, 'https://cdn.example/signed-download');
  assert.equal(result.size, 123);
});
