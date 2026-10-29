import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  AgentMailError,
  createCareDraft,
  createCareInbox,
  deleteCareDraft,
  getInboxThread,
  listInboxThreads,
  replyToCareMessage,
  sendCareDraft,
  sendCareMessage,
  updateCareDraft,
  updateCareMessageLabels,
  verifyAgentMailWebhook,
} from '../../src/lib/integrations/agentmail/api';
import { ApovoStore } from '../../src/lib/store';

const input = {
  username: 'elena.morales',
  displayName: 'Elena Morales (Care Concierge)',
  clientId: 'apovo-patient-patient_1',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('provisions an inbox with the documented v0 request shape', async () => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
  let captured: { url: string; init?: RequestInit } | null = null;
  const fakeFetch: typeof fetch = async (url, init) => {
    captured = { url: String(url), init };
    return jsonResponse({
      inbox_id: 'elena.morales@agentmail.to',
      email: 'elena.morales@agentmail.to',
    });
  };

  const inbox = await createCareInbox(input, fakeFetch);
  assert.equal(inbox.inboxId, 'elena.morales@agentmail.to');
  assert.equal(inbox.email, 'elena.morales@agentmail.to');
  assert.equal(captured!.url, 'https://api.agentmail.to/v0/inboxes');
  const body = JSON.parse(String(captured!.init?.body));
  assert.deepEqual(body, {
    username: 'elena.morales',
    display_name: 'Elena Morales (Care Concierge)',
    client_id: 'apovo-patient-patient_1',
  });
  assert.equal(
    (captured!.init?.headers as Record<string, string>).Authorization,
    'Bearer test-key'
  );
});

test('stores nothing and fails when AgentMail omits the inbox identity', async () => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
  const fakeFetch: typeof fetch = async () => jsonResponse({ email: 'partial@agentmail.to' });
  await assert.rejects(createCareInbox(input, fakeFetch), AgentMailError);
});

test('fails explicitly without credentials or on API errors', async () => {
  delete process.env.AGENTMAIL_API_KEY;
  await assert.rejects(
    createCareInbox(input, async () => jsonResponse({})),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'CONFIGURATION_MISSING');
      return true;
    }
  );

  process.env.AGENTMAIL_API_KEY = 'test-key';
  const forbidden: typeof fetch = async () =>
    jsonResponse({ message: 'Forbidden', secret: 'do-not-leak' }, 403);
  await assert.rejects(createCareInbox(input, forbidden), (error: unknown) => {
    assert.ok(error instanceof AgentMailError);
    assert.equal(error.status, 403);
    assert.ok(!error.message.includes('do-not-leak'));
    return true;
  });
});

test('sends a care email with text and html bodies and returns real IDs', async () => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
  let capturedBody: Record<string, unknown> | null = null;
  const fakeFetch: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body));
    return jsonResponse({ message_id: 'msg_1', thread_id: 'thread_1' });
  };

  const sent = await sendCareMessage(
    {
      inboxId: 'elena@agentmail.to',
      to: ['clinic@example.org'],
      subject: 'Question',
      text: 'Hello\nthere',
    },
    fakeFetch
  );
  assert.deepEqual(sent, { messageId: 'msg_1', threadId: 'thread_1' });
  assert.deepEqual(capturedBody!.to, ['clinic@example.org']);
  assert.equal(capturedBody!.text, 'Hello\nthere');
  assert.ok(typeof capturedBody!.html === 'string');
});

test('replies to an existing AgentMail message and preserves thread identity', async () => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> | null = null;
  const fakeFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body));
    return jsonResponse({ message_id: 'msg_reply_2', thread_id: 'thr_existing_1' });
  };

  const replied = await replyToCareMessage(
    {
      inboxId: 'elena@agentmail.to',
      messageId: 'msg_inbound_1',
      to: ['grants@rememberbetty.com'],
      text: 'Here is my updated diagnosis verification.',
    },
    fakeFetch
  );

  assert.equal(
    capturedUrl,
    'https://api.agentmail.to/v0/inboxes/elena%40agentmail.to/messages/msg_inbound_1/reply'
  );
  assert.deepEqual(replied, { messageId: 'msg_reply_2', threadId: 'thr_existing_1' });
  assert.equal(capturedBody!.text, 'Here is my updated diagnosis verification.');
});

test('creates, updates, sends, and deletes human-in-the-loop AgentMail drafts', async () => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];

  const fakeFetch: typeof fetch = async (url, init) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), method, body });

    if (String(url).endsWith('/drafts') && method === 'POST') {
      return jsonResponse({
        draft_id: 'drf_101',
        thread_id: 'thr_55',
        in_reply_to: 'msg_54',
        to: ['grants@rememberbetty.com'],
        subject: 'Re: Additional information needed',
        text: 'Draft body v1',
      });
    }
    if (String(url).endsWith('/drafts/drf_101') && method === 'PATCH') {
      return jsonResponse({
        draft_id: 'drf_101',
        thread_id: 'thr_55',
        to: ['grants@rememberbetty.com'],
        subject: 'Re: Additional information needed',
        text: body?.text || 'Draft body v2',
      });
    }
    if (String(url).endsWith('/drafts/drf_101/send') && method === 'POST') {
      return jsonResponse({
        message_id: 'msg_sent_102',
        thread_id: 'thr_55',
      });
    }
    if (String(url).endsWith('/drafts/drf_101') && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return jsonResponse({});
  };

  const created = await createCareDraft(
    {
      inboxId: 'elena@agentmail.to',
      to: ['grants@rememberbetty.com'],
      subject: 'Re: Additional information needed',
      text: 'Draft body v1',
      threadId: 'thr_55',
      inReplyTo: 'msg_54',
      labels: ['awaiting_patient_consent'],
    },
    fakeFetch
  );
  assert.equal(created.draftId, 'drf_101');
  assert.equal(created.threadId, 'thr_55');
  assert.equal(created.inReplyTo, 'msg_54');
  assert.equal(calls[0].body?.in_reply_to, 'msg_54');
  assert.equal(calls[0].body?.thread_id, 'thr_55');

  const updated = await updateCareDraft(
    {
      inboxId: 'elena@agentmail.to',
      draftId: 'drf_101',
      text: 'Draft body v2 with patient consent details',
    },
    fakeFetch
  );
  assert.equal(updated.text, 'Draft body v2 with patient consent details');

  const sent = await sendCareDraft(
    {
      inboxId: 'elena@agentmail.to',
      draftId: 'drf_101',
    },
    fakeFetch
  );
  assert.deepEqual(sent, { messageId: 'msg_sent_102', threadId: 'thr_55' });

  await deleteCareDraft({ inboxId: 'elena@agentmail.to', draftId: 'drf_101' }, fakeFetch);
  assert.equal(calls.at(-1)?.method, 'DELETE');
});

test('lists threads, fetches thread details with extracted_text, and updates message labels', async () => {
  process.env.AGENTMAIL_API_KEY = 'test-key';
  const fakeFetch: typeof fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/threads?limit=10')) {
      return jsonResponse({
        threads: [
          {
            thread_id: 'thr_1',
            inbox_id: 'elena@agentmail.to',
            subject: 'Grant status update',
            preview: 'Please confirm your treatment start date.',
            labels: ['unread', 'needs_info'],
            senders: ['grants@rememberbetty.com'],
            recipients: ['elena@agentmail.to'],
            message_count: 2,
            updated_at: '2026-10-26T20:00:00.000Z',
          },
        ],
      });
    }
    if (u.endsWith('/threads/thr_1')) {
      return jsonResponse({
        thread_id: 'thr_1',
        inbox_id: 'elena@agentmail.to',
        subject: 'Grant status update',
        labels: ['needs_info'],
        messages: [
          {
            message_id: 'msg_1',
            thread_id: 'thr_1',
            from: 'grants@rememberbetty.com',
            to: ['elena@agentmail.to'],
            subject: 'Grant status update',
            text: 'Fresh reply text\n\n> Quoted history',
            extracted_text: 'Fresh reply text',
            labels: ['unread'],
            created_at: '2026-10-26T20:00:00.000Z',
          },
        ],
        drafts: [
          {
            draft_id: 'drf_1',
            thread_id: 'thr_1',
            in_reply_to: 'msg_1',
            to: ['grants@rememberbetty.com'],
            subject: 'Re: Grant status update',
            text: 'Staged response',
          },
        ],
      });
    }
    if (u.endsWith('/messages/msg_1') && init?.method === 'PATCH') {
      return jsonResponse({
        message_id: 'msg_1',
        labels: ['needs_info'],
      });
    }
    return jsonResponse({});
  };

  const threads = await listInboxThreads('elena@agentmail.to', { limit: 10 }, fakeFetch);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].threadId, 'thr_1');
  assert.equal(threads[0].messageCount, 2);

  const detail = await getInboxThread('elena@agentmail.to', 'thr_1', fakeFetch);
  assert.equal(detail.messages[0].extractedText, 'Fresh reply text');
  assert.equal(detail.drafts[0].draftId, 'drf_1');

  const labelResult = await updateCareMessageLabels(
    {
      inboxId: 'elena@agentmail.to',
      messageId: 'msg_1',
      addLabels: ['needs_info'],
      removeLabels: ['unread'],
    },
    fakeFetch
  );
  assert.equal(labelResult.messageId, 'msg_1');
  assert.deepEqual(labelResult.labels, ['needs_info']);
});

test('verifies Svix-signed AgentMail webhooks and rejects tampered or expired requests', () => {
  const rawSecret = Buffer.from('super-secret-agentmail-webhook-key').toString('base64');
  const secret = `whsec_${rawSecret}`;
  const svixId = 'msg_2abc123';
  const nowMs = 1_760_000_000_000;
  const svixTimestamp = String(Math.floor(nowMs / 1000));
  const rawBody = JSON.stringify({
    event_id: 'evt_agentmail_001',
    event_type: 'message.received',
    message: {
      message_id: 'msg_99',
      thread_id: 'thr_99',
      inbox_id: 'elena@agentmail.to',
      from: 'grants@rememberbetty.com',
      to: ['elena@agentmail.to'],
      subject: 'Additional information needed by Nov 9',
      extracted_text: 'Please provide your treatment verification letter by Nov 9.',
    },
  });

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = crypto
    .createHmac('sha256', Buffer.from(rawSecret, 'base64'))
    .update(signedPayload, 'utf8')
    .digest('base64');

  const event = verifyAgentMailWebhook(
    rawBody,
    {
      svixId,
      svixTimestamp,
      svixSignature: `v1,${sig}`,
    },
    secret,
    nowMs
  );

  assert.equal(event.event_id, 'evt_agentmail_001');
  assert.equal(event.event_type, 'message.received');
  assert.equal((event.message as Record<string, unknown>).message_id, 'msg_99');

  // Reject tampered payload
  assert.throws(
    () =>
      verifyAgentMailWebhook(
        rawBody.replace('Nov 9', 'Nov 10'),
        { svixId, svixTimestamp, svixSignature: `v1,${sig}` },
        secret,
        nowMs
      ),
    (err: unknown) => err instanceof AgentMailError && err.status === 401
  );

  // Reject expired timestamp (> 5 minutes)
  assert.throws(
    () =>
      verifyAgentMailWebhook(
        rawBody,
        { svixId, svixTimestamp, svixSignature: `v1,${sig}` },
        secret,
        nowMs + 10 * 60 * 1000
      ),
    (err: unknown) => err instanceof AgentMailError && err.status === 401
  );
});

test('ApovoStore links AgentMail drafts with pending items and marks both complete on send', () => {
  const patient = ApovoStore.createPatient({
    first_name: 'Elena',
    last_name: 'Morales',
    care_email: 'elena.morales@agentmail.to',
    agentmail_inbox_id: 'elena.morales@agentmail.to',
  });

  const draft = ApovoStore.saveDraft({
    draft_id: 'drf_test_900',
    inbox_id: 'elena.morales@agentmail.to',
    thread_id: 'thr_test_900',
    in_reply_to: 'msg_test_899',
    patient_id: patient.id,
    program_name: 'Remember Betty',
    to: ['grants@rememberbetty.com'],
    subject: 'Re: Verification',
    text: 'Draft reply awaiting consent',
    kind: 'reply_consent',
    reason: 'Needs patient consent before sending',
    status: 'pending_consent',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const task = ApovoStore.createTask({
    patient_id: patient.id,
    program_name: 'Remember Betty',
    type: 'consent_reply',
    title: 'Consent to send reply to Remember Betty',
    why: 'Agent prepared a draft reply.',
    shared_with: 'Remember Betty',
    thread_id: 'thr_test_900',
    draft_id: draft.draft_id,
  });

  ApovoStore.updateDraft(draft.draft_id, { linked_task_id: task.id });

  const unifiedBefore = ApovoStore.getUnifiedPendingItems(patient.id).filter(
    (item) => item.status === 'open'
  );
  assert.ok(unifiedBefore.some((item) => item.id === task.id && item.draft?.draft_id === 'drf_test_900'));

  ApovoStore.markDraftSent(draft.draft_id, 'msg_sent_901', 'thr_test_900');

  const updatedTask = ApovoStore.getTask(task.id);
  assert.equal(updatedTask?.status, 'answered');
});
