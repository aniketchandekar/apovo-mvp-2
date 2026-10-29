import { createHook, getWorkflowMetadata, getWritable, sleep } from 'workflow';
import { startBrowserbaseSession } from '@/lib/integrations/browserbase/client';
import { downloadApplicationPdfBytes } from '@/lib/integrations/browserbase/download-bytes';
import { inspectRememberBettySite } from '@/lib/application-agent/phases/inspect-site';
import { deliverSyntheticDemoPacket } from '@/lib/integrations/agentmail/application-test-delivery';
import { runSyntheticBrowserDiscovery } from '@/lib/demo-workflow/browser-discovery';
import { buildSyntheticDemoPacket } from '@/lib/demo-workflow/build-packet';
import type { DemoWorkflowEvent } from '@/lib/demo-workflow/types';

export interface RememberBettyDemoInput {
  sessionId: string;
  sessionExpiresAt: string;
}

export type RememberBettyDemoResult =
  | { status: 'sent'; messageId: string; threadId: string; sentAt: string }
  | { status: 'expired' | 'declined' | 'failed' | 'delivery_uncertain' }
  | { status: 'duplicate'; ownerRunId: string };

export function demoRunGuardToken(sessionId: string) {
  return `apovo-demo-run:${sessionId}`;
}

export function demoApprovalToken(sessionId: string) {
  return `apovo-demo-approval:${sessionId}`;
}

async function writeEvent(
  writable: WritableStream<DemoWorkflowEvent>,
  event: DemoWorkflowEvent
) {
  const writer = writable.getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function emitDemoEventStep(
  writable: WritableStream<DemoWorkflowEvent>,
  event: DemoWorkflowEvent
) {
  'use step';
  await writeEvent(writable, event);
}
emitDemoEventStep.maxRetries = 0;

async function discoverApplicationStep(
  workflowRunId: string,
  writable: WritableStream<DemoWorkflowEvent>
) {
  'use step';
  return runSyntheticBrowserDiscovery({
    runId: workflowRunId,
    startSession: (runId) => startBrowserbaseSession(runId, 'remember-betty-foundation'),
    inspectSite: inspectRememberBettySite,
    downloadPdf: downloadApplicationPdfBytes,
    emit: (event) => writeEvent(writable, event),
  });
}
discoverApplicationStep.maxRetries = 2;

async function buildPacketStep(
  sourcePdfBase64: string,
  writable: WritableStream<DemoWorkflowEvent>
) {
  'use step';
  return buildSyntheticDemoPacket({
    sourcePdfBase64,
    emit: (event) => writeEvent(writable, event),
  });
}
buildPacketStep.maxRetries = 0;

async function sendTestEmailStep(input: {
  workflowRunId: string;
  packetBase64: string;
}): Promise<
  | { ok: true; messageId: string; threadId: string; sentAt: string }
  | { ok: false; uncertain: boolean }
> {
  'use step';
  const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim() || '';
  try {
    const delivered = await deliverSyntheticDemoPacket({
      inboxId,
      runId: input.workflowRunId,
      clientId: `apovo-demo-${input.workflowRunId}`,
      packetBytes: Uint8Array.from(Buffer.from(input.packetBase64, 'base64')),
    });
    return {
      ok: true,
      messageId: delivered.messageId,
      threadId: delivered.threadId,
      sentAt: delivered.sentAt,
    };
  } catch (error) {
    return {
      ok: false,
      uncertain:
        error instanceof Error &&
        'code' in error &&
        error.code === 'TEST_DELIVERY_UNCERTAIN',
    };
  }
}
sendTestEmailStep.maxRetries = 0;

export async function rememberBettyDemoWorkflow(
  input: RememberBettyDemoInput
): Promise<RememberBettyDemoResult> {
  'use workflow';

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<DemoWorkflowEvent>();
  const runGuard = createHook({
    token: demoRunGuardToken(input.sessionId),
    experimental_minRetention: '15m',
  });
  const conflict = await runGuard.getConflict();
  if (conflict) {
    await emitDemoEventStep(writable, {
      phase: 'failed',
      message: 'This demo session already started another application workflow.',
    });
    return { status: 'duplicate', ownerRunId: conflict.runId };
  }

  let packet: Awaited<ReturnType<typeof buildPacketStep>>;
  try {
    const source = await discoverApplicationStep(workflowRunId, writable);
    packet = await buildPacketStep(source.bytesBase64, writable);
  } catch {
    await emitDemoEventStep(writable, {
      phase: 'failed',
      message: 'The synthetic application could not be prepared. No email was sent.',
    });
    return { status: 'failed' };
  }

  if (Date.now() >= new Date(input.sessionExpiresAt).getTime()) {
    await emitDemoEventStep(writable, {
      phase: 'failed',
      message: 'The 15-minute demo session expired before approval. No email was sent.',
    });
    return { status: 'expired' };
  }

  using approval = createHook<{ approved: boolean }>({
    token: demoApprovalToken(input.sessionId),
  });
  await approval.getConflict();
  await emitDemoEventStep(writable, {
    phase: 'awaiting_approval',
    message: 'Review the synthetic packet, then confirm the single test-email attempt.',
  });

  const approvalPromise = approval.then((payload) => payload);
  const decision = await Promise.race([
    approvalPromise,
    sleep(new Date(input.sessionExpiresAt)).then(() => null),
  ]);
  if (!decision?.approved) {
    await emitDemoEventStep(writable, {
      phase: 'failed',
      message: decision
        ? 'Email delivery was declined. Nothing was sent.'
        : 'The 15-minute demo session expired before approval. No email was sent.',
    });
    return { status: decision ? 'declined' : 'expired' };
  }

  await emitDemoEventStep(writable, {
    phase: 'sending_email',
    message: 'Sending one synthetic packet to the fixed test recipient.',
  });
  const delivered = await sendTestEmailStep({
    workflowRunId,
    packetBase64: packet.packetBase64,
  });
  if (!delivered.ok) {
    await emitDemoEventStep(writable, {
      phase: delivered.uncertain ? 'delivery_uncertain' : 'failed',
      message: delivered.uncertain
        ? 'AgentMail returned an uncertain result. The demo will not retry automatically.'
        : 'The synthetic email could not be sent. The demo will not retry automatically.',
    });
    return { status: delivered.uncertain ? 'delivery_uncertain' : 'failed' };
  }

  await emitDemoEventStep(writable, {
    phase: 'email_sent',
    message: 'The synthetic test email was accepted. Nothing was submitted to the foundation.',
  });
  return { status: 'sent', ...delivered };
}
