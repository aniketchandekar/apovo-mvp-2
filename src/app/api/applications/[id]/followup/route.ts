import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import {
  AgentMailError,
  createCareDraft,
  replyToCareMessage,
  sendCareMessage,
} from '@/lib/integrations/agentmail/client';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patient = ApovoStore.getActivePatient();
  const application = ApovoStore.getApplication(id);
  if (!patient || !application || application.patient_id !== patient.id) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }
  if (!patient.agentmail_inbox_id || !patient.care_email) {
    return NextResponse.json(
      { error: 'Your care email is not provisioned yet.' },
      { status: 409 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: 'draft' | 'send';
    to?: string;
    subject?: string;
    text?: string;
    thread_id?: string;
    reply_to_message_id?: string;
  };

  const followUp = ApovoStore.getFollowUp(application.id);
  const to = (body.to || followUp?.draft_recipient || '').trim();
  const subject = (body.subject || followUp?.draft_subject || '').trim();
  const text = (body.text || followUp?.draft_body || '').trim();
  const mode = body.mode || 'send';

  if (!EMAIL_PATTERN.test(to)) {
    return NextResponse.json({ error: 'Enter a valid recipient email address.' }, { status: 400 });
  }
  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: 'A subject under 200 characters is required.' }, { status: 400 });
  }
  if (!text || text.length > 20_000) {
    return NextResponse.json({ error: 'A message body under 20,000 characters is required.' }, { status: 400 });
  }

  // Look for an existing thread for this application so we can continue the conversation
  const existingAppEmails = ApovoStore.getEmails(patient.id)
    .filter((e) => e.application_id === application.id && e.message_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestThreadEmail = existingAppEmails[existingAppEmails.length - 1];
  const threadId = body.thread_id || latestThreadEmail?.thread_id;
  const inReplyToMessageId = body.reply_to_message_id || latestThreadEmail?.message_id;

  try {
    if (mode === 'draft') {
      const draft = await createCareDraft({
        inboxId: patient.agentmail_inbox_id,
        to: [to],
        subject,
        text,
        threadId,
        inReplyTo: inReplyToMessageId,
        labels: ['followup_status', 'awaiting_patient_consent'],
        clientId: `apovo-followup-${application.id}-${Date.now()}`,
      });

      const savedDraft = ApovoStore.saveDraft({
        draft_id: draft.draftId,
        inbox_id: patient.agentmail_inbox_id,
        thread_id: draft.threadId || threadId,
        in_reply_to: draft.inReplyTo || inReplyToMessageId,
        patient_id: patient.id,
        application_id: application.id,
        program_name: application.resource.name,
        to: draft.to.length ? draft.to : [to],
        subject: draft.subject || subject,
        text: draft.text || text,
        html: draft.html,
        kind: 'followup_status',
        reason: `Follow-up Agent staged a status check for ${application.resource.name} awaiting your consent.`,
        status: 'pending_consent',
        created_at: draft.createdAt,
        updated_at: draft.updatedAt,
      });

      const task = ApovoStore.createTask({
        patient_id: patient.id,
        application_id: application.id,
        program_name: application.resource.name,
        asker: `${application.resource.name} · Follow-up Agent`,
        type: 'approve_followup',
        title: `Consent to send follow-up to ${application.resource.name}`,
        why: `Your application status inquiry is staged in AgentMail (${draft.draftId}) and ready to send upon your approval.`,
        shared_with: `${application.resource.name} (${to})`,
        thread_id: savedDraft.thread_id,
        message_id: inReplyToMessageId,
        draft_id: savedDraft.draft_id,
        source_kind: 'followup_agent',
      });

      ApovoStore.updateDraft(savedDraft.draft_id, { linked_task_id: task.id });

      return NextResponse.json({ draft: savedDraft, task, success: true });
    }

    const sent = inReplyToMessageId
      ? await replyToCareMessage({
          inboxId: patient.agentmail_inbox_id,
          messageId: inReplyToMessageId,
          to: [to],
          text,
        })
      : await sendCareMessage({
          inboxId: patient.agentmail_inbox_id,
          to: [to],
          subject,
          text,
        });

    const email = ApovoStore.saveEmail({
      patient_id: patient.id,
      application_id: application.id,
      program_name: application.resource.name,
      inbox_id: patient.agentmail_inbox_id,
      thread_id: sent.threadId,
      message_id: sent.messageId,
      in_reply_to: inReplyToMessageId,
      direction: 'outbound',
      from: patient.care_email,
      to,
      subject,
      body_text: text,
      body_html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
      classification: 'pending',
      summary: `Sent to ${to}`,
      delivery_status: 'sent',
      unread: false,
    });

    ApovoStore.updateApplication(application.id, { state: 'FollowUpSent' });
    if (followUp) {
      const updatedLadder = followUp.ladder.map((step) =>
        step.step === followUp.current_step
          ? { ...step, status: 'completed' as const, sent_at: new Date().toISOString() }
          : step.step === followUp.current_step + 1
          ? { ...step, status: 'active' as const }
          : step
      );
      ApovoStore.updateFollowUp(application.id, {
        current_step: Math.min(followUp.current_step + 1, followUp.ladder.length),
        ladder: updatedLadder,
      });
    }

    ApovoStore.addCareEvent({
      patient_id: patient.id,
      application_id: application.id,
      type: 'followup_sent',
      agent: 'followup',
      title: `Follow-up Agent sent status inquiry to ${application.resource.name}`,
      description: `Delivered to ${to} via AgentMail (${sent.messageId})`,
      metadata: { message_id: sent.messageId, thread_id: sent.threadId },
    });

    return NextResponse.json({ email, success: true });
  } catch (error) {
    if (error instanceof AgentMailError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: 'The email could not be sent.' }, { status: 502 });
  }
}
