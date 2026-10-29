import { ApplicationRunError } from '../../application-agent/errors';
import {
  assertApprovedTestRun,
  REMEMBER_BETTY_TEST_RECIPIENT,
} from '../../application-agent/test-mode-policy';
import type { ApplicationRun } from '../../application-agent/types';
import {
  AgentMailError,
  createCareDraft,
  sendCareDraft,
  type AgentMailDraftItem,
  type AgentMailSentMessage,
} from './api';

interface DeliveryDependencies {
  createDraft?: typeof createCareDraft;
  sendDraft?: typeof sendCareDraft;
  persistDraft?: (draftId: string) => void;
  persistAttempt?: (attemptedAt: string) => void;
  persistSuccess?: (sent: AgentMailSentMessage, sentAt: string) => void;
  now?: () => string;
}

export interface SyntheticDemoDeliveryDependencies {
  createDraft?: typeof createCareDraft;
  sendDraft?: typeof sendCareDraft;
  now?: () => string;
}

export interface ApplicationTestDeliveryResult {
  recipient: typeof REMEMBER_BETTY_TEST_RECIPIENT;
  draftId: string;
  messageId: string;
  threadId: string;
  sentAt: string;
}

function ambiguousSendError(error: unknown): boolean {
  return !(error instanceof AgentMailError) || error.status >= 500;
}

export async function deliverSyntheticDemoPacket(
  input: {
    inboxId: string;
    runId: string;
    clientId: string;
    packetBytes: Uint8Array;
  },
  dependencies: SyntheticDemoDeliveryDependencies = {}
): Promise<ApplicationTestDeliveryResult> {
  if (!input.inboxId.trim()) {
    throw new ApplicationRunError(
      'CONFIGURATION_MISSING',
      'A configured AgentMail inbox is required for the application test.'
    );
  }
  if (
    !input.runId.trim() ||
    !input.clientId.trim() ||
    input.packetBytes.byteLength < 8 ||
    input.packetBytes.byteLength > 5 * 1024 * 1024 ||
    new TextDecoder().decode(input.packetBytes.subarray(0, 5)) !== '%PDF-'
  ) {
    throw new ApplicationRunError(
      'PACKET_INCOMPLETE',
      'The bounded synthetic test packet is missing or invalid.'
    );
  }

  const createDraft = dependencies.createDraft || createCareDraft;
  const sendDraft = dependencies.sendDraft || sendCareDraft;
  const now = dependencies.now || (() => new Date().toISOString());
  let draft: AgentMailDraftItem;
  try {
    draft = await createDraft({
      inboxId: input.inboxId,
      to: [REMEMBER_BETTY_TEST_RECIPIENT],
      subject: '[APOVO TEST] Remember Betty synthetic application packet — Ava Testperson',
      text: [
        'This is an automated Apovo end-to-end test using fictional information only.',
        `Workflow run ID: ${input.runId}`,
        '',
        'The attached PDF is visibly marked as synthetic and was not submitted to Remember Betty.',
        'No real patient information was used.',
      ].join('\n'),
      labels: ['apovo_application_test', 'remember_betty_test'],
      clientId: input.clientId,
      attachments: [
        {
          filename: 'remember-betty-test-packet.pdf',
          content_type: 'application/pdf',
          content: Buffer.from(input.packetBytes).toString('base64'),
        },
      ],
    });
  } catch {
    throw new ApplicationRunError(
      'TEST_DELIVERY_FAILED',
      'AgentMail could not create the synthetic test draft.'
    );
  }

  let sent: AgentMailSentMessage;
  try {
    sent = await sendDraft({ inboxId: input.inboxId, draftId: draft.draftId });
  } catch (error) {
    if (ambiguousSendError(error)) {
      throw new ApplicationRunError(
        'TEST_DELIVERY_UNCERTAIN',
        'AgentMail did not return a conclusive result. Do not resend automatically.'
      );
    }
    throw new ApplicationRunError(
      'TEST_DELIVERY_FAILED',
      'AgentMail rejected the synthetic test email.'
    );
  }

  return {
    recipient: REMEMBER_BETTY_TEST_RECIPIENT,
    draftId: draft.draftId,
    messageId: sent.messageId,
    threadId: sent.threadId,
    sentAt: now(),
  };
}

export async function deliverRememberBettySyntheticPacket(
  input: {
    run: ApplicationRun;
    inboxId: string;
    packetBytes: Uint8Array;
  },
  dependencies: DeliveryDependencies = {}
): Promise<ApplicationTestDeliveryResult> {
  assertApprovedTestRun(input.run);
  if (!input.inboxId.trim()) {
    throw new ApplicationRunError(
      'CONFIGURATION_MISSING',
      'A configured AgentMail inbox is required for the application test.'
    );
  }
  if (input.packetBytes.byteLength === 0) {
    throw new ApplicationRunError('PACKET_INCOMPLETE', 'The synthetic test packet is missing.');
  }
  if (input.run.agentmail_message_id && input.run.agentmail_thread_id) {
    return {
      recipient: REMEMBER_BETTY_TEST_RECIPIENT,
      draftId: input.run.agentmail_draft_id || '',
      messageId: input.run.agentmail_message_id,
      threadId: input.run.agentmail_thread_id,
      sentAt: input.run.test_email_sent_at || input.run.updated_at,
    };
  }
  if (input.run.delivery_attempted_at) {
    throw new ApplicationRunError(
      'TEST_DELIVERY_UNCERTAIN',
      'The previous test-email attempt needs manual reconciliation before another send.'
    );
  }

  const createDraft = dependencies.createDraft || createCareDraft;
  const sendDraft = dependencies.sendDraft || sendCareDraft;
  const now = dependencies.now || (() => new Date().toISOString());
  let draftId = input.run.agentmail_draft_id || '';

  if (!draftId) {
    let draft: AgentMailDraftItem;
    try {
      draft = await createDraft({
        inboxId: input.inboxId,
        to: [REMEMBER_BETTY_TEST_RECIPIENT],
        subject: '[APOVO TEST] Remember Betty synthetic application packet — Ava Testperson',
        text: [
          'This is an automated Apovo end-to-end test.',
          `Run ID: ${input.run.id}`,
          `Fixture: ${input.run.synthetic_fixture_version}`,
          '',
          'Every applicant, medical, and financial detail in the attached PDF is synthetic.',
          'This packet was not sent to Remember Betty and is not a real application.',
          'Please confirm that the email arrived and the attached PDF opens correctly.',
        ].join('\n'),
        labels: ['apovo_application_test', 'remember_betty_test'],
        clientId: `apovo-rb-test-${input.run.id}`,
        attachments: [
          {
            filename: 'remember-betty-test-packet.pdf',
            content_type: 'application/pdf',
            content: Buffer.from(input.packetBytes).toString('base64'),
          },
        ],
      });
    } catch (error) {
      if (error instanceof ApplicationRunError) throw error;
      throw new ApplicationRunError(
        'TEST_DELIVERY_FAILED',
        'AgentMail could not create the synthetic test draft.'
      );
    }
    draftId = draft.draftId;
    dependencies.persistDraft?.(draftId);
  }

  const attemptedAt = now();
  dependencies.persistAttempt?.(attemptedAt);
  let sent: AgentMailSentMessage;
  try {
    sent = await sendDraft({ inboxId: input.inboxId, draftId });
  } catch (error) {
    if (ambiguousSendError(error)) {
      throw new ApplicationRunError(
        'TEST_DELIVERY_UNCERTAIN',
        'AgentMail did not return a conclusive result. Do not resend automatically.'
      );
    }
    throw new ApplicationRunError(
      'TEST_DELIVERY_FAILED',
      'AgentMail rejected the synthetic test email.'
    );
  }

  const sentAt = now();
  dependencies.persistSuccess?.(sent, sentAt);
  return {
    recipient: REMEMBER_BETTY_TEST_RECIPIENT,
    draftId,
    messageId: sent.messageId,
    threadId: sent.threadId,
    sentAt,
  };
}
