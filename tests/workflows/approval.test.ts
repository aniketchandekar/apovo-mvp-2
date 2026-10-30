import assert from 'node:assert/strict';
import test from 'node:test';
import { runRememberBettyDemoCore } from '../../src/lib/demo-workflow/orchestrator';

const source = {
  bytesBase64: Buffer.from('%PDF-source').toString('base64'),
  byteLength: 11,
  pageCount: 3,
  sha256: 'source-hash',
};
const packet = {
  packetBase64: Buffer.from('%PDF-packet').toString('base64'),
  byteLength: 11,
  pageCount: 5,
  sha256: 'packet-hash',
};

test('waits for explicit approval before making one email call', async () => {
  const order: string[] = [];
  const emitted: Array<{
    phase: string;
    packet?: { artifactId: string; byteLength: number; pageCount: number; sha256: string };
  }> = [];
  const result = await runRememberBettyDemoCore(
    { runId: 'workflow_run_test', sessionExpiresAt: '2026-10-29T18:15:00.000Z' },
    {
      discover: async () => { order.push('discover'); return source; },
      buildPacket: async () => { order.push('packet'); return packet; },
      awaitApproval: async () => { order.push('approval'); return true; },
      sendEmail: async () => {
        order.push('email');
        return { messageId: 'message_test', threadId: 'thread_test', sentAt: '2026-10-29T18:05:00.000Z' };
      },
      emit: async (event) => {
        order.push(`event:${event.phase}`);
        emitted.push(event);
      },
    }
  );

  assert.ok(order.indexOf('approval') < order.indexOf('email'));
  assert.equal(order.filter((item) => item === 'email').length, 1);
  assert.deepEqual(emitted[0], {
    phase: 'awaiting_approval',
    message: 'The synthetic packet is ready. Confirm the single test-email attempt to continue.',
    packet: {
      artifactId: 'packet_packet-hash',
      byteLength: 11,
      pageCount: 5,
      sha256: 'packet-hash',
    },
  });
  assert.equal('base64' in (emitted[0].packet || {}), false);
  assert.equal(result.messageId, 'message_test');
});

test('does not send when approval expires or is declined', async () => {
  let sends = 0;
  await assert.rejects(() =>
    runRememberBettyDemoCore(
      { runId: 'workflow_run_test', sessionExpiresAt: '2026-10-29T18:15:00.000Z' },
      {
        discover: async () => source,
        buildPacket: async () => packet,
        awaitApproval: async () => false,
        sendEmail: async () => {
          sends += 1;
          return { messageId: 'no', threadId: 'no', sentAt: 'no' };
        },
        emit: async () => undefined,
      }
    )
  );
  assert.equal(sends, 0);
});
