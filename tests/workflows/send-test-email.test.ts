import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentMailError } from '../../src/lib/integrations/agentmail/api';
import { deliverSyntheticDemoPacket } from '../../src/lib/integrations/agentmail/application-test-delivery';

const packet = new TextEncoder().encode('%PDF-1.7 synthetic packet');

test('sends once to the fixed recipient with a stable client ID', async () => {
  let draftCalls = 0;
  let sendCalls = 0;
  const result = await deliverSyntheticDemoPacket(
    {
      inboxId: 'sender@agentmail.to',
      runId: 'workflow_run_test',
      clientId: 'workflow_step_test',
      packetBytes: packet,
    },
    {
      createDraft: async (input) => {
        draftCalls += 1;
        assert.deepEqual(input.to, ['nicole.wu.mail@gmail.com']);
        assert.equal(input.clientId, 'workflow_step_test');
        return {
          draftId: 'draft_test',
          threadId: 'thread_test',
          inboxId: input.inboxId,
          to: input.to,
          subject: input.subject || '',
          text: input.text,
          html: input.html || '',
          labels: input.labels || [],
          attachments: [],
          createdAt: '2026-10-29T18:00:00.000Z',
          updatedAt: '2026-10-29T18:00:00.000Z',
        };
      },
      sendDraft: async () => {
        sendCalls += 1;
        return { messageId: 'message_test', threadId: 'thread_test' };
      },
      now: () => '2026-10-29T18:00:00.000Z',
    }
  );

  assert.equal(draftCalls, 1);
  assert.equal(sendCalls, 1);
  assert.equal(result.messageId, 'message_test');
  assert.equal(result.recipient, 'nicole.wu.mail@gmail.com');
});

test('makes no send call for an invalid packet and classifies an ambiguous send', async () => {
  let sendCalls = 0;
  await assert.rejects(() =>
    deliverSyntheticDemoPacket(
      {
        inboxId: 'sender@agentmail.to',
        runId: 'workflow_run_test',
        clientId: 'workflow_step_test',
        packetBytes: new Uint8Array(),
      },
      {
        createDraft: async () => { throw new Error('unreachable'); },
        sendDraft: async () => {
          sendCalls += 1;
          return { messageId: 'no', threadId: 'no' };
        },
      }
    )
  );
  assert.equal(sendCalls, 0);

  await assert.rejects(
    () =>
      deliverSyntheticDemoPacket(
        {
          inboxId: 'sender@agentmail.to',
          runId: 'workflow_run_test',
          clientId: 'workflow_step_test',
          packetBytes: packet,
        },
        {
          createDraft: async () => ({
            draftId: 'draft_test',
            threadId: 'thread_test',
            inboxId: 'sender@agentmail.to',
            to: ['nicole.wu.mail@gmail.com'],
            subject: 'test',
            text: 'test',
            html: '',
            labels: [],
            attachments: [],
            createdAt: '2026-10-29T18:00:00.000Z',
            updatedAt: '2026-10-29T18:00:00.000Z',
          }),
          sendDraft: async () => {
            throw new AgentMailError('provider timeout', 503);
          },
        }
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'AgentMail did not return a conclusive result. Do not resend automatically.'
  );
});
