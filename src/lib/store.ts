import fs from 'fs';
import path from 'path';
import {
  AgentDraftRecord,
  AgentRun,
  ApplicationRecord,
  CareEvent,
  EmailClassification,
  EmailRecord,
  FollowUpConfig,
  PatientProfile,
  PatientTask,
  StartedGrantSummary,
} from './types';
import { createRememberBettyProgram } from './remember-betty';
import { getResourceCatalog } from './resource-catalog';
import type {
  ApplicationArtifact,
  ApplicationRun,
  RequiredInput,
  RunEvent,
  RunPhase,
} from './application-agent/types';
import { assertTransition, stateForPhase } from './application-agent/state-machine';

interface DatabaseState {
  schemaVersion: number;
  patients: Record<string, PatientProfile>;
  applications: Record<string, ApplicationRecord>;
  events: CareEvent[];
  tasks: Record<string, PatientTask>;
  emails: Record<string, EmailRecord>;
  drafts: Record<string, AgentDraftRecord>;
  processedWebhookEvents: Record<string, string>;
  followups: Record<string, FollowUpConfig>;
  agentRun: AgentRun | null;
  activePatientId: string | null;
  applicationRuns: Record<string, ApplicationRun>;
  runEvents: Record<string, RunEvent[]>;
  applicationArtifacts: Record<string, ApplicationArtifact>;
  requiredInputs: Record<string, RequiredInput>;
}

const DATA_DIR = process.env.APOVO_DATA_DIR || path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function emptyState(): DatabaseState {
  return {
    schemaVersion: 5,
    patients: {},
    applications: {},
    events: [],
    tasks: {},
    emails: {},
    drafts: {},
    processedWebhookEvents: {},
    followups: {},
    agentRun: null,
    activePatientId: null,
    applicationRuns: {},
    runEvents: {},
    applicationArtifacts: {},
    requiredInputs: {},
  };
}

let memoryState = emptyState();

function persist(state: DatabaseState) {
  memoryState = state;
  if (!fs.existsSync(/* turbopackIgnore: true */ DATA_DIR)) {
    fs.mkdirSync(/* turbopackIgnore: true */ DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function loadState(): DatabaseState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Partial<DatabaseState>;
      memoryState = { ...emptyState(), ...parsed };
      memoryState.schemaVersion = parsed.schemaVersion || 0;
    }
  } catch (error) {
    console.error('Unable to load local data:', error);
  }

  if (memoryState.schemaVersion < 3) {
    for (const [id, patient] of Object.entries(memoryState.patients)) {
      if (id.endsWith('_demo') || patient.personal_email?.includes('.demo@')) {
        delete memoryState.patients[id];
      }
    }
    memoryState.applications = {};
    memoryState.events = [];
    memoryState.tasks = {};
    memoryState.emails = {};
    memoryState.followups = {};
    memoryState.agentRun = null;
    const remaining = Object.values(memoryState.patients).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    memoryState.activePatientId = remaining[0]?.id || null;
  }

  if (memoryState.schemaVersion < 5) {
    memoryState.applicationRuns ||= {};
    memoryState.runEvents ||= {};
    memoryState.applicationArtifacts ||= {};
    memoryState.requiredInputs ||= {};
    memoryState.drafts ||= {};
    memoryState.processedWebhookEvents ||= {};
    memoryState.schemaVersion = 5;
    persist(memoryState);
  }

  return memoryState;
}

loadState();

export function classifyEmailContent(subject: string, text: string): {
  classification: EmailClassification;
  summary: string;
  deadline?: string;
  suggestedQuestion?: {
    title: string;
    why: string;
    fieldKey?: string;
    type: 'text' | 'file' | 'date';
  };
} {
  const lower = `${subject} ${text}`.toLowerCase();

  // 1. Approval
  if (
    lower.includes('approved') ||
    lower.includes('congratulations') ||
    lower.includes('grant has been awarded') ||
    lower.includes('disbursement scheduled')
  ) {
    return {
      classification: 'approved',
      summary: 'Grant request approved! Funds are scheduled for disbursement.',
    };
  }

  // 2. Needs info
  if (
    lower.includes('additional information') ||
    lower.includes('need') ||
    lower.includes('required') ||
    lower.includes('verification') ||
    lower.includes('please provide') ||
    lower.includes('treatment letter') ||
    lower.includes('missing') ||
    lower.includes('confirm') ||
    lower.includes('question')
  ) {
    let deadline: string | undefined;
    const deadlineMatch = lower.match(/by\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i);
    if (deadlineMatch && deadlineMatch[1]) {
      deadline = deadlineMatch[1];
    }

    const isFileRequest =
      lower.includes('letter') ||
      lower.includes('document') ||
      lower.includes('pdf') ||
      lower.includes('upload') ||
      lower.includes('copy of');

    return {
      classification: 'needs_info',
      summary: `Additional information or verification requested${deadline ? ` by ${deadline}` : ''}.`,
      deadline,
      suggestedQuestion: {
        title: isFileRequest
          ? `Provide requested documentation for "${subject}"`
          : `Provide clarification requested in "${subject}"`,
        why: `The program emailed your medical inbox requesting this information${deadline ? ` by ${deadline}` : ''} before they can advance your application.`,
        type: isFileRequest ? 'file' : 'text',
      },
    };
  }

  // 3. Benefit delivered
  if (
    lower.includes('delivered') ||
    lower.includes('check mailed') ||
    lower.includes('service scheduled') ||
    lower.includes('benefit received')
  ) {
    return {
      classification: 'benefit_delivered',
      summary: 'Benefit delivery verified and active.',
    };
  }

  // 4. Denied
  if (
    lower.includes('unable to approve') ||
    lower.includes('denied') ||
    lower.includes('funds depleted') ||
    lower.includes('ineligible')
  ) {
    return {
      classification: 'denied',
      summary: 'This program was unable to fund at this time. Exploring matching alternatives.',
    };
  }

  // 5. Confirmation
  if (
    lower.includes('received') ||
    lower.includes('confirmed') ||
    lower.includes('confirmation') ||
    lower.includes('review queue')
  ) {
    return {
      classification: 'confirmation',
      summary: 'Application submission acknowledged and under review by program desk.',
    };
  }

  return {
    classification: 'pending',
    summary: 'Correspondence received and recorded in Care Inbox.',
  };
}

export const ApovoStore = {
  getActivePatient(): PatientProfile | null {
    const state = loadState();
    if (state.activePatientId) return state.patients[state.activePatientId] || null;
    return Object.values(state.patients)[0] || null;
  },

  clearActivePatient(): void {
    const state = loadState();
    state.activePatientId = null;
    persist(state);
  },

  clearAllData(): void {
    const fresh = emptyState();
    persist(fresh);
    const dirsToClean = [
      path.join(DATA_DIR, 'artifacts'),
      process.env.APOVO_ARTIFACT_DIR,
    ].filter(Boolean) as string[];

    for (const dir of dirsToClean) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            try {
              const fullPath = path.join(dir, file);
              if (fs.statSync(fullPath).isFile()) {
                fs.unlinkSync(fullPath);
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (e) {
        console.error('Error cleaning up artifacts:', e);
      }
    }
  },

  setPatientPreset(preset = 'jane-doe'): PatientProfile {
    const state = loadState();
    const now = new Date().toISOString();
    const id = `patient_${preset.replace(/[^a-z0-9_]/gi, '_')}`;
    const existing = state.patients[id];
    const patient: PatientProfile = {
      id,
      first_name: 'Jane',
      last_name: 'Doe',
      dob: '1978-05-14',
      phone: '512-555-0194',
      address_street: '410 Congress Ave',
      address_city: 'Austin',
      address_state: 'TX',
      address_zip: '78701',
      diagnosis: 'Invasive Ductal Breast Cancer',
      stage: 'Stage II',
      treatment_status: 'In active treatment',
      treatment_types: ['Chemotherapy', 'Surgery'],
      oncologist_name: 'Dr. Anita Patel',
      clinic_name: 'Texas Oncology',
      insurance: 'Commercial PPO',
      needs: ['Financial', 'Transport', 'Cleaning'],
      household_size: 3,
      monthly_income_band: '$2,000–$4,000',
      employment_status: 'On medical leave',
      consent_at: existing?.consent_at || now,
      consent_version: existing?.consent_version || 'v1.0',
      consent_signature: existing?.consent_signature || 'Jane Doe',
      care_email: existing?.care_email,
      agentmail_inbox_id: existing?.agentmail_inbox_id,
      status: 'active',
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    state.patients[id] = patient;
    state.activePatientId = id;
    persist(state);
    this.matchInitialPrograms(id);
    return patient;
  },

  getPatient(id: string): PatientProfile | null {
    return loadState().patients[id] || null;
  },

  findPatientByInbox(inboxIdOrEmail: string): PatientProfile | null {
    const clean = inboxIdOrEmail.trim().toLowerCase();
    if (!clean) return null;
    const state = loadState();
    return (
      Object.values(state.patients).find(
        (p) =>
          p.agentmail_inbox_id?.toLowerCase() === clean ||
          p.care_email?.toLowerCase() === clean
      ) || null
    );
  },

  createPatient(data: Partial<PatientProfile>): PatientProfile {
    const state = loadState();
    const now = new Date().toISOString();
    const id = data.id || `patient_${Date.now()}`;
    const patient: PatientProfile = {
      id,
      first_name: '',
      last_name: '',
      dob: '',
      phone: '',
      address_street: '',
      address_city: '',
      address_state: '',
      address_zip: '',
      diagnosis: '',
      stage: '',
      treatment_status: '',
      treatment_types: [],
      insurance: '',
      needs: [],
      household_size: 1,
      monthly_income_band: '',
      employment_status: '',
      status: 'onboarding',
      created_at: now,
      updated_at: now,
      ...data,
    };
    state.patients[id] = patient;
    state.activePatientId = id;
    persist(state);
    return patient;
  },

  updatePatient(id: string, data: Partial<PatientProfile>): PatientProfile {
    const state = loadState();
    const existing = state.patients[id];
    if (!existing) throw new Error('Patient not found');
    const patient = { ...existing, ...data, updated_at: new Date().toISOString() };
    state.patients[id] = patient;
    state.activePatientId = id;
    persist(state);
    return patient;
  },

  saveConsent(id: string, signature: string, version = 'v1.0'): PatientProfile {
    const state = loadState();
    const patient = state.patients[id];
    if (!patient) throw new Error('Patient not found');
    const now = new Date().toISOString();
    Object.assign(patient, {
      consent_at: now,
      consent_signature: signature,
      consent_version: version,
      updated_at: now,
    });
    persist(state);
    return patient;
  },

  assignCareInbox(
    id: string,
    confirmedAddress: string,
    confirmedInboxId: string
  ): { patient: PatientProfile; email: string } {
    if (!confirmedAddress || !confirmedInboxId) {
      throw new Error('A confirmed AgentMail inbox ID and address are required');
    }
    const patient = this.updatePatient(id, {
      care_email: confirmedAddress,
      agentmail_inbox_id: confirmedInboxId,
      status: 'active',
    });
    return { patient, email: confirmedAddress };
  },

  matchInitialPrograms(patientId: string): ApplicationRecord[] {
    const state = loadState();
    const patient = state.patients[patientId];
    if (!patient) throw new Error('Patient not found');
    const resource = createRememberBettyProgram(patient);
    const id = `app_${resource.id}_${patientId}`;
    const current = state.applications[id];

    const runAppIds = new Set(
      Object.values(state.applicationRuns)
        .filter((run) => run.patient_id === patientId)
        .map((run) => run.application_id)
    );

    for (const [applicationId, application] of Object.entries(state.applications)) {
      if (
        application.patient_id === patientId &&
        applicationId !== id &&
        application.state === 'Matched' &&
        !runAppIds.has(applicationId)
      ) {
        delete state.applications[applicationId];
      }
    }

    const application: ApplicationRecord = {
      id,
      patient_id: patientId,
      resource_id: resource.id,
      resource,
      state: current?.state || 'Matched',
      created_at: current?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.applications[id] = application;

    if (!state.followups[id]) {
      const patientFullName = `${patient.first_name || 'Applicant'} ${patient.last_name || ''}`.trim();
      state.followups[id] = {
        application_id: id,
        program_name: resource.name,
        next_followup_date: 'Day 5 after submission',
        next_followup_label: 'Day 5 polite status inquiry',
        current_step: 1,
        status: 'scheduled',
        ladder: [
          { step: 1, day: 5, label: 'Day 5 status check email', status: 'active' },
          { step: 2, day: 10, label: 'Day 10 follow-up nudge', status: 'pending' },
          { step: 3, day: 15, label: 'Day 15 phone script & escalation', status: 'pending' },
        ],
        draft_subject: `Application Status Inquiry — ${patientFullName}`,
        draft_body: `Hello ${resource.name} Grant Review Team,\n\nI am writing via my Care Concierge medical inbox to politely check on the status of my financial assistance application and confirm whether any additional medical or financial documentation is needed from me.\n\nThank you very much for your time and support,\n${patientFullName}\n(Sent with patient consent via Apovo Care Concierge)`,
        draft_recipient: 'grants@rememberbetty.com',
      };
    }

    persist(state);
    return [application];
  },

  getApplications(patientId: string): ApplicationRecord[] {
    return Object.values(loadState().applications).filter((item) => item.patient_id === patientId);
  },

  getApplication(id: string): ApplicationRecord | null {
    const applications = Object.values(loadState().applications);
    return applications.find((item) => item.id === id || item.resource_id === id) || null;
  },

  updateApplication(id: string, updates: Partial<ApplicationRecord>): ApplicationRecord | null {
    const state = loadState();
    const current = state.applications[id];
    if (!current) return null;
    const updated = { ...current, ...updates, updated_at: new Date().toISOString() };
    state.applications[id] = updated;
    persist(state);
    return updated;
  },

  upsertApplication(application: ApplicationRecord): ApplicationRecord {
    const state = loadState();
    const existing = state.applications[application.id];
    const now = new Date().toISOString();
    const saved: ApplicationRecord = {
      ...existing,
      ...application,
      created_at: existing?.created_at || application.created_at || now,
      updated_at: now,
    };
    state.applications[application.id] = saved;
    persist(state);
    return saved;
  },

  addCareEvent(data: Omit<CareEvent, 'id' | 'created_at'> & { created_at?: string }): CareEvent {
    const state = loadState();
    const event: CareEvent = {
      ...data,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: data.created_at || new Date().toISOString(),
    };
    state.events = [event, ...state.events];
    persist(state);
    return event;
  },

  getEvents(patientId?: string): CareEvent[] {
    const events = loadState().events;
    return patientId ? events.filter((event) => event.patient_id === patientId) : events;
  },

  hasProcessedWebhookEvent(eventId: string): boolean {
    if (!eventId) return false;
    return Boolean(loadState().processedWebhookEvents[eventId]);
  },

  markWebhookEventProcessed(eventId: string) {
    if (!eventId) return;
    const state = loadState();
    state.processedWebhookEvents[eventId] = new Date().toISOString();
    persist(state);
  },

  getTasks(patientId?: string): PatientTask[] {
    const tasks = Object.values(loadState().tasks);
    return (patientId ? tasks.filter((task) => task.patient_id === patientId) : tasks).sort(
      (a, b) => b.created_at.localeCompare(a.created_at)
    );
  },

  getOpenTasks(patientId?: string): PatientTask[] {
    return this.getTasks(patientId).filter((task) => task.status === 'open');
  },

  getTask(id: string): PatientTask | null {
    return loadState().tasks[id] || null;
  },

  createTask(
    data: Partial<PatientTask> & {
      patient_id: string;
      program_name: string;
      title: string;
      why: string;
    }
  ): PatientTask {
    const state = loadState();
    if (data.draft_id) {
      const existingByDraft = Object.values(state.tasks).find(
        (t) => t.draft_id === data.draft_id && t.status === 'open'
      );
      if (existingByDraft) return existingByDraft;
    }
    if (data.message_id && data.type === 'consent_reply') {
      const existingByMsg = Object.values(state.tasks).find(
        (t) => t.message_id === data.message_id && t.status === 'open'
      );
      if (existingByMsg) return existingByMsg;
    }

    const id = data.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task: PatientTask = {
      ...data,
      id,
      patient_id: data.patient_id,
      application_id: data.application_id || '',
      program_name: data.program_name,
      type: data.type || 'text',
      title: data.title,
      why: data.why,
      shared_with: data.shared_with || data.program_name,
      status: 'open',
      created_at: data.created_at || new Date().toISOString(),
    };
    state.tasks[id] = task;
    persist(state);
    return task;
  },

  updateTask(id: string, updates: Partial<PatientTask>): PatientTask | null {
    const state = loadState();
    const task = state.tasks[id];
    if (!task) return null;
    const updated = { ...task, ...updates };
    state.tasks[id] = updated;
    persist(state);
    return updated;
  },

  answerTask(id: string, answer: unknown) {
    const state = loadState();
    const task = state.tasks[id];
    if (!task) return null;
    task.status = 'answered';
    task.answer = answer;
    task.answered_at = new Date().toISOString();
    task.consumed_at = new Date().toISOString();
    persist(state);
    return {
      task,
      application: state.applications[task.application_id] || null,
      profileUpdated: false,
    };
  },

  skipTask(id: string, reason?: string): PatientTask | null {
    const state = loadState();
    const task = state.tasks[id];
    if (!task) return null;
    task.status = 'skipped';
    task.skip_reason = reason;
    persist(state);
    return task;
  },

  /**
   * Returns a unified list of pending items combining:
   * 1. PatientTask records (Email Agent questions, AgentMail Draft consent requests, follow-up approvals)
   * 2. RequiredInput records from active/paused ApplicationRun records (PDF Form Agent questions)
   */
  getUnifiedPendingItems(patientId: string): Array<PatientTask & { draft?: AgentDraftRecord }> {
    const state = loadState();
    const tasks = Object.values(state.tasks).filter((t) => t.patient_id === patientId);
    const enrichedTasks: Array<PatientTask & { draft?: AgentDraftRecord }> = tasks.map((task) => ({
      ...task,
      source_kind:
        task.source_kind ||
        (task.type === 'approve_followup'
          ? 'followup_agent'
          : task.thread_id || task.draft_id
          ? 'email_agent'
          : 'form_agent'),
      draft: task.draft_id ? state.drafts[task.draft_id] : undefined,
    }));

    const patientRuns = Object.values(state.applicationRuns).filter(
      (run) => run.patient_id === patientId && run.state !== 'stopped' && run.state !== 'failed'
    );
    const activeRunIds = new Set(patientRuns.map((r) => r.id));

    const runInputs = Object.values(state.requiredInputs).filter(
      (input) => input.patient_id === patientId && activeRunIds.has(input.run_id) && input.status !== 'invalidated'
    );

    const mappedInputs: Array<PatientTask & { draft?: AgentDraftRecord }> = runInputs.map((input) => {
      const run = state.applicationRuns[input.run_id];
      const app = run ? state.applications[run.application_id] : undefined;
      const programName = app?.resource.name || 'Remember Betty';
      return {
        id: input.id,
        patient_id: input.patient_id,
        application_id: run?.application_id || '',
        program_name: programName,
        asker: `${programName} · Form Agent`,
        type: input.input_type,
        title: input.prompt,
        why: input.reason,
        shared_with: `${programName} Application Packet`,
        field_key: input.field_key,
        options: input.options,
        status: input.status === 'answered' ? 'answered' : 'open',
        answer:
          input.input_type === 'sensitive_text' && input.status === 'answered'
            ? '••••'
            : input.answer,
        created_at: input.created_at,
        answered_at: input.answered_at,
        run_id: input.run_id,
        required_input_id: input.id,
        source_kind: 'form_agent',
      };
    });

    return [...enrichedTasks, ...mappedInputs].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  },

  saveDraft(draft: AgentDraftRecord): AgentDraftRecord {
    const state = loadState();
    state.drafts[draft.draft_id] = draft;
    persist(state);
    return draft;
  },

  getDraft(draftId: string): AgentDraftRecord | null {
    return loadState().drafts[draftId] || null;
  },

  getDraftsForPatient(patientId: string): AgentDraftRecord[] {
    return Object.values(loadState().drafts)
      .filter((d) => d.patient_id === patientId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  getPendingDraftForThread(threadId: string, patientId?: string): AgentDraftRecord | null {
    return (
      Object.values(loadState().drafts).find(
        (d) =>
          d.thread_id === threadId &&
          d.status === 'pending_consent' &&
          (!patientId || d.patient_id === patientId)
      ) || null
    );
  },

  updateDraft(draftId: string, updates: Partial<AgentDraftRecord>): AgentDraftRecord | null {
    const state = loadState();
    const current = state.drafts[draftId];
    if (!current) return null;
    const updated: AgentDraftRecord = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    state.drafts[draftId] = updated;
    persist(state);
    return updated;
  },

  markDraftSent(draftId: string, sentMessageId: string, threadId?: string): AgentDraftRecord | null {
    const state = loadState();
    const current = state.drafts[draftId];
    if (!current) return null;
    const updated: AgentDraftRecord = {
      ...current,
      status: 'sent',
      sent_message_id: sentMessageId,
      thread_id: threadId || current.thread_id,
      updated_at: new Date().toISOString(),
    };
    state.drafts[draftId] = updated;
    if (current.linked_task_id && state.tasks[current.linked_task_id]) {
      const task = state.tasks[current.linked_task_id];
      if (task.status === 'open') {
        task.status = 'answered';
        task.answer = { consented: true, sent_message_id: sentMessageId };
        task.answered_at = new Date().toISOString();
      }
    }
    persist(state);
    return updated;
  },

  discardDraft(draftId: string): AgentDraftRecord | null {
    const state = loadState();
    const current = state.drafts[draftId];
    if (!current) return null;
    const updated: AgentDraftRecord = {
      ...current,
      status: 'discarded',
      updated_at: new Date().toISOString(),
    };
    state.drafts[draftId] = updated;
    if (current.linked_task_id && state.tasks[current.linked_task_id]) {
      const task = state.tasks[current.linked_task_id];
      if (task.status === 'open') {
        task.status = 'skipped';
        task.skip_reason = 'Draft discarded by patient';
      }
    }
    persist(state);
    return updated;
  },

  getActiveAgentRun(): AgentRun | null {
    return loadState().agentRun;
  },

  getEmails(patientId?: string): EmailRecord[] {
    const emails = Object.values(loadState().emails);
    return emails
      .filter((email) => !patientId || email.patient_id === patientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  getThreads(patientId?: string, filter = 'inbox', searchQuery = '') {
    const state = loadState();
    const grouped = new Map<string, EmailRecord[]>();
    for (const email of this.getEmails(patientId)) {
      grouped.set(email.thread_id, [...(grouped.get(email.thread_id) || []), email]);
    }

    const openTasks = patientId ? this.getOpenTasks(patientId) : [];

    let threads = Array.from(grouped, ([thread_id, messages]) => {
      const sorted = messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const latest = sorted[sorted.length - 1];
      const pendingDraft = Object.values(state.drafts).find(
        (d) =>
          d.thread_id === thread_id &&
          d.status === 'pending_consent' &&
          (!patientId || d.patient_id === patientId)
      );
      const openTask = openTasks.find(
        (t) =>
          t.thread_id === thread_id ||
          (pendingDraft && t.draft_id === pendingDraft.draft_id) ||
          (latest.task_id && t.id === latest.task_id)
      );

      return {
        thread_id,
        latest,
        messages: sorted,
        messageCount: sorted.length,
        unreadCount: sorted.filter((message) => message.unread).length,
        starred: sorted.some((message) => Boolean(message.starred)),
        program_name: latest.program_name,
        subject: latest.subject,
        pendingDraft: pendingDraft || null,
        openTask: openTask || null,
        hasOutbound: sorted.some((message) => message.direction === 'outbound'),
        hasInbound: sorted.some((message) => message.direction === 'inbound'),
        isOutboundOnly: sorted.every((message) => message.direction === 'outbound'),
      };
    }).sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      threads = threads.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.program_name.toLowerCase().includes(q) ||
          t.latest.from.toLowerCase().includes(q) ||
          t.latest.summary.toLowerCase().includes(q) ||
          (t.latest.body_text || '').toLowerCase().includes(q)
      );
    }

    if (filter === 'inbox') {
      return threads.filter((thread) => thread.hasInbound);
    }
    if (filter === 'needs_you') {
      return threads.filter(
        (thread) =>
          thread.latest.classification === 'needs_info' ||
          Boolean(thread.pendingDraft) ||
          Boolean(thread.openTask)
      );
    }
    if (filter === 'waiting') {
      return threads.filter((thread) =>
        ['confirmation', 'pending'].includes(thread.latest.classification)
      );
    }
    if (filter === 'done') {
      return threads.filter((thread) =>
        ['approved', 'benefit_delivered', 'denied'].includes(thread.latest.classification)
      );
    }
    if (filter === 'starred') {
      return threads.filter((thread) => thread.starred);
    }
    if (filter === 'sent') {
      return threads.filter((thread) => thread.hasOutbound);
    }
    if (filter === 'drafts') {
      return threads.filter((thread) => Boolean(thread.pendingDraft));
    }
    if (filter === 'all') {
      return threads;
    }
    return threads.filter((thread) => thread.hasInbound);
  },

  getThread(threadId: string): EmailRecord[] {
    return Object.values(loadState().emails)
      .filter((email) => email.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  saveEmail(
    data: Partial<EmailRecord> & {
      patient_id: string;
      program_name: string;
      subject: string;
    }
  ): EmailRecord {
    const state = loadState();
    const duplicate = data.message_id
      ? Object.values(state.emails).find(
          (email) =>
            email.message_id === data.message_id &&
            (!data.inbox_id || !email.inbox_id || email.inbox_id === data.inbox_id)
        )
      : undefined;
    if (duplicate) return duplicate;

    const id = data.id || `email_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const email: EmailRecord = {
      ...data,
      id,
      patient_id: data.patient_id,
      application_id: data.application_id,
      program_name: data.program_name,
      thread_id:
        data.thread_id ||
        data.message_id ||
        `thread_${data.program_name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      direction: data.direction || 'inbound',
      from: data.from || '',
      to: data.to || '',
      subject: data.subject,
      body_html: data.body_html || '',
      body_text: data.body_text,
      extracted_text: data.extracted_text || data.body_text,
      extracted_html: data.extracted_html || data.body_html,
      classification: data.classification || 'unrelated',
      summary: data.summary || '',
      unread: data.unread ?? true,
      created_at: data.created_at || new Date().toISOString(),
    };
    state.emails[id] = email;
    persist(state);
    return email;
  },

  updateEmailDeliveryStatus(
    messageId: string,
    deliveryStatus: NonNullable<EmailRecord['delivery_status']>
  ): EmailRecord | null {
    const state = loadState();
    const target = Object.values(state.emails).find((e) => e.message_id === messageId);
    if (!target) return null;
    target.delivery_status = deliveryStatus;
    persist(state);
    return target;
  },

  reclassifyEmail(id: string, classification: EmailClassification): EmailRecord | null {
    const state = loadState();
    const email = state.emails[id];
    if (!email) return null;
    email.classification = classification;
    persist(state);
    return email;
  },

  markThreadRead(threadId: string) {
    const state = loadState();
    Object.values(state.emails).forEach((email) => {
      if (email.thread_id === threadId) email.unread = false;
    });
    persist(state);
  },

  setThreadUnread(threadId: string, unread: boolean) {
    const state = loadState();
    const threadMessages = Object.values(state.emails)
      .filter((email) => email.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (threadMessages.length === 0) return;
    if (unread) {
      threadMessages[threadMessages.length - 1].unread = true;
    } else {
      threadMessages.forEach((m) => {
        m.unread = false;
      });
    }
    persist(state);
  },

  toggleThreadStar(threadId: string): boolean {
    const state = loadState();
    const threadMessages = Object.values(state.emails).filter(
      (email) => email.thread_id === threadId
    );
    if (threadMessages.length === 0) return false;
    const nextStarred = !threadMessages.some((m) => Boolean(m.starred));
    threadMessages.forEach((m) => {
      m.starred = nextStarred;
    });
    persist(state);
    return nextStarred;
  },

  getFollowUp(applicationId: string): FollowUpConfig | null {
    return loadState().followups[applicationId] || null;
  },

  updateFollowUp(applicationId: string, updates: Partial<FollowUpConfig>): FollowUpConfig | null {
    const state = loadState();
    const current = state.followups[applicationId];
    if (!current) return null;
    const updated = { ...current, ...updates };
    state.followups[applicationId] = updated;
    persist(state);
    return updated;
  },

  getApplicationRun(id: string): ApplicationRun | null {
    return loadState().applicationRuns[id] || null;
  },

  getApplicationRunsForPatient(patientId: string): ApplicationRun[] {
    return Object.values(loadState().applicationRuns)
      .filter((run) => run.patient_id === patientId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  getStartedGrantsSummary(patientId: string): StartedGrantSummary[] {
    const state = loadState();
    const patient = state.patients[patientId] || null;
    const catalog = getResourceCatalog(patient);
    const patientRuns = Object.values(state.applicationRuns)
      .filter((run) => run.patient_id === patientId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    const latestRunByAppId = new Map<string, ApplicationRun>();
    for (const run of patientRuns) {
      if (!latestRunByAppId.has(run.application_id)) {
        latestRunByAppId.set(run.application_id, run);
      }
    }

    const appMap = new Map<string, ApplicationRecord>();
    for (const app of Object.values(state.applications)) {
      if (app.patient_id === patientId) {
        appMap.set(app.id, app);
      }
    }

    // Reconstruct any ApplicationRecord that has an ApplicationRun but wasn't persisted yet
    for (const [appId, run] of latestRunByAppId.entries()) {
      if (!appMap.has(appId)) {
        const matchedResource =
          catalog.find((r) => appId === `app_${r.id}_${patientId}` || appId.includes(r.id)) ||
          catalog[0];
        if (matchedResource) {
          appMap.set(appId, {
            id: appId,
            patient_id: patientId,
            resource_id: matchedResource.id,
            resource: matchedResource,
            state:
              run.state === 'waiting_for_patient'
                ? 'NeedsPatientInput'
                : run.state === 'awaiting_patient_review'
                  ? 'AwaitingPatientApproval'
                  : run.state === 'packet_ready'
                    ? 'PacketReady'
                    : 'Drafting',
            created_at: run.created_at,
            updated_at: run.updated_at,
          });
        }
      }
    }

    const unifiedItems = this.getUnifiedPendingItems(patientId);

    const summaries: StartedGrantSummary[] = [];
    for (const app of appMap.values()) {
      const latestRun = latestRunByAppId.get(app.id) || null;
      const hasStarted = Boolean(latestRun) || app.state !== 'Matched';
      if (!hasStarted) continue;

      const grantItems = unifiedItems.filter(
        (item) =>
          item.application_id === app.id ||
          (latestRun && item.run_id === latestRun.id) ||
          item.program_name.toLowerCase() === app.resource.name.toLowerCase()
      );

      const openItems = grantItems.filter((item) => item.status === 'open');
      const answeredItems = grantItems.filter((item) => item.status === 'answered');

      summaries.push({
        application: app,
        latestRun,
        pendingQuestionsCount: openItems.length,
        answeredQuestionsCount: answeredItems.length,
        totalQuestionsCount: grantItems.length,
        pendingQuestions: openItems.map((item) => ({
          id: item.id,
          title: item.title,
          why: item.why,
          type: item.type,
          options: item.options,
          run_id: item.run_id,
          required_input_id: item.required_input_id,
          source_kind: item.source_kind,
        })),
      });
    }

    return summaries.sort((a, b) => {
      const aTime = a.latestRun?.updated_at || a.application.updated_at;
      const bTime = b.latestRun?.updated_at || b.application.updated_at;
      return bTime.localeCompare(aTime);
    });
  },

  getActiveApplicationRun(applicationId: string, patientId: string): ApplicationRun | null {
    return (
      Object.values(loadState().applicationRuns).find(
        (run) =>
          run.application_id === applicationId &&
          run.patient_id === patientId &&
          ![
            'packet_ready',
            'test_email_sent',
            'needs_manual_review',
            'failed',
            'stopped',
          ].includes(run.state)
      ) || null
    );
  },

  createApplicationRun(run: ApplicationRun): ApplicationRun {
    const state = loadState();
    state.applicationRuns[run.id] = run;
    state.runEvents[run.id] ||= [];
    persist(state);
    return run;
  },

  transitionApplicationRun(
    id: string,
    expectedPhase: RunPhase,
    nextPhase: RunPhase,
    updates: Partial<ApplicationRun> = {}
  ): ApplicationRun | null {
    const state = loadState();
    const run = state.applicationRuns[id];
    if (!run || run.current_phase !== expectedPhase) return null;
    assertTransition(expectedPhase, nextPhase);
    const nextState = stateForPhase(nextPhase);
    const updated: ApplicationRun = {
      ...run,
      ...updates,
      current_phase: nextPhase,
      state: nextState,
      updated_at: new Date().toISOString(),
    };
    state.applicationRuns[id] = updated;
    const parentApp = state.applications[run.application_id];
    if (parentApp) {
      if (nextState === 'waiting_for_patient') {
        parentApp.state = 'NeedsPatientInput';
      } else if (nextState === 'awaiting_patient_review') {
        parentApp.state = 'AwaitingPatientApproval';
      } else if (nextState === 'packet_ready') {
        parentApp.state = 'PacketReady';
      } else if (nextState === 'active' && parentApp.state === 'Matched') {
        parentApp.state = 'Drafting';
      }
      parentApp.updated_at = updated.updated_at;
    }
    persist(state);
    return updated;
  },

  updateApplicationRun(id: string, updates: Partial<ApplicationRun>): ApplicationRun | null {
    const state = loadState();
    const run = state.applicationRuns[id];
    if (!run) return null;
    const updated = { ...run, ...updates, updated_at: new Date().toISOString() };
    state.applicationRuns[id] = updated;
    persist(state);
    return updated;
  },

  addRunEvent(data: Omit<RunEvent, 'id' | 'sequence' | 'created_at'>): RunEvent {
    const state = loadState();
    const events = state.runEvents[data.run_id] || [];
    const sequence = (events.at(-1)?.sequence || 0) + 1;
    const event: RunEvent = {
      ...data,
      id: `run_evt_${Date.now()}_${sequence}`,
      sequence,
      created_at: new Date().toISOString(),
    };
    state.runEvents[data.run_id] = [...events, event];
    persist(state);
    return event;
  },

  getRunEvents(runId: string, after = 0): RunEvent[] {
    return (loadState().runEvents[runId] || []).filter((event) => event.sequence > after);
  },

  saveRequiredInput(input: RequiredInput): RequiredInput {
    const state = loadState();
    const existing = Object.values(state.requiredInputs).find(
      (item) =>
        item.run_id === input.run_id &&
        item.field_key === input.field_key &&
        item.status !== 'invalidated'
    );
    if (existing) return existing;
    state.requiredInputs[input.id] = input;
    persist(state);
    return input;
  },

  getRequiredInputs(runId: string): RequiredInput[] {
    return Object.values(loadState().requiredInputs).filter((input) => input.run_id === runId);
  },

  answerRequiredInput(id: string, answer: unknown): RequiredInput | null {
    const state = loadState();
    const input = state.requiredInputs[id];
    if (!input || input.status !== 'open') return null;
    const updated: RequiredInput = {
      ...input,
      answer,
      status: 'answered',
      answered_at: new Date().toISOString(),
    };
    state.requiredInputs[id] = updated;
    persist(state);
    return updated;
  },

  saveApplicationArtifact(artifact: ApplicationArtifact): ApplicationArtifact {
    const state = loadState();
    state.applicationArtifacts[artifact.id] = artifact;
    persist(state);
    return artifact;
  },

  getApplicationArtifact(id: string): ApplicationArtifact | null {
    return loadState().applicationArtifacts[id] || null;
  },
};
