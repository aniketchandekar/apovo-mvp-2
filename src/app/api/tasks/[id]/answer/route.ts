import { after, NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import { ApplicationRunError } from '@/lib/application-agent/errors';
import { publicInput, validateInputAnswer } from '@/lib/application-agent/input-validation';
import { applicationRunWorker } from '@/lib/application-agent/application-run-worker';
import { continueAfterPatientInput } from '@/lib/application-agent/run-access';
import { RunRepository } from '@/lib/application-agent/run-repository';
import {
  AgentMailError,
  replyToCareMessage,
  sendCareDraft,
  updateCareDraft,
} from '@/lib/integrations/agentmail/client';

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const patient = ApovoStore.getActivePatient();

    // 1. Check if this pending item is a RequiredInput from an active PDF ApplicationRun
    if (id.startsWith('input_') && patient) {
      const unified = ApovoStore.getUnifiedPendingItems(patient.id).find((item) => item.id === id);
      const runId = (body.run_id as string | undefined) || unified?.run_id;
      if (!runId) {
        return NextResponse.json({ error: 'Application run not found for input.' }, { status: 404 });
      }
      const input = RunRepository.inputs(runId).find((item) => item.id === id);
      if (!input) {
        return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
      }
      if (input.status !== 'open') {
        return NextResponse.json({ success: true, input: publicInput(input), alreadyAnswered: true });
      }

      const rawValue =
        body.answer !== undefined
          ? body.answer
          : body.value !== undefined
          ? body.value
          : body;

      try {
        const validated = validateInputAnswer(input, rawValue);
        const answered = RunRepository.answerInput(input.id, validated);
        if (!answered) {
          return NextResponse.json({ error: 'Question is no longer open.' }, { status: 409 });
        }

        if (continueAfterPatientInput(runId)) {
          after(async () => {
            await applicationRunWorker.start(runId);
          });
        }

        return NextResponse.json({
          success: true,
          input: publicInput(answered),
          message: 'Saved to your application packet. Agent resumed.',
        });
      } catch (err) {
        if (err instanceof ApplicationRunError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'The answer could not be saved.' }, { status: 500 });
      }
    }

    // 2. Standard PatientTask (including AgentMail Draft consent / Email reply tasks)
    const task = ApovoStore.getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const answerData =
      body.answer !== undefined
        ? body.answer
        : body.value !== undefined
        ? body.value
        : body.signature !== undefined
        ? { signature: body.signature }
        : body.fileId !== undefined
        ? { fileId: body.fileId, filename: body.filename, url: body.url }
        : body;

    const sendWithConsent =
      Boolean(body.sendWithConsent) ||
      task.type === 'consent_reply' ||
      task.type === 'approve_followup';

    let sentMessage: { messageId: string; threadId: string } | null = null;

    if (sendWithConsent && patient) {
      if (!patient.agentmail_inbox_id || !patient.care_email) {
        return NextResponse.json(
          { error: 'Provision your AgentMail care email before consenting to send replies.' },
          { status: 409 }
        );
      }

      const draft = task.draft_id
        ? ApovoStore.getDraft(task.draft_id)
        : task.thread_id
        ? ApovoStore.getPendingDraftForThread(task.thread_id, patient.id)
        : null;

      const userValueStr =
        typeof body.value === 'string'
          ? body.value.trim()
          : typeof body.answer === 'string'
          ? body.answer.trim()
          : '';
      const editedDraftText =
        typeof body.draft_text === 'string' ? body.draft_text.trim() : '';

      if (draft) {
        let finalDraftText = editedDraftText || draft.text;
        if (
          userValueStr &&
          finalDraftText.includes('[Patient response will be inserted here upon confirmation]')
        ) {
          finalDraftText = finalDraftText.replace(
            '[Patient response will be inserted here upon confirmation]',
            userValueStr
          );
        } else if (userValueStr && !editedDraftText && task.type !== 'approve_followup') {
          finalDraftText = `${draft.text}\n\nPatient Confirmed Response:\n${userValueStr}`;
        }

        if (finalDraftText !== draft.text) {
          await updateCareDraft({
            inboxId: patient.agentmail_inbox_id,
            draftId: draft.draft_id,
            text: finalDraftText,
          });
          ApovoStore.updateDraft(draft.draft_id, { text: finalDraftText });
        }

        sentMessage = await sendCareDraft({
          inboxId: patient.agentmail_inbox_id,
          draftId: draft.draft_id,
        });
        ApovoStore.markDraftSent(draft.draft_id, sentMessage.messageId, sentMessage.threadId);

        ApovoStore.saveEmail({
          patient_id: patient.id,
          application_id: task.application_id || draft.application_id,
          program_name: task.program_name,
          inbox_id: patient.agentmail_inbox_id,
          thread_id: sentMessage.threadId || draft.thread_id || task.thread_id || sentMessage.messageId,
          message_id: sentMessage.messageId,
          in_reply_to: draft.in_reply_to || task.message_id,
          direction: 'outbound',
          from: patient.care_email,
          to: draft.to.join(', ') || task.shared_with,
          subject: draft.subject,
          body_text: finalDraftText,
          body_html: `<p>${finalDraftText.replace(/\n/g, '<br>')}</p>`,
          classification: 'pending',
          summary: `Sent with your consent to ${draft.to.join(', ') || task.program_name}`,
          actions_taken: ['Patient consented & sent via AgentMail'],
          delivery_status: 'sent',
          unread: false,
        });
      } else if (task.message_id || task.thread_id) {
        const threadMessages = task.thread_id ? ApovoStore.getThread(task.thread_id) : [];
        const latestInThread = threadMessages[threadMessages.length - 1];
        const targetMessageId = task.message_id || latestInThread?.message_id;
        if (!targetMessageId) {
          return NextResponse.json(
            { error: 'No AgentMail message ID found to reply to.' },
            { status: 404 }
          );
        }

        const recipient = latestInThread ? extractEmailAddress(latestInThread.from) : undefined;
        const replyBody =
          editedDraftText ||
          userValueStr ||
          `Hello ${task.program_name} Team,\n\nWith my consent, Apovo Care Concierge is following up on my application.\n\nThank you,\n${patient.first_name} ${patient.last_name}`.trim();

        sentMessage = await replyToCareMessage({
          inboxId: patient.agentmail_inbox_id,
          messageId: targetMessageId,
          to: recipient ? [recipient] : undefined,
          text: replyBody,
        });

        ApovoStore.saveEmail({
          patient_id: patient.id,
          application_id: task.application_id,
          program_name: task.program_name,
          inbox_id: patient.agentmail_inbox_id,
          thread_id: sentMessage.threadId || task.thread_id || sentMessage.messageId,
          message_id: sentMessage.messageId,
          in_reply_to: targetMessageId,
          direction: 'outbound',
          from: patient.care_email,
          to: recipient || task.program_name,
          subject: latestInThread?.subject
            ? latestInThread.subject.toLowerCase().startsWith('re:')
              ? latestInThread.subject
              : `Re: ${latestInThread.subject}`
            : `Re: ${task.program_name}`,
          body_text: replyBody,
          body_html: `<p>${replyBody.replace(/\n/g, '<br>')}</p>`,
          classification: 'pending',
          summary: `Sent consented reply to ${recipient || task.program_name}`,
          actions_taken: ['Patient consented & replied via AgentMail'],
          delivery_status: 'sent',
          unread: false,
        });
      }
    }

    const result = ApovoStore.answerTask(id, answerData);
    if (!result) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (patient) {
      ApovoStore.addCareEvent({
        patient_id: patient.id,
        application_id: task.application_id,
        type: sentMessage ? 'followup_sent' : 'task_answered',
        agent: 'patient',
        title: sentMessage
          ? `You consented & sent email to ${task.program_name}`
          : `You answered: ${task.title}`,
        description: sentMessage
          ? `Delivered via AgentMail (${sentMessage.messageId})`
          : 'Saved to your profile and shared with your active agent.',
      });
    }

    return NextResponse.json({
      success: true,
      task: result.task,
      application: result.application,
      sent: sentMessage,
      profileUpdated: result.profileUpdated,
      message: sentMessage
        ? 'Consent confirmed and email sent via AgentMail.'
        : 'Answer saved. Agent updated.',
    });
  } catch (err: unknown) {
    if (err instanceof AgentMailError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Failed to answer task';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
