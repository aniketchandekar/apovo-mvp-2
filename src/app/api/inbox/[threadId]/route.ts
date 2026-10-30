import { NextRequest, NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import {
  AgentMailError,
  createCareDraft,
  deleteCareDraft,
  replyToCareMessage,
  sendCareDraft,
  updateCareDraft,
  updateCareMessageLabels,
} from '@/lib/integrations/agentmail/client';
import { isVercelDemoMode } from '@/lib/demo-session/config';
import {
  EMPTY_DEMO_UI_STATE,
  demoDraft,
  demoThreadDetail,
  isDemoThreadId,
} from '@/lib/demo-session/fixtures';
import {
  appendUnique,
  demoStateResponse,
  readDemoSessionOrNull,
  requireDemoSession,
  updateDemoUiState,
  without,
} from '@/lib/demo-session/state';

function hasAgentMailApiKey(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY?.trim());
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    if (isVercelDemoMode()) {
      if (!isDemoThreadId(threadId)) {
        return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
      }
      const session = readDemoSessionOrNull(request);
      if (!session) {
        return NextResponse.json(demoThreadDetail(EMPTY_DEMO_UI_STATE, threadId));
      }
      const next = updateDemoUiState(session, (ui) => ({
        ...ui,
        readThreadIds: appendUnique(ui.readThreadIds, threadId),
        unreadThreadIds: without(ui.unreadThreadIds, threadId),
      }));
      return demoStateResponse(demoThreadDetail(next.ui, threadId)!, next);
    }
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({ error: 'No active patient profile' }, { status: 404 });
    }

    const messages = ApovoStore.getThread(threadId);
    const pendingDraft = ApovoStore.getPendingDraftForThread(threadId, patient.id);

    if (messages.length === 0 && !pendingDraft) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Mark messages in this thread as read locally & on AgentMail
    if (messages.some((m) => m.unread)) {
      ApovoStore.markThreadRead(threadId);
      if (patient.agentmail_inbox_id && hasAgentMailApiKey()) {
        for (const unreadMsg of messages.filter((m) => m.message_id)) {
          updateCareMessageLabels({
            inboxId: patient.agentmail_inbox_id,
            messageId: unreadMsg.message_id!,
            removeLabels: ['unread'],
          }).catch(() => {});
        }
      }
    }

    const latest = messages[messages.length - 1] || null;
    const programName = latest?.program_name || pendingDraft?.program_name || 'Grant Program';
    const subject = latest?.subject || pendingDraft?.subject || 'Conversation';

    let application =
      (latest?.application_id ? ApovoStore.getApplication(latest.application_id) : null) ||
      (pendingDraft?.application_id
        ? ApovoStore.getApplication(pendingDraft.application_id)
        : null);
    if (!application) {
      const apps = ApovoStore.getApplications(patient.id);
      application =
        apps.find((a) => a.resource.name.toLowerCase().includes(programName.toLowerCase())) ||
        apps[0] ||
        null;
    }

    const followUpConfig = application ? ApovoStore.getFollowUp(application.id) : null;

    const openTasks = ApovoStore.getOpenTasks(patient.id);
    const task =
      (latest?.task_id ? ApovoStore.getTask(latest.task_id) : null) ||
      (pendingDraft?.linked_task_id ? ApovoStore.getTask(pendingDraft.linked_task_id) : null) ||
      openTasks.find(
        (t) =>
          t.thread_id === threadId ||
          (pendingDraft && t.draft_id === pendingDraft.draft_id) ||
          t.program_name === programName
      ) ||
      null;

    return NextResponse.json({
      thread_id: threadId,
      program_name: programName,
      subject,
      latest,
      messages: ApovoStore.getThread(threadId),
      application,
      followUpConfig,
      task,
      draft: pendingDraft,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch thread';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    if (isVercelDemoMode()) {
      const auth = requireDemoSession(req);
      if (auth.error) return auth.error;
      if (!isDemoThreadId(threadId)) {
        return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
      }
      const body = (await req.json().catch(() => ({}))) as {
        action?: string;
        to?: string;
        subject?: string;
        text?: string;
        consent?: boolean;
      };

      if (body.action === 'create_or_update_draft') {
        const current = auth.session.ui.draft;
        const to = (body.to || current?.to || 'grants@rememberbetty.com').trim().slice(0, 160);
        const subject = (body.subject || current?.subject || 'Synthetic status follow-up')
          .trim()
          .slice(0, 200);
        const text = (body.text || current?.text || '').trim().slice(0, 600);
        if (!to.includes('@') || !text) {
          return NextResponse.json(
            { error: 'A recipient and draft message body are required.' },
            { status: 400 }
          );
        }
        const next = updateDemoUiState(auth.session, (ui) => ({
          ...ui,
          draft: { threadId, to, subject, text },
        }));
        return demoStateResponse({ success: true, draft: demoDraft(next.ui) }, next);
      }

      if (body.action === 'discard_draft') {
        const next = updateDemoUiState(auth.session, (ui) => ({ ...ui, draft: undefined }));
        return demoStateResponse({ success: true, draft: null }, next);
      }

      if (body.action === 'consent_send_draft' || body.action === 'reply') {
        if (!body.consent) {
          return NextResponse.json(
            { error: 'Explicit user consent is required for this demonstration.' },
            { status: 400 }
          );
        }
        const next = updateDemoUiState(auth.session, (ui) => ({
          ...ui,
          draft: undefined,
          sentThreadIds: appendUnique(ui.sentThreadIds, threadId),
        }));
        return demoStateResponse(
          {
            success: true,
            sent: { messageId: `demo_sent_${threadId}`, threadId },
          },
          next
        );
      }

      return NextResponse.json({ error: 'Unsupported inbox action' }, { status: 400 });
    }
    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({ error: 'No active patient profile' }, { status: 404 });
    }
    if (!patient.agentmail_inbox_id || !patient.care_email) {
      return NextResponse.json(
        { error: 'Your AgentMail care email is not provisioned yet.' },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: 'create_or_update_draft' | 'consent_send_draft' | 'reply' | 'discard_draft';
      draft_id?: string;
      to?: string;
      subject?: string;
      text?: string;
      answer_value?: string;
      consent?: boolean;
    };

    const messages = ApovoStore.getThread(threadId);
    const latest = messages[messages.length - 1];
    const existingDraft =
      (body.draft_id ? ApovoStore.getDraft(body.draft_id) : null) ||
      ApovoStore.getPendingDraftForThread(threadId, patient.id);

    const defaultRecipient =
      body.to?.trim() ||
      existingDraft?.to[0] ||
      (latest
        ? latest.direction === 'inbound'
          ? extractEmailAddress(latest.from)
          : extractEmailAddress(latest.to)
        : '');
    const defaultSubject =
      body.subject?.trim() ||
      existingDraft?.subject ||
      (latest?.subject
        ? latest.subject.toLowerCase().startsWith('re:')
          ? latest.subject
          : `Re: ${latest.subject}`
        : 'Grant Application Follow-up');

    if (body.action === 'discard_draft') {
      if (!existingDraft) {
        return NextResponse.json({ error: 'No draft found to discard.' }, { status: 404 });
      }
      await deleteCareDraft({
        inboxId: patient.agentmail_inbox_id,
        draftId: existingDraft.draft_id,
      });
      const discarded = ApovoStore.discardDraft(existingDraft.draft_id);
      return NextResponse.json({ success: true, draft: discarded });
    }

    if (body.action === 'create_or_update_draft') {
      const text = (body.text || existingDraft?.text || '').trim();
      if (!text) {
        return NextResponse.json({ error: 'Draft message body is required.' }, { status: 400 });
      }

      if (existingDraft) {
        const updatedRemote = await updateCareDraft({
          inboxId: patient.agentmail_inbox_id,
          draftId: existingDraft.draft_id,
          to: defaultRecipient ? [defaultRecipient] : existingDraft.to,
          subject: defaultSubject,
          text,
        });
        const updatedLocal = ApovoStore.updateDraft(existingDraft.draft_id, {
          to: updatedRemote.to.length ? updatedRemote.to : existingDraft.to,
          subject: updatedRemote.subject || defaultSubject,
          text: updatedRemote.text || text,
        });
        return NextResponse.json({ success: true, draft: updatedLocal });
      }

      const createdRemote = await createCareDraft({
        inboxId: patient.agentmail_inbox_id,
        to: defaultRecipient ? [defaultRecipient] : undefined,
        subject: defaultSubject,
        text,
        threadId,
        inReplyTo: latest?.message_id,
        labels: ['awaiting_patient_consent'],
      });

      const programName = latest?.program_name || 'Grant Program';
      const savedDraft = ApovoStore.saveDraft({
        draft_id: createdRemote.draftId,
        inbox_id: patient.agentmail_inbox_id,
        thread_id: createdRemote.threadId || threadId,
        in_reply_to: createdRemote.inReplyTo || latest?.message_id,
        patient_id: patient.id,
        application_id: latest?.application_id,
        program_name: programName,
        to: createdRemote.to.length ? createdRemote.to : defaultRecipient ? [defaultRecipient] : [],
        subject: createdRemote.subject || defaultSubject,
        text: createdRemote.text || text,
        html: createdRemote.html,
        kind: 'reply_consent',
        reason: 'Reply draft staged via AgentMail and awaiting your consent.',
        status: 'pending_consent',
        created_at: createdRemote.createdAt,
        updated_at: createdRemote.updatedAt,
      });

      const task = ApovoStore.createTask({
        patient_id: patient.id,
        application_id: latest?.application_id || '',
        program_name: programName,
        asker: `${programName} · Inbox Agent`,
        type: 'consent_reply',
        title: `Consent to send reply: "${savedDraft.subject}"`,
        why: 'Review and approve this staged AgentMail reply before it is sent from your medical email.',
        shared_with: savedDraft.to.join(', ') || programName,
        thread_id: savedDraft.thread_id,
        message_id: latest?.message_id,
        draft_id: savedDraft.draft_id,
        source_kind: 'email_agent',
      });
      ApovoStore.updateDraft(savedDraft.draft_id, { linked_task_id: task.id });

      return NextResponse.json({ success: true, draft: savedDraft, task });
    }

    if (body.action === 'consent_send_draft' || body.action === 'reply') {
      if (!body.consent) {
        return NextResponse.json(
          { error: 'Explicit user consent is required before Apovo can send this email.' },
          { status: 400 }
        );
      }

      let finalText = (body.text || existingDraft?.text || '').trim();
      if (body.answer_value && finalText.includes('[Patient response will be inserted here upon confirmation]')) {
        finalText = finalText.replace(
          '[Patient response will be inserted here upon confirmation]',
          body.answer_value.trim()
        );
      } else if (body.answer_value && !body.text && existingDraft) {
        finalText = `${existingDraft.text}\n\nPatient Confirmed Details:\n${body.answer_value.trim()}`;
      }

      if (!finalText) {
        return NextResponse.json({ error: 'A message body is required to send.' }, { status: 400 });
      }

      let sent: { messageId: string; threadId: string };

      if (existingDraft) {
        if (finalText !== existingDraft.text || defaultSubject !== existingDraft.subject) {
          await updateCareDraft({
            inboxId: patient.agentmail_inbox_id,
            draftId: existingDraft.draft_id,
            to: defaultRecipient ? [defaultRecipient] : existingDraft.to,
            subject: defaultSubject,
            text: finalText,
          });
        }
        sent = await sendCareDraft({
          inboxId: patient.agentmail_inbox_id,
          draftId: existingDraft.draft_id,
        });
        ApovoStore.markDraftSent(existingDraft.draft_id, sent.messageId, sent.threadId);
      } else if (latest?.message_id) {
        sent = await replyToCareMessage({
          inboxId: patient.agentmail_inbox_id,
          messageId: latest.message_id,
          to: defaultRecipient ? [defaultRecipient] : undefined,
          text: finalText,
        });
      } else {
        return NextResponse.json(
          { error: 'No target message or AgentMail draft found to reply to.' },
          { status: 404 }
        );
      }

      const programName =
        existingDraft?.program_name || latest?.program_name || 'Grant Program';
      const applicationId = existingDraft?.application_id || latest?.application_id;

      const outboundEmail = ApovoStore.saveEmail({
        patient_id: patient.id,
        application_id: applicationId,
        program_name: programName,
        inbox_id: patient.agentmail_inbox_id,
        thread_id: sent.threadId || threadId,
        message_id: sent.messageId,
        in_reply_to: existingDraft?.in_reply_to || latest?.message_id,
        direction: 'outbound',
        from: patient.care_email,
        to: defaultRecipient || programName,
        subject: defaultSubject,
        body_text: finalText,
        body_html: `<p>${finalText.replace(/\n/g, '<br>')}</p>`,
        classification: 'pending',
        summary: `Consented reply sent to ${defaultRecipient || programName}.`,
        actions_taken: ['Patient consented & sent via AgentMail'],
        delivery_status: 'sent',
        unread: false,
      });

      // Resolve any open tasks associated with this thread
      for (const openTask of ApovoStore.getOpenTasks(patient.id)) {
        if (
          openTask.thread_id === threadId ||
          (existingDraft && openTask.draft_id === existingDraft.draft_id)
        ) {
          ApovoStore.answerTask(openTask.id, {
            consented: true,
            value: body.answer_value || finalText,
            sent_message_id: sent.messageId,
          });
        }
      }

      ApovoStore.addCareEvent({
        patient_id: patient.id,
        application_id: applicationId,
        type: 'followup_sent',
        agent: 'inbox',
        title: `Sent consented reply to ${programName}`,
        description: `Delivered via AgentMail (${sent.messageId})`,
        metadata: {
          message_id: sent.messageId,
          thread_id: sent.threadId,
          draft_id: existingDraft?.draft_id,
        },
      });

      return NextResponse.json({
        success: true,
        email: outboundEmail,
        sent,
      });
    }

    return NextResponse.json({ error: 'Invalid thread action.' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof AgentMailError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Failed to process thread action';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
