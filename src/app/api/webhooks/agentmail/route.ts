import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import {
  AgentMailError,
  type AgentMailWebhookEvent,
  normalizeAgentMailMessage,
  verifyAgentMailWebhook,
} from '@/lib/integrations/agentmail/client';
import { ingestAgentMailMessage } from '@/lib/integrations/agentmail/inbox-sync';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
    const svixId = req.headers.get('svix-id') || '';
    const svixTimestamp = req.headers.get('svix-timestamp') || '';
    const svixSignature = req.headers.get('svix-signature') || '';

    let event: AgentMailWebhookEvent;

    if (webhookSecret || svixSignature) {
      if (!webhookSecret) {
        return NextResponse.json(
          { error: 'AGENTMAIL_WEBHOOK_SECRET is not configured.' },
          { status: 503 }
        );
      }
      try {
        event = verifyAgentMailWebhook(
          rawBody,
          { svixId, svixTimestamp, svixSignature },
          webhookSecret
        );
      } catch (err) {
        if (err instanceof AgentMailError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
      }
    } else {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawBody || '{}') as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
      event = {
        event_id:
          (typeof parsed.event_id === 'string' && parsed.event_id) ||
          (typeof parsed.id === 'string' && parsed.id) ||
          '',
        event_type:
          (typeof parsed.event_type === 'string' && parsed.event_type) ||
          'message.received',
        message:
          parsed.message && typeof parsed.message === 'object'
            ? (parsed.message as Record<string, unknown>)
            : parsed.data && typeof parsed.data === 'object'
            ? (parsed.data as Record<string, unknown>)
            : parsed,
      };
    }

    if (event.event_id && ApovoStore.hasProcessedWebhookEvent(event.event_id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const messagePayload = event.message || event.data || {};
    const messageId =
      (typeof messagePayload.message_id === 'string' && messagePayload.message_id) ||
      (typeof messagePayload.id === 'string' && messagePayload.id) ||
      '';

    if (
      event.event_type === 'message.sent' ||
      event.event_type === 'message.delivered' ||
      event.event_type === 'message.bounced' ||
      event.event_type === 'message.rejected'
    ) {
      if (messageId) {
        const statusMap: Record<string, 'sent' | 'delivered' | 'bounced' | 'rejected'> = {
          'message.sent': 'sent',
          'message.delivered': 'delivered',
          'message.bounced': 'bounced',
          'message.rejected': 'rejected',
        };
        ApovoStore.updateEmailDeliveryStatus(messageId, statusMap[event.event_type] || 'sent');
      }
      if (event.event_id) {
        ApovoStore.markWebhookEventProcessed(event.event_id);
      }
      return NextResponse.json({ received: true, event_type: event.event_type });
    }

    if (event.event_type !== 'message.received') {
      if (event.event_id) {
        ApovoStore.markWebhookEventProcessed(event.event_id);
      }
      return NextResponse.json({ received: true, ignored: true });
    }

    const normalized = normalizeAgentMailMessage(
      messagePayload as Record<string, unknown>
    );
    if (!normalized.messageId) {
      normalized.messageId = `msg_${Date.now()}`;
      normalized.threadId = normalized.threadId || normalized.messageId;
    }

    const patient =
      (normalized.inboxId ? ApovoStore.findPatientByInbox(normalized.inboxId) : null) ||
      (normalized.to[0] ? ApovoStore.findPatientByInbox(normalized.to[0]) : null) ||
      ApovoStore.getActivePatient();

    if (!patient) {
      return NextResponse.json({ error: 'No matching patient profile for inbox' }, { status: 404 });
    }

    const ingested = await ingestAgentMailMessage(patient, normalized);
    if (event.event_id) {
      ApovoStore.markWebhookEventProcessed(event.event_id);
    }

    return NextResponse.json({
      received: true,
      success: true,
      emailId: ingested.email.id,
      messageId: ingested.email.message_id,
      threadId: ingested.email.thread_id,
      classification: ingested.email.classification,
      application_id: ingested.matchedApplicationId,
      taskId: ingested.task?.id,
      draftId: ingested.draft?.draft_id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Webhook processing failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
