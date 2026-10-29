import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentMailError, type AgentMailDraftItem } from '../../src/lib/integrations/agentmail/api';
import { deliverRememberBettySyntheticPacket } from '../../src/lib/integrations/agentmail/application-test-delivery';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';
import type { ApplicationRun } from '../../src/lib/application-agent/types';

process.env.APOVO_APPLICATION_TEST_MODE = '1';

function run(overrides: Partial<ApplicationRun> = {}): ApplicationRun {
  return {
    id: 'run_test_delivery',
    application_id: 'app_remember-betty_patient',
    patient_id: 'patient',
    state: 'active',
    current_phase: 'sending_test_email',
    source_url: 'https://www.rememberbetty.com/apply-for-assistance',
    delivery_mode: 'test_email',
    test_recipient: 'nicole.wu.mail@gmail.com',
    synthetic_fixture_version: 'remember-betty-synthetic-v1',
    created_at: '2026-10-28T00:00:00.000Z',
    updated_at: '2026-10-28T00:00:00.000Z',
    ...overrides,
  };
}

function draft(): AgentMailDraftItem {
  return {
    draftId: 'draft_1',
    inboxId: 'sender@agentmail.to',
    to: ['nicole.wu.mail@gmail.com'],
    subject: 'test',
    text: 'test',
    html: '<p>test</p>',
    labels: [],
    attachments: [],
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
  };
}

test('hard-locks recipient, attaches exact bytes, and persists before send', async () => {
  const calls: string[] = [];
  const bytes = new TextEncoder().encode('%PDF-synthetic-packet');
  const result = await deliverRememberBettySyntheticPacket(
    { run: run(), inboxId: 'sender@agentmail.to', packetBytes: bytes },
    {
      createDraft: async (input) => {
        calls.push(`create:${input.to?.join(',')}`);
        assert.deepEqual(input.to, ['nicole.wu.mail@gmail.com']);
        assert.deepEqual(Buffer.from(input.attachments![0].content, 'base64'), Buffer.from(bytes));
        return draft();
      },
      persistDraft: (id) => calls.push(`draft:${id}`),
      persistAttempt: () => calls.push('attempt'),
      sendDraft: async () => {
        calls.push('send');
        return { messageId: 'message_1', threadId: 'thread_1' };
      },
      persistSuccess: () => calls.push('success'),
      now: () => '2026-10-28T01:00:00.000Z',
    }
  );
  assert.equal(result.recipient, 'nicole.wu.mail@gmail.com');
  assert.deepEqual(calls, [
    'create:nicole.wu.mail@gmail.com',
    'draft:draft_1',
    'attempt',
    'send',
    'success',
  ]);
});

test('does not resend confirmed or previously attempted deliveries', async () => {
  let calls = 0;
  const confirmed = await deliverRememberBettySyntheticPacket(
    {
      run: run({
        agentmail_draft_id: 'draft_1',
        agentmail_message_id: 'message_1',
        agentmail_thread_id: 'thread_1',
      }),
      inboxId: 'sender@agentmail.to',
      packetBytes: new Uint8Array([1]),
    },
    { sendDraft: async () => { calls += 1; return { messageId: '', threadId: '' }; } }
  );
  assert.equal(confirmed.messageId, 'message_1');
  assert.equal(calls, 0);

  await assert.rejects(
    deliverRememberBettySyntheticPacket({
      run: run({ agentmail_draft_id: 'draft_1', delivery_attempted_at: '2026-10-28T01:00:00Z' }),
      inboxId: 'sender@agentmail.to',
      packetBytes: new Uint8Array([1]),
    }),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'TEST_DELIVERY_UNCERTAIN'
  );
});

test('classifies ambiguous send failures separately from provider rejection', async () => {
  const baseDependencies = {
    createDraft: async () => draft(),
    persistDraft: () => undefined,
    persistAttempt: () => undefined,
  };
  await assert.rejects(
    deliverRememberBettySyntheticPacket(
      { run: run(), inboxId: 'sender@agentmail.to', packetBytes: new Uint8Array([1]) },
      { ...baseDependencies, sendDraft: async () => { throw new AgentMailError('timeout'); } }
    ),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'TEST_DELIVERY_UNCERTAIN'
  );
  await assert.rejects(
    deliverRememberBettySyntheticPacket(
      { run: run(), inboxId: 'sender@agentmail.to', packetBytes: new Uint8Array([1]) },
      { ...baseDependencies, sendDraft: async () => { throw new AgentMailError('rejected', 400); } }
    ),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'TEST_DELIVERY_FAILED'
  );
});
