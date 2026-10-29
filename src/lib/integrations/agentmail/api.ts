import crypto from 'crypto';
import { ApplicationRunError } from '../../application-agent/errors';

const AGENTMAIL_API_BASE_URL = 'https://api.agentmail.to/v0';
const MAX_INLINE_REQUEST_BYTES = 6 * 1024 * 1024;

export interface AgentMailInboxIdentity {
  inboxId: string;
  email: string;
}

export interface AgentMailSentMessage {
  messageId: string;
  threadId: string;
}

export interface AgentMailAttachmentInput {
  content: string;
  filename: string;
  content_type: string;
}

export interface AgentMailAttachmentMetadata {
  attachmentId: string;
  filename: string;
  contentType: string;
  size?: number;
}

export interface AgentMailAttachmentDownload extends AgentMailAttachmentMetadata {
  size: number;
  downloadUrl: string;
  expiresAt: string;
}

export interface AgentMailMessageItem {
  messageId: string;
  threadId: string;
  inboxId: string;
  inReplyTo?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html: string;
  extractedText?: string;
  extractedHtml?: string;
  labels: string[];
  attachments: AgentMailAttachmentMetadata[];
  createdAt: string;
  bodyUrl?: string;
}

export interface AgentMailDraftItem {
  draftId: string;
  inboxId: string;
  threadId?: string;
  inReplyTo?: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  labels: string[];
  attachments: AgentMailAttachmentMetadata[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentMailThreadSummary {
  threadId: string;
  inboxId: string;
  subject: string;
  preview: string;
  labels: string[];
  senders: string[];
  recipients: string[];
  messageCount: number;
  updatedAt: string;
}

export interface AgentMailThreadDetail {
  threadId: string;
  inboxId: string;
  subject: string;
  labels: string[];
  messages: AgentMailMessageItem[];
  drafts: AgentMailDraftItem[];
}

export interface AgentMailWebhookEvent {
  event_id: string;
  event_type:
    | 'message.received'
    | 'message.sent'
    | 'message.delivered'
    | 'message.bounced'
    | 'message.complained'
    | 'message.rejected'
    | string;
  timestamp?: string;
  message?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export class AgentMailError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 502, code?: string) {
    super(message);
    this.name = 'AgentMailError';
    this.status = status;
    this.code = code;
  }
}

function normalizeAttachmentInputs(
  attachments: AgentMailAttachmentInput[] | undefined
): AgentMailAttachmentInput[] {
  return (attachments || []).map((attachment) => {
    const content = attachment.content.trim();
    const filename = attachment.filename.trim();
    const contentType = attachment.content_type.trim().toLowerCase();
    if (
      !filename ||
      filename.length > 255 ||
      /[\r\n\0/\\]/.test(filename) ||
      !/^[a-z0-9!#$&+.^_-]+\/[a-z0-9!#$&+.^_-]+$/i.test(contentType) ||
      !content ||
      content.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
    ) {
      throw new AgentMailError('An attachment is invalid.', 400, 'invalid_attachment');
    }
    const bytes = Buffer.from(content, 'base64');
    if (bytes.length === 0 || bytes.toString('base64') !== content) {
      throw new AgentMailError('An attachment is invalid.', 400, 'invalid_attachment');
    }
    return { content, filename, content_type: contentType };
  });
}

function addAttachmentsAndCheckSize(
  body: Record<string, unknown>,
  attachments: AgentMailAttachmentInput[] | undefined,
  field: 'attachments' | 'add_attachments' = 'attachments'
): void {
  if (!attachments) return;
  body[field] = normalizeAttachmentInputs(attachments);
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') >= MAX_INLINE_REQUEST_BYTES) {
    throw new AgentMailError(
      'The email and attachments exceed AgentMail\'s 6 MB inline request limit.',
      413,
      'inline_request_too_large'
    );
  }
}

function normalizeAttachments(value: unknown): AgentMailAttachmentMetadata[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      attachmentId:
        (typeof item.attachment_id === 'string' && item.attachment_id) ||
        (typeof item.id === 'string' && item.id) ||
        '',
      filename: typeof item.filename === 'string' ? item.filename : '',
      contentType:
        (typeof item.content_type === 'string' && item.content_type) ||
        (typeof item.mime_type === 'string' && item.mime_type) ||
        '',
      size: typeof item.size === 'number' ? item.size : undefined,
    }))
    .filter((item) => Boolean(item.attachmentId || item.filename));
}

export function isAgentMailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY?.trim());
}

async function agentMailRequest(
  path: string,
  init: { method?: string; body?: Record<string, unknown> } = {},
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    throw new ApplicationRunError(
      'CONFIGURATION_MISSING',
      'AgentMail is not configured, so a care email cannot be created.'
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(`${AGENTMAIL_API_BASE_URL}${path}`, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new AgentMailError('AgentMail could not be reached.');
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new AgentMailError(
      `AgentMail rejected the request (${response.status}).`,
      response.status,
      typeof errorBody?.code === 'string' ? errorBody.code : undefined
    );
  }

  if (response.status === 204) {
    return {};
  }

  const text = await response.text().catch(() => '');
  if (!text.trim()) {
    return {};
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AgentMailError('AgentMail returned an unreadable response.');
  }
  if (!data || typeof data !== 'object') {
    throw new AgentMailError('AgentMail returned an unreadable response.');
  }
  return data;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeAddressString(value: unknown): string {
  const list = normalizeStringArray(value);
  return list[0] || '';
}

export function normalizeAgentMailMessage(
  raw: Record<string, unknown>,
  fallbackInboxId = ''
): AgentMailMessageItem {
  const messageId =
    (typeof raw.message_id === 'string' && raw.message_id) ||
    (typeof raw.id === 'string' && raw.id) ||
    '';
  const threadId =
    (typeof raw.thread_id === 'string' && raw.thread_id) ||
    messageId;
  const inboxId =
    (typeof raw.inbox_id === 'string' && raw.inbox_id) ||
    fallbackInboxId;
  const inReplyTo =
    typeof raw.in_reply_to === 'string' && raw.in_reply_to ? raw.in_reply_to : undefined;
  const from =
    normalizeAddressString(raw.from) ||
    normalizeAddressString(raw.from_) ||
    normalizeAddressString(raw.sender);
  const to =
    normalizeStringArray(raw.to).length > 0
      ? normalizeStringArray(raw.to)
      : normalizeStringArray(raw.recipients || raw.recipient);
  const cc = normalizeStringArray(raw.cc);
  const bcc = normalizeStringArray(raw.bcc);
  const subject = typeof raw.subject === 'string' ? raw.subject : '';
  const extractedText =
    typeof raw.extracted_text === 'string' ? raw.extracted_text : undefined;
  const extractedHtml =
    typeof raw.extracted_html === 'string' ? raw.extracted_html : undefined;
  const text =
    (typeof raw.text === 'string' ? raw.text : '') ||
    extractedText ||
    (typeof raw.preview === 'string' ? raw.preview : '');
  const html =
    (typeof raw.html === 'string' ? raw.html : '') ||
    extractedHtml ||
    (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : '');
  const labels = normalizeStringArray(raw.labels);
  const createdAt =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    (typeof raw.timestamp === 'string' && raw.timestamp) ||
    new Date().toISOString();
  const bodyUrl = typeof raw.body_url === 'string' ? raw.body_url : undefined;

  return {
    messageId,
    threadId,
    inboxId,
    inReplyTo,
    from,
    to,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    subject,
    text,
    html,
    extractedText,
    extractedHtml,
    labels,
    attachments: normalizeAttachments(raw.attachments),
    createdAt,
    bodyUrl,
  };
}

export function normalizeAgentMailDraft(
  raw: Record<string, unknown>,
  fallbackInboxId = ''
): AgentMailDraftItem {
  const draftId =
    (typeof raw.draft_id === 'string' && raw.draft_id) ||
    (typeof raw.id === 'string' && raw.id) ||
    '';
  const inboxId =
    (typeof raw.inbox_id === 'string' && raw.inbox_id) ||
    fallbackInboxId;
  const threadId =
    typeof raw.thread_id === 'string' && raw.thread_id ? raw.thread_id : undefined;
  const inReplyTo =
    typeof raw.in_reply_to === 'string' && raw.in_reply_to ? raw.in_reply_to : undefined;
  const to = normalizeStringArray(raw.to || raw.recipients || raw.recipient);
  const subject = typeof raw.subject === 'string' ? raw.subject : '';
  const text = typeof raw.text === 'string' ? raw.text : '';
  const html =
    typeof raw.html === 'string' && raw.html
      ? raw.html
      : text
      ? `<p>${text.replace(/\n/g, '<br>')}</p>`
      : '';
  const labels = normalizeStringArray(raw.labels);
  const createdAt =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    new Date().toISOString();
  const updatedAt =
    (typeof raw.updated_at === 'string' && raw.updated_at) ||
    createdAt;

  return {
    draftId,
    inboxId,
    threadId,
    inReplyTo,
    to,
    subject,
    text,
    html,
    labels,
    attachments: normalizeAttachments(raw.attachments),
    createdAt,
    updatedAt,
  };
}

export async function createCareInbox(
  input: { username: string; displayName: string; clientId: string },
  fetchImpl?: typeof fetch
): Promise<AgentMailInboxIdentity> {
  const data = await agentMailRequest(
    '/inboxes',
    {
      method: 'POST',
      body: {
        username: input.username,
        display_name: input.displayName,
        client_id: input.clientId,
      },
    },
    fetchImpl
  );

  const inboxId = typeof data.inbox_id === 'string' ? data.inbox_id : '';
  const email =
    (typeof data.email === 'string' && data.email) ||
    (typeof data.email_address === 'string' && data.email_address) ||
    (inboxId.includes('@') ? inboxId : '');
  if (!inboxId || !email) {
    throw new AgentMailError('AgentMail did not return a confirmed inbox ID and address.');
  }
  return { inboxId, email };
}

export async function sendCareMessage(
  input: {
    inboxId: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
    labels?: string[];
    attachments?: AgentMailAttachmentInput[];
  },
  fetchImpl?: typeof fetch
): Promise<AgentMailSentMessage> {
  const body: Record<string, unknown> = {
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || input.text.replace(/\n/g, '<br>'),
  };
  if (input.labels && input.labels.length > 0) {
    body.labels = input.labels;
  }
  addAttachmentsAndCheckSize(body, input.attachments);

  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/messages/send`,
    {
      method: 'POST',
      body,
    },
    fetchImpl
  );

  const messageId = typeof data.message_id === 'string' ? data.message_id : '';
  const threadId = typeof data.thread_id === 'string' ? data.thread_id : '';
  if (!messageId || !threadId) {
    throw new AgentMailError('AgentMail did not confirm the sent message.');
  }
  return { messageId, threadId };
}

export async function replyToCareMessage(
  input: {
    inboxId: string;
    messageId: string;
    to?: string[];
    text: string;
    html?: string;
    labels?: string[];
    attachments?: AgentMailAttachmentInput[];
  },
  fetchImpl?: typeof fetch
): Promise<AgentMailSentMessage> {
  const body: Record<string, unknown> = {
    text: input.text,
    html: input.html || input.text.replace(/\n/g, '<br>'),
  };
  if (input.to && input.to.length > 0) {
    body.to = input.to;
  }
  if (input.labels && input.labels.length > 0) {
    body.labels = input.labels;
  }
  addAttachmentsAndCheckSize(body, input.attachments);

  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}/reply`,
    {
      method: 'POST',
      body,
    },
    fetchImpl
  );

  const messageId = typeof data.message_id === 'string' ? data.message_id : '';
  const threadId = typeof data.thread_id === 'string' ? data.thread_id : '';
  if (!messageId || !threadId) {
    throw new AgentMailError('AgentMail did not confirm the reply message.');
  }
  return { messageId, threadId };
}

export async function updateCareMessageLabels(
  input: {
    inboxId: string;
    messageId: string;
    addLabels?: string[];
    removeLabels?: string[];
  },
  fetchImpl?: typeof fetch
): Promise<{ messageId: string; labels: string[] }> {
  const body: Record<string, unknown> = {};
  if (input.addLabels && input.addLabels.length > 0) {
    body.add_labels = input.addLabels;
  }
  if (input.removeLabels && input.removeLabels.length > 0) {
    body.remove_labels = input.removeLabels;
  }

  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}`,
    {
      method: 'PATCH',
      body,
    },
    fetchImpl
  );

  const messageId =
    (typeof data.message_id === 'string' && data.message_id) || input.messageId;
  const labels = normalizeStringArray(data.labels);
  return { messageId, labels };
}

export async function listInboxThreads(
  inboxId: string,
  params?: { limit?: number; labels?: string[] },
  fetchImpl?: typeof fetch
): Promise<AgentMailThreadSummary[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.labels && params.labels.length > 0) {
    for (const label of params.labels) {
      query.append('labels', label);
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(inboxId)}/threads${suffix}`,
    { method: 'GET' },
    fetchImpl
  );

  const rawThreads = Array.isArray(data.threads)
    ? data.threads
    : Array.isArray(data.items)
    ? data.items
    : [];

  return rawThreads
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((raw) => ({
      threadId:
        (typeof raw.thread_id === 'string' && raw.thread_id) ||
        (typeof raw.id === 'string' && raw.id) ||
        '',
      inboxId:
        (typeof raw.inbox_id === 'string' && raw.inbox_id) || inboxId,
      subject: typeof raw.subject === 'string' ? raw.subject : '',
      preview: typeof raw.preview === 'string' ? raw.preview : '',
      labels: normalizeStringArray(raw.labels),
      senders: normalizeStringArray(raw.senders || raw.from),
      recipients: normalizeStringArray(raw.recipients || raw.to),
      messageCount:
        typeof raw.message_count === 'number'
          ? raw.message_count
          : Array.isArray(raw.messages)
          ? raw.messages.length
          : 1,
      updatedAt:
        (typeof raw.updated_at === 'string' && raw.updated_at) ||
        (typeof raw.timestamp === 'string' && raw.timestamp) ||
        (typeof raw.created_at === 'string' && raw.created_at) ||
        new Date().toISOString(),
    }))
    .filter((t) => Boolean(t.threadId));
}

export async function getInboxThread(
  inboxId: string,
  threadId: string,
  fetchImpl?: typeof fetch
): Promise<AgentMailThreadDetail> {
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`,
    { method: 'GET' },
    fetchImpl
  );

  const rawMessages = Array.isArray(data.messages) ? data.messages : [];
  const rawDrafts = Array.isArray(data.drafts) ? data.drafts : [];

  return {
    threadId:
      (typeof data.thread_id === 'string' && data.thread_id) || threadId,
    inboxId:
      (typeof data.inbox_id === 'string' && data.inbox_id) || inboxId,
    subject: typeof data.subject === 'string' ? data.subject : '',
    labels: normalizeStringArray(data.labels),
    messages: rawMessages
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => normalizeAgentMailMessage(item, inboxId))
      .filter((m) => Boolean(m.messageId)),
    drafts: rawDrafts
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => normalizeAgentMailDraft(item, inboxId))
      .filter((d) => Boolean(d.draftId)),
  };
}

export async function listInboxMessages(
  inboxId: string,
  params?: { limit?: number; labels?: string[] },
  fetchImpl?: typeof fetch
): Promise<AgentMailMessageItem[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.labels && params.labels.length > 0) {
    for (const label of params.labels) {
      query.append('labels', label);
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(inboxId)}/messages${suffix}`,
    { method: 'GET' },
    fetchImpl
  );

  const rawMessages = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray(data.items)
    ? data.items
    : [];

  return rawMessages
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeAgentMailMessage(item, inboxId))
    .filter((m) => Boolean(m.messageId));
}

export async function getInboxMessage(
  inboxId: string,
  messageId: string,
  fetchImpl?: typeof fetch
): Promise<AgentMailMessageItem> {
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'GET' },
    fetchImpl
  );
  const message = normalizeAgentMailMessage(data, inboxId);
  if (!message.messageId) {
    throw new AgentMailError('AgentMail did not return a valid message.');
  }
  return message;
}

export async function getInboxMessageAttachment(
  input: { inboxId: string; messageId: string; attachmentId: string },
  fetchImpl?: typeof fetch
): Promise<AgentMailAttachmentDownload> {
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,
    { method: 'GET' },
    fetchImpl
  );
  const downloadUrl = typeof data.download_url === 'string' ? data.download_url : '';
  if (!downloadUrl) {
    throw new AgentMailError('AgentMail did not return an attachment download URL.');
  }
  return {
    attachmentId:
      (typeof data.attachment_id === 'string' && data.attachment_id) || input.attachmentId,
    filename: typeof data.filename === 'string' ? data.filename : '',
    contentType: typeof data.content_type === 'string' ? data.content_type : '',
    size: typeof data.size === 'number' ? data.size : 0,
    downloadUrl,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : '',
  };
}

export async function createCareDraft(
  input: {
    inboxId: string;
    to?: string[];
    subject?: string;
    text: string;
    html?: string;
    threadId?: string;
    inReplyTo?: string;
    labels?: string[];
    clientId?: string;
    attachments?: AgentMailAttachmentInput[];
  },
  fetchImpl?: typeof fetch
): Promise<AgentMailDraftItem> {
  const body: Record<string, unknown> = {
    text: input.text,
    html: input.html || input.text.replace(/\n/g, '<br>'),
  };
  if (input.to && input.to.length > 0) body.to = input.to;
  if (input.subject) body.subject = input.subject;
  if (input.threadId) body.thread_id = input.threadId;
  if (input.inReplyTo) body.in_reply_to = input.inReplyTo;
  if (input.labels && input.labels.length > 0) body.labels = input.labels;
  if (input.clientId) body.client_id = input.clientId;
  addAttachmentsAndCheckSize(body, input.attachments);

  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/drafts`,
    {
      method: 'POST',
      body,
    },
    fetchImpl
  );

  const draft = normalizeAgentMailDraft(data, input.inboxId);
  if (!draft.draftId) {
    throw new AgentMailError('AgentMail did not return a confirmed draft ID.');
  }
  return {
    ...draft,
    threadId: draft.threadId || input.threadId,
    inReplyTo: draft.inReplyTo || input.inReplyTo,
    to: draft.to.length ? draft.to : input.to || [],
    subject: draft.subject || input.subject || '',
    text: draft.text || input.text,
  };
}

export async function listCareDrafts(
  inboxId: string,
  fetchImpl?: typeof fetch
): Promise<AgentMailDraftItem[]> {
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(inboxId)}/drafts`,
    { method: 'GET' },
    fetchImpl
  );

  const rawDrafts = Array.isArray(data.drafts)
    ? data.drafts
    : Array.isArray(data.items)
    ? data.items
    : [];

  return rawDrafts
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeAgentMailDraft(item, inboxId))
    .filter((d) => Boolean(d.draftId));
}

export async function updateCareDraft(
  input: {
    inboxId: string;
    draftId: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    labels?: string[];
    addAttachments?: AgentMailAttachmentInput[];
    removeAttachments?: string[];
  },
  fetchImpl?: typeof fetch
): Promise<AgentMailDraftItem> {
  const body: Record<string, unknown> = {};
  if (input.to !== undefined) body.to = input.to;
  if (input.subject !== undefined) body.subject = input.subject;
  if (input.text !== undefined) {
    body.text = input.text;
    body.html = input.html || input.text.replace(/\n/g, '<br>');
  } else if (input.html !== undefined) {
    body.html = input.html;
  }
  if (input.labels !== undefined) body.labels = input.labels;
  if (input.removeAttachments) body.remove_attachments = input.removeAttachments;
  addAttachmentsAndCheckSize(body, input.addAttachments, 'add_attachments');

  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/drafts/${encodeURIComponent(input.draftId)}`,
    {
      method: 'PATCH',
      body,
    },
    fetchImpl
  );

  const draft = normalizeAgentMailDraft(data, input.inboxId);
  return {
    ...draft,
    draftId: draft.draftId || input.draftId,
    to: draft.to.length ? draft.to : input.to || [],
    subject: draft.subject || input.subject || '',
    text: draft.text || input.text || '',
  };
}

export async function sendCareDraft(
  input: { inboxId: string; draftId: string },
  fetchImpl?: typeof fetch
): Promise<AgentMailSentMessage> {
  const data = await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/drafts/${encodeURIComponent(input.draftId)}/send`,
    {
      method: 'POST',
      body: {},
    },
    fetchImpl
  );

  const messageId = typeof data.message_id === 'string' ? data.message_id : '';
  const threadId = typeof data.thread_id === 'string' ? data.thread_id : '';
  if (!messageId || !threadId) {
    throw new AgentMailError('AgentMail did not confirm the sent draft message.');
  }
  return { messageId, threadId };
}

export async function deleteCareDraft(
  input: { inboxId: string; draftId: string },
  fetchImpl?: typeof fetch
): Promise<void> {
  await agentMailRequest(
    `/inboxes/${encodeURIComponent(input.inboxId)}/drafts/${encodeURIComponent(input.draftId)}`,
    {
      method: 'DELETE',
    },
    fetchImpl
  );
}

/**
 * Verifies AgentMail's Svix-signed webhook payloads (`svix-id`, `svix-timestamp`, `svix-signature`).
 * See https://docs.agentmail.to/webhooks-overview and references/agentmail-integration.md.
 */
export function verifyAgentMailWebhook(
  rawBody: string,
  headers: {
    svixId: string;
    svixTimestamp: string;
    svixSignature: string;
  },
  secret: string,
  nowMs: number = Date.now()
): AgentMailWebhookEvent {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new AgentMailError('Missing Svix webhook signature headers.', 401, 'invalid_signature');
  }

  const timestampSec = Number(svixTimestamp);
  if (!Number.isFinite(timestampSec)) {
    throw new AgentMailError('Invalid Svix webhook timestamp.', 401, 'invalid_signature');
  }

  const toleranceSec = 5 * 60;
  const ageSec = Math.abs(nowMs / 1000 - timestampSec);
  if (ageSec > toleranceSec) {
    throw new AgentMailError('Webhook timestamp outside tolerance window.', 401, 'timestamp_expired');
  }

  const cleanSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(cleanSecret, 'base64');
    if (secretBytes.length === 0) {
      secretBytes = Buffer.from(cleanSecret, 'utf8');
    }
  } catch {
    secretBytes = Buffer.from(cleanSecret, 'utf8');
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  const candidateSignatures = svixSignature
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('v1,') ? part.slice(3) : part));

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const matched = candidateSignatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });

  if (!matched) {
    throw new AgentMailError('Invalid Svix webhook signature.', 401, 'invalid_signature');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new AgentMailError('Webhook body is not valid JSON.', 400, 'invalid_json');
  }

  const eventId =
    (typeof parsed.event_id === 'string' && parsed.event_id) ||
    (typeof parsed.id === 'string' && parsed.id) ||
    svixId;
  const eventType =
    (typeof parsed.event_type === 'string' && parsed.event_type) ||
    (typeof parsed.type === 'string' && parsed.type) ||
    'message.received';

  return {
    event_id: eventId,
    event_type: eventType,
    timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : undefined,
    message:
      parsed.message && typeof parsed.message === 'object'
        ? (parsed.message as Record<string, unknown>)
        : undefined,
    data:
      parsed.data && typeof parsed.data === 'object'
        ? (parsed.data as Record<string, unknown>)
        : undefined,
  };
}
