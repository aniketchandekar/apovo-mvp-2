import { NextResponse } from 'next/server';
import { ApovoStore } from '@/lib/store';
import {
  AgentMailError,
  createCareDraft,
  sendCareMessage,
} from '@/lib/integrations/agentmail/client';
import { syncPatientCareInbox } from '@/lib/integrations/agentmail/inbox-sync';

function hasAgentMailApiKey(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY?.trim());
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'inbox';
    const query = searchParams.get('q') || '';
    const forceSync = searchParams.get('sync') === '1';

    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({
        patient_id: null,
        care_email: null,
        inbox_id: null,
        agentmail_configured: hasAgentMailApiKey(),
        threads: [],
        drafts: [],
        applications: [],
        counts: {
          inbox: 0,
          all: 0,
          needs_you: 0,
          waiting: 0,
          done: 0,
          drafts: 0,
          sent: 0,
          starred: 0,
          unread: 0,
        },
      });
    }

    const applications = ApovoStore.matchInitialPrograms(patient.id);

    let syncError: string | null = null;
    if (patient.agentmail_inbox_id && hasAgentMailApiKey()) {
      const existingEmails = ApovoStore.getEmails(patient.id);
      if (forceSync || existingEmails.length === 0) {
        try {
          await syncPatientCareInbox(patient);
        } catch (err) {
          syncError = err instanceof Error ? err.message : 'Unable to sync with AgentMail.';
        }
      }
    }

    const threads = ApovoStore.getThreads(patient.id, filter, query);
    const inboxThreads = ApovoStore.getThreads(patient.id, 'inbox');
    const allThreads = ApovoStore.getThreads(patient.id, 'all');
    const needsYouThreads = ApovoStore.getThreads(patient.id, 'needs_you');
    const waitingThreads = ApovoStore.getThreads(patient.id, 'waiting');
    const doneThreads = ApovoStore.getThreads(patient.id, 'done');
    const sentThreads = ApovoStore.getThreads(patient.id, 'sent');
    const starredThreads = ApovoStore.getThreads(patient.id, 'starred');

    const pendingDrafts = ApovoStore.getDraftsForPatient(patient.id).filter(
      (d) => d.status === 'pending_consent'
    );
    const totalUnread = inboxThreads.reduce((acc, t) => acc + t.unreadCount, 0);

    return NextResponse.json({
      patient_id: patient.id,
      patient_name: `${patient.first_name} ${patient.last_name}`.trim() || 'Patient',
      care_email: patient.care_email || null,
      inbox_id: patient.agentmail_inbox_id || null,
      agentmail_configured: hasAgentMailApiKey(),
      sync_error: syncError,
      threads,
      drafts: pendingDrafts,
      applications,
      counts: {
        inbox: inboxThreads.length,
        all: allThreads.length,
        needs_you: needsYouThreads.length,
        waiting: waitingThreads.length,
        done: doneThreads.length,
        drafts: pendingDrafts.length,
        sent: sentThreads.length,
        starred: starredThreads.length,
        unread: totalUnread,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch inbox threads';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      thread_id?: string;
      unread?: boolean;
      application_id?: string;
      program_name?: string;
      to?: string;
      subject?: string;
      text?: string;
    };

    const patient = ApovoStore.getActivePatient();
    if (!patient) {
      return NextResponse.json({ error: 'No active patient profile' }, { status: 404 });
    }

    if (body.action === 'toggle_star' && body.thread_id) {
      const starred = ApovoStore.toggleThreadStar(body.thread_id);
      return NextResponse.json({ success: true, starred });
    }

    if (body.action === 'set_unread' && body.thread_id && typeof body.unread === 'boolean') {
      ApovoStore.setThreadUnread(body.thread_id, body.unread);
      return NextResponse.json({ success: true, unread: body.unread });
    }

    if (body.action === 'sync') {
      if (!patient.agentmail_inbox_id) {
        return NextResponse.json(
          { error: 'Care email inbox has not been provisioned yet.' },
          { status: 409 }
        );
      }
      const synced = await syncPatientCareInbox(patient);
      return NextResponse.json({ success: true, ...synced });
    }

    if (body.action === 'create_followup_draft') {
      if (!patient.agentmail_inbox_id || !patient.care_email) {
        return NextResponse.json(
          { error: 'Provision your AgentMail care email first before staging a follow-up.' },
          { status: 409 }
        );
      }
      const apps = ApovoStore.matchInitialPrograms(patient.id);
      const app =
        (body.application_id ? ApovoStore.getApplication(body.application_id) : null) ||
        apps[0] ||
        null;
      const programName = body.program_name || app?.resource.name || 'Remember Betty';
      const followUp = app ? ApovoStore.getFollowUp(app.id) : null;

      const recipient = (body.to || followUp?.draft_recipient || '').trim();
      const subject = (
        body.subject ||
        followUp?.draft_subject ||
        `Status Inquiry — ${programName} Application`
      ).trim();
      const text = (
        body.text ||
        followUp?.draft_body ||
        `Hello ${programName} Team,\n\nI am writing from my Care Concierge medical inbox to politely check on the status of my grant application and confirm if any additional documentation is needed.\n\nThank you,\n${patient.first_name} ${patient.last_name}`.trim()
      ).trim();

      if (!recipient || !recipient.includes('@')) {
        return NextResponse.json(
          { error: 'A valid recipient email address is required to create an AgentMail draft.' },
          { status: 400 }
        );
      }

      const remoteDraft = await createCareDraft({
        inboxId: patient.agentmail_inbox_id,
        to: [recipient],
        subject,
        text,
        labels: ['followup_status', 'awaiting_patient_consent'],
        clientId: `apovo-followup-${app?.id || 'general'}-${Date.now()}`,
      });

      const savedDraft = ApovoStore.saveDraft({
        draft_id: remoteDraft.draftId,
        inbox_id: patient.agentmail_inbox_id,
        thread_id: remoteDraft.threadId,
        in_reply_to: remoteDraft.inReplyTo,
        patient_id: patient.id,
        application_id: app?.id,
        program_name: programName,
        to: remoteDraft.to.length ? remoteDraft.to : [recipient],
        subject: remoteDraft.subject || subject,
        text: remoteDraft.text || text,
        html: remoteDraft.html,
        kind: 'followup_status',
        reason: `Follow-up Agent prepared a status inquiry for ${programName}. Review and consent to send.`,
        status: 'pending_consent',
        created_at: remoteDraft.createdAt,
        updated_at: remoteDraft.updatedAt,
      });

      const task = ApovoStore.createTask({
        patient_id: patient.id,
        application_id: app?.id || '',
        program_name: programName,
        asker: `${programName} · Follow-up Agent`,
        type: 'approve_followup',
        title: `Consent to send status follow-up to ${programName}`,
        why: `Follow-up Agent drafted a polite status check from ${patient.care_email} to ${recipient}. Nothing is sent until you consent.`,
        shared_with: `${programName} (${recipient})`,
        thread_id: remoteDraft.threadId,
        draft_id: savedDraft.draft_id,
        source_kind: 'followup_agent',
      });

      ApovoStore.updateDraft(savedDraft.draft_id, { linked_task_id: task.id });

      return NextResponse.json({
        success: true,
        draft: savedDraft,
        task,
      });
    }

    if (body.action === 'send_new') {
      if (!patient.agentmail_inbox_id || !patient.care_email) {
        return NextResponse.json(
          { error: 'Provision your AgentMail care email before sending messages.' },
          { status: 409 }
        );
      }
      const recipient = (body.to || '').trim();
      const subject = (body.subject || '').trim();
      const text = (body.text || '').trim();
      if (!recipient.includes('@') || !subject || !text) {
        return NextResponse.json(
          { error: 'Recipient, subject, and message body are required.' },
          { status: 400 }
        );
      }

      const apps = ApovoStore.matchInitialPrograms(patient.id);
      const app =
        (body.application_id ? ApovoStore.getApplication(body.application_id) : null) ||
        apps[0] ||
        null;
      const programName = body.program_name || app?.resource.name || 'Grant Program';

      const sent = await sendCareMessage({
        inboxId: patient.agentmail_inbox_id,
        to: [recipient],
        subject,
        text,
      });

      const email = ApovoStore.saveEmail({
        patient_id: patient.id,
        application_id: app?.id,
        program_name: programName,
        inbox_id: patient.agentmail_inbox_id,
        thread_id: sent.threadId,
        message_id: sent.messageId,
        direction: 'outbound',
        from: patient.care_email,
        to: recipient,
        subject,
        body_text: text,
        body_html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
        classification: 'pending',
        summary: `Sent with your consent to ${recipient}`,
        delivery_status: 'sent',
        unread: false,
      });

      ApovoStore.addCareEvent({
        patient_id: patient.id,
        application_id: app?.id,
        type: 'followup_sent',
        agent: 'followup',
        title: `Sent consented email to ${programName}`,
        description: `Subject: "${subject}" → ${recipient}`,
        metadata: { message_id: sent.messageId, thread_id: sent.threadId },
      });

      return NextResponse.json({ success: true, email });
    }

    return NextResponse.json({ error: 'Unsupported inbox action' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof AgentMailError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Failed to process inbox request';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
