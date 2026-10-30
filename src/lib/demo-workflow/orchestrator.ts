import type { EmitDemoWorkflowEvent } from './types';
import { demoPacketArtifactId } from './types';
import type { SyntheticBrowserDiscoveryResult } from './browser-discovery';

interface PacketResult {
  packetBase64: string;
  byteLength: number;
  pageCount: number;
  sha256: string;
}

interface DeliveryResult {
  messageId: string;
  threadId: string;
  sentAt: string;
}

interface DemoWorkflowDependencies {
  discover: () => Promise<SyntheticBrowserDiscoveryResult>;
  buildPacket: (source: SyntheticBrowserDiscoveryResult) => Promise<PacketResult>;
  awaitApproval: (input: {
    runId: string;
    sessionExpiresAt: string;
    packet: PacketResult;
  }) => Promise<boolean>;
  sendEmail: (input: { runId: string; packet: PacketResult }) => Promise<DeliveryResult>;
  emit: EmitDemoWorkflowEvent;
}

export async function runRememberBettyDemoCore(
  input: { runId: string; sessionExpiresAt: string },
  dependencies: DemoWorkflowDependencies
) {
  const source = await dependencies.discover();
  const packet = await dependencies.buildPacket(source);
  await dependencies.emit({
    phase: 'awaiting_approval',
    message: 'The synthetic packet is ready. Confirm the single test-email attempt to continue.',
    packet: {
      artifactId: demoPacketArtifactId(packet.sha256),
      byteLength: packet.byteLength,
      pageCount: packet.pageCount,
      sha256: packet.sha256,
    },
  });

  const approved = await dependencies.awaitApproval({
    runId: input.runId,
    sessionExpiresAt: input.sessionExpiresAt,
    packet,
  });
  if (!approved) throw new Error('The synthetic email was not approved before session expiry.');

  await dependencies.emit({
    phase: 'sending_email',
    message: 'Sending one synthetic packet to the approved test recipient.',
  });
  const delivered = await dependencies.sendEmail({ runId: input.runId, packet });
  await dependencies.emit({
    phase: 'email_sent',
    message: 'The synthetic test email was accepted. Nothing was submitted to the foundation.',
  });
  return delivered;
}
