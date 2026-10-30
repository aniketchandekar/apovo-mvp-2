import { createRememberBettyProgram } from '../remember-betty';
import type {
  AgentDraftRecord,
  ApplicationRecord,
  EmailRecord,
  PatientProfile,
  PatientTask,
  StartedGrantSummary,
} from '../types';
import type { DemoUiState } from './types';

export const EMPTY_DEMO_UI_STATE: DemoUiState = {
  answeredTaskIds: [],
  skippedTaskIds: [],
  starredThreadIds: [],
  readThreadIds: [],
  unreadThreadIds: [],
  sentThreadIds: [],
};

export const DEMO_TASK_ID = 'demo_task_remember_betty_followup';
export const DEMO_COMPLETED_TASK_ID = 'demo_task_profile_verified';
export const DEMO_ACK_THREAD_ID = 'demo_thread_remember_betty';
export const DEMO_WELCOME_THREAD_ID = 'demo_thread_care_welcome';
export const DEMO_INBOX_ID = 'inbox_demo_ava';
export const DEMO_APPLICATION_ID = 'app_remember-betty_demo_ava';

const CREATED_AT = '2026-01-06T15:00:00.000Z';

export const DEMO_PATIENT: PatientProfile = {
  id: 'demo_ava_testperson',
  first_name: 'Ava',
  last_name: 'Testperson',
  dob: '1984-04-12',
  phone: '(555) 010-0142',
  address_street: '100 Demo Lane',
  address_city: 'Austin',
  address_state: 'TX',
  address_zip: '78701',
  personal_email: 'ava.testperson@example.test',
  diagnosis: 'Synthetic breast cancer test fixture',
  stage: 'Stage II',
  treatment_status: 'Active treatment',
  treatment_types: ['Chemotherapy'],
  oncologist_name: 'Dr. Demo Clinician',
  clinic_name: 'Apovo Test Clinic',
  insurance: 'Synthetic PPO',
  needs: ['bills', 'groceries'],
  household_size: 2,
  monthly_income_band: '$2,000–$3,000',
  employment_status: 'Medical leave',
  consent_at: '2026-01-01T00:00:00.000Z',
  consent_version: 'demo-v1',
  consent_signature: 'Ava Testperson',
  care_email: 'ava.testperson@apovo.care',
  agentmail_inbox_id: DEMO_INBOX_ID,
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: CREATED_AT,
};

export const DEMO_APPLICATION: ApplicationRecord = {
  id: DEMO_APPLICATION_ID,
  patient_id: DEMO_PATIENT.id,
  resource_id: 'remember-betty',
  resource: createRememberBettyProgram(DEMO_PATIENT),
  state: 'AwaitingResponse',
  created_at: '2026-01-02T14:00:00.000Z',
  updated_at: CREATED_AT,
};

function taskStatus(ui: DemoUiState): PatientTask['status'] {
  if (ui.answeredTaskIds.includes(DEMO_TASK_ID)) return 'answered';
  if (ui.skippedTaskIds.includes(DEMO_TASK_ID)) return 'skipped';
  return 'open';
}

export function demoDraft(ui: DemoUiState): AgentDraftRecord | null {
  if (!ui.draft) return null;
  return {
    draft_id: 'demo_draft_followup',
    inbox_id: DEMO_INBOX_ID,
    thread_id: ui.draft.threadId,
    patient_id: DEMO_PATIENT.id,
    application_id: DEMO_APPLICATION_ID,
    program_name: 'Remember Betty Foundation',
    to: [ui.draft.to],
    subject: ui.draft.subject,
    text: ui.draft.text,
    kind: 'followup_status',
    reason: 'Synthetic demo draft awaiting your consent.',
    linked_task_id: DEMO_TASK_ID,
    status: 'pending_consent',
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

export function demoTasks(ui: DemoUiState) {
  const status = taskStatus(ui);
  const openTask: PatientTask & { draft?: AgentDraftRecord } = {
    id: DEMO_TASK_ID,
    patient_id: DEMO_PATIENT.id,
    application_id: DEMO_APPLICATION_ID,
    program_name: 'Remember Betty Foundation',
    asker: 'Remember Betty Foundation · Follow-up Agent',
    type: 'approve_followup',
    title: 'Approve a synthetic application status follow-up',
    why: 'This demonstrates how Apovo pauses before sending any message from a care inbox.',
    shared_with: 'Remember Betty Foundation demo recipient',
    status,
    answer: status === 'answered' ? 'Synthetic consent confirmed' : undefined,
    created_at: CREATED_AT,
    answered_at: status === 'answered' ? CREATED_AT : undefined,
    skip_reason: status === 'skipped' ? 'Skipped in demo mode' : undefined,
    thread_id: DEMO_ACK_THREAD_ID,
    draft_id: ui.draft?.threadId === DEMO_ACK_THREAD_ID ? 'demo_draft_followup' : undefined,
    source_kind: 'followup_agent',
  };
  const draft = demoDraft(ui);
  if (draft?.thread_id === DEMO_ACK_THREAD_ID) openTask.draft = draft;

  const completed: PatientTask = {
    id: DEMO_COMPLETED_TASK_ID,
    patient_id: DEMO_PATIENT.id,
    application_id: DEMO_APPLICATION_ID,
    program_name: 'Remember Betty Foundation',
    asker: 'Apovo · Form Agent',
    type: 'text',
    title: 'Verify synthetic care profile',
    why: 'Confirms the demonstration uses Ava Testperson only.',
    shared_with: 'Apovo synthetic workflow',
    status: 'answered',
    answer: 'Verified',
    created_at: '2026-01-03T15:00:00.000Z',
    answered_at: '2026-01-03T15:05:00.000Z',
    source_kind: 'form_agent',
  };
  return [openTask, completed];
}

export function demoTaskPayload(ui: DemoUiState) {
  const tasks = demoTasks(ui);
  const open = tasks.filter((task) => task.status === 'open');
  return {
    tasks,
    total: tasks.length,
    counts: {
      open: open.length,
      consent: open.filter((task) => task.type === 'approve_followup').length,
      data: open.filter((task) => task.type !== 'approve_followup').length,
      completed: tasks.filter((task) => task.status !== 'open').length,
    },
    patient_id: DEMO_PATIENT.id,
    care_email: DEMO_PATIENT.care_email,
  };
}

const ACK_MESSAGE: EmailRecord = {
  id: 'demo_email_ack',
  patient_id: DEMO_PATIENT.id,
  application_id: DEMO_APPLICATION_ID,
  program_name: 'Remember Betty Foundation',
  thread_id: DEMO_ACK_THREAD_ID,
  inbox_id: DEMO_INBOX_ID,
  direction: 'inbound',
  from: 'Remember Betty Foundation <grants@rememberbetty.com>',
  to: DEMO_PATIENT.care_email!,
  subject: 'Remember Betty application received',
  body_html: '<p>Thank you. Your synthetic demonstration application has been received for review.</p>',
  body_text: 'Thank you. Your synthetic demonstration application has been received for review.',
  classification: 'pending',
  summary: 'The foundation acknowledged the synthetic application and it is awaiting review.',
  actions_taken: ['Application acknowledgment classified', 'Follow-up window monitored'],
  unread: true,
  starred: false,
  created_at: '2026-01-06T15:00:00.000Z',
  message_id: 'demo_message_ack',
  delivery_status: 'received',
};

const WELCOME_MESSAGE: EmailRecord = {
  id: 'demo_email_welcome',
  patient_id: DEMO_PATIENT.id,
  program_name: 'Apovo Care Team',
  thread_id: DEMO_WELCOME_THREAD_ID,
  inbox_id: DEMO_INBOX_ID,
  direction: 'inbound',
  from: 'Apovo Care Team <care@example.test>',
  to: DEMO_PATIENT.care_email!,
  subject: 'Your synthetic Care Inbox is ready',
  body_html: '<p>This protected inbox uses synthetic demonstration messages only.</p>',
  body_text: 'This protected inbox uses synthetic demonstration messages only.',
  classification: 'confirmation',
  summary: 'Your demo Care Inbox is ready and contains no real patient messages.',
  actions_taken: ['Synthetic care address confirmed'],
  unread: false,
  starred: false,
  created_at: '2026-01-05T14:00:00.000Z',
  message_id: 'demo_message_welcome',
  delivery_status: 'received',
};

function isUnread(ui: DemoUiState, threadId: string, defaultUnread: boolean) {
  if (ui.unreadThreadIds.includes(threadId)) return true;
  if (ui.readThreadIds.includes(threadId)) return false;
  return defaultUnread;
}

export function demoInboxPayload(ui: DemoUiState, filter = 'inbox', query = '') {
  const draft = demoDraft(ui);
  const source = [
    { message: ACK_MESSAGE, defaultUnread: true, status: 'waiting' },
    { message: WELCOME_MESSAGE, defaultUnread: false, status: 'done' },
  ].map(({ message, defaultUnread, status }) => {
    const unread = isUnread(ui, message.thread_id, defaultUnread);
    const starred = ui.starredThreadIds.includes(message.thread_id);
    const latest = { ...message, unread, starred };
    return {
      thread_id: message.thread_id,
      latest,
      messages: [latest],
      messageCount: 1,
      unreadCount: unread ? 1 : 0,
      starred,
      program_name: message.program_name,
      subject: message.subject,
      pendingDraft: draft?.thread_id === message.thread_id ? draft : null,
      openTask:
        message.thread_id === DEMO_ACK_THREAD_ID && taskStatus(ui) === 'open'
          ? demoTasks(ui)[0]
          : null,
      hasOutbound: ui.sentThreadIds.includes(message.thread_id),
      hasInbound: true,
      isOutboundOnly: false,
      status,
    };
  });

  const normalizedQuery = query.trim().toLowerCase();
  const threads = source.filter((thread) => {
    const matchesFilter =
      filter === 'all' ||
      filter === 'inbox' ||
      (filter === 'waiting' && thread.status === 'waiting') ||
      (filter === 'done' && thread.status === 'done') ||
      (filter === 'starred' && thread.starred) ||
      (filter === 'sent' && thread.hasOutbound) ||
      (filter === 'drafts' && Boolean(thread.pendingDraft)) ||
      (filter === 'needs_you' && Boolean(thread.pendingDraft));
    const matchesQuery =
      !normalizedQuery ||
      `${thread.program_name} ${thread.subject} ${thread.latest.summary}`
        .toLowerCase()
        .includes(normalizedQuery);
    return matchesFilter && matchesQuery;
  });
  const unread = source.reduce((total, thread) => total + thread.unreadCount, 0);

  return {
    patient_id: DEMO_PATIENT.id,
    patient_name: `${DEMO_PATIENT.first_name} ${DEMO_PATIENT.last_name}`,
    care_email: DEMO_PATIENT.care_email,
    inbox_id: DEMO_INBOX_ID,
    agentmail_configured: true,
    sync_error: null,
    threads,
    drafts: draft ? [draft] : [],
    applications: [DEMO_APPLICATION],
    counts: {
      inbox: source.length,
      all: source.length,
      needs_you: draft ? 1 : 0,
      waiting: 1,
      done: 1,
      drafts: draft ? 1 : 0,
      sent: source.filter((thread) => thread.hasOutbound).length,
      starred: source.filter((thread) => thread.starred).length,
      unread,
    },
  };
}

export function demoThreadDetail(ui: DemoUiState, threadId: string) {
  const list = demoInboxPayload(ui, 'all').threads;
  const thread = list.find((item) => item.thread_id === threadId);
  if (!thread) return null;
  return {
    thread_id: thread.thread_id,
    program_name: thread.program_name,
    subject: thread.subject,
    latest: thread.latest,
    messages: thread.messages,
    application: threadId === DEMO_ACK_THREAD_ID ? DEMO_APPLICATION : null,
    followUpConfig: null,
    task: thread.openTask,
    draft: thread.pendingDraft,
  };
}

export function demoStartedGrants(ui: DemoUiState): StartedGrantSummary[] {
  const task = demoTasks(ui)[0];
  return [
    {
      application: DEMO_APPLICATION,
      latestRun: null,
      pendingQuestionsCount: task.status === 'open' ? 1 : 0,
      answeredQuestionsCount: task.status === 'answered' ? 1 : 0,
      totalQuestionsCount: 1,
      pendingQuestions:
        task.status === 'open'
          ? [
              {
                id: task.id,
                title: task.title,
                why: task.why,
                type: task.type,
                source_kind: task.source_kind,
              },
            ]
          : [],
    },
  ];
}

export function demoDashboardPayload(ui: DemoUiState) {
  const taskPayload = demoTaskPayload(ui);
  const inboxPayload = demoInboxPayload(ui);
  const openTasks = taskPayload.tasks.filter((task) => task.status === 'open');
  return {
    patient: DEMO_PATIENT,
    applications: [DEMO_APPLICATION],
    startedGrants: demoStartedGrants(ui),
    events: [],
    openTasks,
    openTasksCount: openTasks.length,
    pendingItemsCount: openTasks.length,
    unreadEmailsCount: inboxPayload.counts.unread,
    agentRun: null,
    capabilities: { applicationTestMode: true },
    stats: { secured: 0, inProgress: 1, followUps: 1, hoursSaved: 0 },
    syntheticDemo: true,
  };
}

export function isDemoThreadId(value: string) {
  return value === DEMO_ACK_THREAD_ID || value === DEMO_WELCOME_THREAD_ID;
}
