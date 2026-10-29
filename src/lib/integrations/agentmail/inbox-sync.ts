import 'server-only';
import { ApovoStore, classifyEmailContent } from '../../store';
import type { AgentDraftRecord, EmailRecord, PatientProfile, PatientTask } from '../../types';
import {
  type AgentMailMessageItem,
  createCareDraft,
  getInboxMessage,
  listCareDrafts,
  listInboxMessages,
} from './client';

function hasAgentMailApiKey(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY?.trim());
}

export interface IngestedAgentMailResult {
  email: EmailRecord;
  matchedApplicationId?: string;
  task?: PatientTask;
  draft?: AgentDraftRecord;
}

function extractSenderDisplay(from: string): string {
  if (!from) return 'Grant Program';
  if (from.includes('<')) {
    const name = from.split('<')[0].replace(/"/g, '').trim();
    if (name) return name;
  }
  const domainPart = from.split('@')[1]?.split('.')[0];
  if (domainPart && domainPart !== 'agentmail') {
    return domainPart.charAt(0).toUpperCase() + domainPart.slice(1);
  }
  return from;
}

function extractAddressOnly(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

export async function ingestAgentMailMessage(
  patient: PatientProfile,
  msg: AgentMailMessageItem,
  fetchImpl?: typeof fetch
): Promise<IngestedAgentMailResult> {
  // Handle >64 KiB messages where AgentMail provides body_url or omits inline text
  let resolvedMsg = msg;
  if (!resolvedMsg.text && !resolvedMsg.extractedText && resolvedMsg.bodyUrl && patient.agentmail_inbox_id) {
    try {
      resolvedMsg = await getInboxMessage(patient.agentmail_inbox_id, resolvedMsg.messageId, fetchImpl);
    } catch {
      // Keep original metadata if body fetch fails
    }
  }

  const careEmailLower = (patient.care_email || patient.agentmail_inbox_id || '').toLowerCase();
  const fromAddressLower = extractAddressOnly(resolvedMsg.from).toLowerCase();
  const isOutbound = Boolean(careEmailLower && fromAddressLower === careEmailLower);

  const applications = ApovoStore.matchInitialPrograms(patient.id);
  let matchedApp = applications[0] || null;
  let programName = matchedApp?.resource.name || extractSenderDisplay(resolvedMsg.from);

  const bodyForMatching = `${resolvedMsg.subject} ${resolvedMsg.extractedText || resolvedMsg.text}`;
  for (const app of applications) {
    const progKey = app.resource.id.toLowerCase();
    const progNameLower = app.resource.name.toLowerCase();
    if (
      resolvedMsg.from.toLowerCase().includes(progKey) ||
      bodyForMatching.toLowerCase().includes(progNameLower) ||
      bodyForMatching.toLowerCase().includes('betty')
    ) {
      matchedApp = app;
      programName = app.resource.name;
      break;
    }
  }

  const cleanText = resolvedMsg.extractedText || resolvedMsg.text || resolvedMsg.subject;
  const cleanHtml =
    resolvedMsg.extractedHtml ||
    resolvedMsg.html ||
    `<p>${cleanText.replace(/\n/g, '<br>')}</p>`;

  const { classification, summary, deadline, suggestedQuestion } = isOutbound
    ? {
        classification: 'pending' as const,
        summary: `Sent from your Care Inbox to ${resolvedMsg.to.join(', ') || programName}.`,
        deadline: undefined,
        suggestedQuestion: undefined,
      }
    : classifyEmailContent(resolvedMsg.subject, cleanText);

  const isUnread = isOutbound
    ? false
    : resolvedMsg.labels.length > 0
    ? resolvedMsg.labels.includes('unread')
    : true;

  const actionsTaken: string[] = [];
  if (!isOutbound) {
    actionsTaken.push('Matched to your care profile via AgentMail');
    if (classification === 'needs_info') {
      actionsTaken.push('Created pending item for your input & reply consent');
    } else if (classification === 'approved') {
      actionsTaken.push('Updated grant status to Approved');
    } else if (classification === 'confirmation') {
      actionsTaken.push('Confirmed receipt & scheduled follow-up tracking');
    }
  }

  const email = ApovoStore.saveEmail({
    patient_id: patient.id,
    application_id: matchedApp?.id,
    program_name: programName,
    inbox_id: resolvedMsg.inboxId || patient.agentmail_inbox_id,
    thread_id: resolvedMsg.threadId,
    message_id: resolvedMsg.messageId,
    in_reply_to: resolvedMsg.inReplyTo,
    direction: isOutbound ? 'outbound' : 'inbound',
    from: resolvedMsg.from,
    to: resolvedMsg.to.join(', ') || patient.care_email || '',
    subject: resolvedMsg.subject || 'Grant Program Correspondence',
    body_html: cleanHtml,
    body_text: cleanText,
    extracted_text: resolvedMsg.extractedText || cleanText,
    extracted_html: resolvedMsg.extractedHtml || cleanHtml,
    classification,
    summary,
    deadline,
    actions_taken: actionsTaken,
    labels: resolvedMsg.labels,
    delivery_status: isOutbound ? 'sent' : 'received',
    unread: isUnread,
    created_at: resolvedMsg.createdAt,
  });

  if (isOutbound) {
    return { email, matchedApplicationId: matchedApp?.id };
  }

  ApovoStore.addCareEvent({
    patient_id: patient.id,
    application_id: matchedApp?.id,
    type: 'email_received',
    agent: 'inbox',
    title: `Inbox Agent received email from ${programName}`,
    description: summary,
    metadata: {
      message_id: email.message_id,
      thread_id: email.thread_id,
      classification,
    },
  });

  if (matchedApp) {
    if (classification === 'approved') {
      ApovoStore.updateApplication(matchedApp.id, { state: 'Approved' });
    } else if (classification === 'benefit_delivered') {
      ApovoStore.updateApplication(matchedApp.id, { state: 'BenefitReceived' });
    } else if (classification === 'denied') {
      ApovoStore.updateApplication(matchedApp.id, { state: 'Denied' });
    } else if (classification === 'needs_info') {
      ApovoStore.updateApplication(matchedApp.id, { state: 'NeedsPatientInput' });
    } else if (classification === 'confirmation') {
      ApovoStore.updateApplication(matchedApp.id, { state: 'AwaitingResponse' });
    }
  }

  let createdTask: PatientTask | undefined;
  let stagedDraft: AgentDraftRecord | undefined;

  if (classification === 'needs_info') {
    const existingDraft = ApovoStore.getPendingDraftForThread(email.thread_id, patient.id);
    const replyRecipient = extractAddressOnly(resolvedMsg.from);
    const replySubject = resolvedMsg.subject.toLowerCase().startsWith('re:')
      ? resolvedMsg.subject
      : `Re: ${resolvedMsg.subject || `${programName} Application`}`;
    const patientFullName = `${patient.first_name || 'Applicant'} ${patient.last_name || ''}`.trim();

    const defaultDraftBody = `Hello ${programName} Team,\n\nThank you for your update regarding my application. With my consent, Apovo Care Concierge is sharing the requested follow-up details below:\n\n[Patient response will be inserted here upon confirmation]\n\nWarm regards,\n${patientFullName}\n(Sent with patient consent via Apovo Care Concierge)`;

    if (!existingDraft && patient.agentmail_inbox_id && hasAgentMailApiKey() && replyRecipient.includes('@')) {
      try {
        const remoteDraft = await createCareDraft(
          {
            inboxId: patient.agentmail_inbox_id,
            to: [replyRecipient],
            subject: replySubject,
            text: defaultDraftBody,
            threadId: email.thread_id,
            inReplyTo: email.message_id,
            labels: ['awaiting_patient_consent'],
            clientId: `apovo-reply-draft-${email.message_id}`,
          },
          fetchImpl
        );
        stagedDraft = ApovoStore.saveDraft({
          draft_id: remoteDraft.draftId,
          inbox_id: patient.agentmail_inbox_id,
          thread_id: email.thread_id,
          in_reply_to: email.message_id,
          patient_id: patient.id,
          application_id: matchedApp?.id,
          program_name: programName,
          to: remoteDraft.to.length ? remoteDraft.to : [replyRecipient],
          subject: remoteDraft.subject || replySubject,
          text: remoteDraft.text || defaultDraftBody,
          html: remoteDraft.html,
          kind: 'reply_consent',
          reason: summary,
          status: 'pending_consent',
          created_at: remoteDraft.createdAt,
          updated_at: remoteDraft.updatedAt,
        });
      } catch {
        // If remote draft creation fails, task still captures user consent & triggers reply on approval
      }
    } else if (existingDraft) {
      stagedDraft = existingDraft;
    }

    createdTask = ApovoStore.createTask({
      patient_id: patient.id,
      application_id: matchedApp?.id || '',
      program_name: programName,
      asker: `${programName} · Inbox Agent`,
      type: suggestedQuestion?.type === 'file' ? 'file' : 'consent_reply',
      title:
        suggestedQuestion?.title ||
        `Review & consent to reply to ${programName}: "${email.subject}"`,
      why:
        suggestedQuestion?.why ||
        `${programName} requested additional verification by email. Apovo prepared a reply draft awaiting your input and consent.`,
      shared_with: `${programName} (${replyRecipient || 'Grant Desk'})`,
      thread_id: email.thread_id,
      message_id: email.message_id,
      draft_id: stagedDraft?.draft_id,
      deadline,
      source_kind: 'email_agent',
    });

    if (stagedDraft && createdTask) {
      stagedDraft =
        ApovoStore.updateDraft(stagedDraft.draft_id, {
          linked_task_id: createdTask.id,
        }) || stagedDraft;
    }
  }

  return {
    email,
    matchedApplicationId: matchedApp?.id,
    task: createdTask,
    draft: stagedDraft,
  };
}

export async function syncPatientCareInbox(
  patient: PatientProfile,
  fetchImpl?: typeof fetch
): Promise<{ syncedMessages: number; syncedDrafts: number }> {
  if (!patient.agentmail_inbox_id || !hasAgentMailApiKey()) {
    return { syncedMessages: 0, syncedDrafts: 0 };
  }

  let syncedMessages = 0;
  let syncedDrafts = 0;

  const messages = await listInboxMessages(patient.agentmail_inbox_id, { limit: 50 }, fetchImpl);
  const chronological = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const msg of chronological) {
    const existing = ApovoStore.getEmails(patient.id).find((e) => e.message_id === msg.messageId);
    if (!existing) {
      await ingestAgentMailMessage(patient, msg, fetchImpl);
      syncedMessages += 1;
    }
  }

  const remoteDrafts = await listCareDrafts(patient.agentmail_inbox_id, fetchImpl);
  const apps = ApovoStore.getApplications(patient.id);
  const defaultApp = apps[0];

  for (const d of remoteDrafts) {
    const existingDraft = ApovoStore.getDraft(d.draftId);
    if (!existingDraft) {
      const savedDraft = ApovoStore.saveDraft({
        draft_id: d.draftId,
        inbox_id: patient.agentmail_inbox_id,
        thread_id: d.threadId,
        in_reply_to: d.inReplyTo,
        patient_id: patient.id,
        application_id: defaultApp?.id,
        program_name: defaultApp?.resource.name || 'Grant Program',
        to: d.to,
        subject: d.subject || 'Draft Reply',
        text: d.text,
        html: d.html,
        kind: d.inReplyTo ? 'reply_consent' : 'followup_status',
        reason: 'Agent-prepared email draft awaiting your review and consent before sending.',
        status: 'pending_consent',
        created_at: d.createdAt,
        updated_at: d.updatedAt,
      });

      const task = ApovoStore.createTask({
        patient_id: patient.id,
        application_id: defaultApp?.id || '',
        program_name: savedDraft.program_name,
        asker: `${savedDraft.program_name} · ${savedDraft.kind === 'followup_status' ? 'Follow-up Agent' : 'Inbox Agent'}`,
        type: savedDraft.kind === 'followup_status' ? 'approve_followup' : 'consent_reply',
        title: `Consent to send email: "${savedDraft.subject}"`,
        why: savedDraft.reason,
        shared_with: savedDraft.to.join(', ') || savedDraft.program_name,
        thread_id: savedDraft.thread_id,
        message_id: savedDraft.in_reply_to,
        draft_id: savedDraft.draft_id,
        source_kind: savedDraft.kind === 'followup_status' ? 'followup_agent' : 'email_agent',
      });

      ApovoStore.updateDraft(savedDraft.draft_id, { linked_task_id: task.id });
      syncedDrafts += 1;
    }
  }

  return { syncedMessages, syncedDrafts };
}
