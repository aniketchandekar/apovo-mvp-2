import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  composeIntegrationTestEmail,
  type ComposedIntegrationTestEmail,
} from '../gemini/email-composer';
import {
  createCareDraft,
  getInboxMessage,
  getInboxMessageAttachment,
  sendCareDraft,
  type AgentMailAttachmentInput,
  type AgentMailDraftItem,
  type AgentMailMessageItem,
  type AgentMailSentMessage,
} from './api';

export const INTEGRATION_TEST_RECIPIENT = 'nicole.wu.mail@gmail.com';
export const INTEGRATION_TEST_CONFIRMATION = 'SEND_TO_NICOLE';

export class CareEmailIntegrationTestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CareEmailIntegrationTestError';
    this.status = status;
  }
}

interface IntegrationTestDependencies {
  compose?: typeof composeIntegrationTestEmail;
  createDraft?: typeof createCareDraft;
  sendDraft?: typeof sendCareDraft;
  getMessage?: typeof getInboxMessage;
  getAttachment?: typeof getInboxMessageAttachment;
  fetchImpl?: typeof fetch;
}

export interface CareEmailIntegrationTestResult {
  testRunId: string;
  recipient: string;
  source: 'gemini';
  model: string;
  subject: string;
  text: string;
  draftId: string;
  messageId: string;
  threadId: string;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    contentType: string;
    size: number;
    sha256: string;
    verified: true;
  }>;
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function syntheticPdf(testRunId: string, documentName: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Apovo integration test', { x: 72, y: 700, size: 22, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(documentName, { x: 72, y: 660, size: 15, font });
  page.drawText(`Test run ID: ${testRunId}`, { x: 72, y: 620, size: 11, font });
  page.drawText('Synthetic document. No patient data.', { x: 72, y: 590, size: 11, font });
  page.drawText('No grant application was submitted.', { x: 72, y: 560, size: 11, font });
  return document.save();
}

function addressOnly(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

export function assertIntegrationTestAccess(input: {
  enabled: boolean;
  confirmation?: string;
  recipient?: string;
}): void {
  if (!input.enabled) {
    throw new CareEmailIntegrationTestError('The email integration test is not available.', 404);
  }
  if (input.confirmation !== INTEGRATION_TEST_CONFIRMATION) {
    throw new CareEmailIntegrationTestError('Explicit test confirmation is required.', 403);
  }
  if ((input.recipient || '').trim().toLowerCase() !== INTEGRATION_TEST_RECIPIENT) {
    throw new CareEmailIntegrationTestError('This test may only email the approved test recipient.', 403);
  }
}

export async function runCareEmailIntegrationTest(
  input: { inboxId: string; testRunId?: string; recipient: string },
  dependencies: IntegrationTestDependencies = {}
): Promise<CareEmailIntegrationTestResult> {
  if (input.recipient.trim().toLowerCase() !== INTEGRATION_TEST_RECIPIENT) {
    throw new CareEmailIntegrationTestError('This test may only email the approved test recipient.', 403);
  }
  if (!input.inboxId.trim()) {
    throw new CareEmailIntegrationTestError('AgentMail is not configured for the integration test.', 409);
  }

  const testRunId = input.testRunId?.trim() || `email_test_${crypto.randomUUID()}`;
  const filenames = ['apovo-test-application.pdf', 'apovo-test-supporting-document.pdf'];
  const sourceDocuments = await Promise.all(
    filenames.map((filename, index) => syntheticPdf(testRunId, `Synthetic PDF ${index + 1}: ${filename}`))
  );
  const attachments: AgentMailAttachmentInput[] = filenames.map((filename, index) => ({
    filename,
    content_type: 'application/pdf',
    content: Buffer.from(sourceDocuments[index]).toString('base64'),
  }));

  const compose = dependencies.compose || composeIntegrationTestEmail;
  const createDraft = dependencies.createDraft || createCareDraft;
  const sendDraft = dependencies.sendDraft || sendCareDraft;
  const getMessage = dependencies.getMessage || getInboxMessage;
  const getAttachment = dependencies.getAttachment || getInboxMessageAttachment;
  const fetchImpl = dependencies.fetchImpl || fetch;

  const composed: ComposedIntegrationTestEmail = await compose({ testRunId, attachmentFilenames: filenames });
  const draft: AgentMailDraftItem = await createDraft(
    {
      inboxId: input.inboxId,
      to: [INTEGRATION_TEST_RECIPIENT],
      subject: composed.subject,
      text: composed.text,
      labels: ['apovo_integration_test'],
      clientId: `apovo-email-test-${testRunId}`,
      attachments,
    },
    dependencies.fetchImpl
  );
  const sent: AgentMailSentMessage = await sendDraft(
    { inboxId: input.inboxId, draftId: draft.draftId },
    dependencies.fetchImpl
  );
  const message: AgentMailMessageItem = await getMessage(input.inboxId, sent.messageId, dependencies.fetchImpl);
  if (
    message.to.length !== 1 ||
    addressOnly(message.to[0]) !== INTEGRATION_TEST_RECIPIENT ||
    message.attachments.length !== filenames.length
  ) {
    throw new CareEmailIntegrationTestError('AgentMail returned unexpected recipient or attachment metadata.', 502);
  }

  const verifiedAttachments: CareEmailIntegrationTestResult['attachments'] = [];
  for (const [index, filename] of filenames.entries()) {
    const metadata = message.attachments.find((item) => item.filename === filename);
    if (!metadata?.attachmentId) {
      throw new CareEmailIntegrationTestError('AgentMail omitted a test attachment.', 502);
    }
    const downloadable = await getAttachment(
      { inboxId: input.inboxId, messageId: sent.messageId, attachmentId: metadata.attachmentId },
      dependencies.fetchImpl
    );
    const response = await fetchImpl(downloadable.downloadUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new CareEmailIntegrationTestError('A stored test attachment could not be downloaded.', 502);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== sha256(sourceDocuments[index])) {
      throw new CareEmailIntegrationTestError('A stored test attachment failed its checksum verification.', 502);
    }
    verifiedAttachments.push({
      attachmentId: metadata.attachmentId,
      filename,
      contentType: metadata.contentType || 'application/pdf',
      size: bytes.byteLength,
      sha256: sha256(bytes),
      verified: true,
    });
  }

  return {
    testRunId,
    recipient: INTEGRATION_TEST_RECIPIENT,
    source: composed.source,
    model: composed.model,
    subject: composed.subject,
    text: composed.text,
    draftId: draft.draftId,
    messageId: sent.messageId,
    threadId: sent.threadId,
    attachments: verifiedAttachments,
  };
}
