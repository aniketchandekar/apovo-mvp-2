import type { ApplicationRun } from './application-agent/types';

export interface PatientProfile {
  id: string;
  // Step 1: About you
  first_name: string;
  last_name: string;
  preferred_name?: string;
  dob: string;
  phone: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  personal_email?: string;

  // Step 2: Your care
  diagnosis: string;
  stage: string;
  treatment_status: string;
  treatment_types: string[];
  oncologist_name?: string;
  clinic_name?: string;
  insurance: string;

  // Step 3: What would help
  needs: string[];
  household_size: number;
  monthly_income_band: string;
  employment_status: string;

  // Step 4: Consent
  consent_at?: string;
  consent_version?: string;
  consent_signature?: string;

  // Step 5: Care Inbox & status
  care_email?: string;
  agentmail_inbox_id?: string;
  status: 'onboarding' | 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ResourceProgram {
  id: string;
  name: string;
  category: 'Financial' | 'Transport' | 'Cleaning' | 'Wellness' | 'Lodging';
  est_value: string;
  description: string;
  url: string;
  type: 'pdf' | 'web';
  badge?: string;
  turnaround?: string;
  eligibility: EligibilityAssessment;
  award_chance: AwardChanceEstimate;
  requirements: string[];
  source_note: string;
}

export type EligibilityStatus = 'eligible' | 'not_eligible' | 'needs_information';

export interface EligibilityCheck {
  key:
    | 'breast_cancer'
    | 'financial_need'
    | 'cancer_diagnosis'
    | 'copay_need'
    | 'active_care'
    | 'transit_need'
    | 'cancer_treatment'
    | 'home_support_need'
    | 'wellness_need'
    | string;
  label: string;
  result: 'met' | 'not_met' | 'unknown';
  explanation: string;
}

export interface EligibilityAssessment {
  status: EligibilityStatus;
  formula: string;
  checks: EligibilityCheck[];
  explanation: string;
}

export interface AwardChanceEstimate {
  estimate_percent: number;
  minimum_percent: number;
  maximum_percent: number;
  average_monthly_applications: number;
  monthly_recipients_minimum: number;
  monthly_recipients_maximum: number;
  formula: string;
  explanation: string;
}

export type ApplicationState =
  | 'Matched'
  | 'Drafting'
  | 'NeedsPatientInput'
  | 'AwaitingPatientApproval'
  | 'Submitted'
  | 'AwaitingResponse'
  | 'FollowUpSent'
  | 'Approved'
  | 'BenefitReceived'
  | 'Denied'
  | 'PacketReady';

export interface ApplicationRecord {
  id: string;
  patient_id: string;
  resource_id: string;
  resource: ResourceProgram;
  state: ApplicationState;
  created_at: string;
  updated_at: string;
  next_action_at?: string;
  benefit_value?: number;
  browserbase_session_id?: string;
  live_url?: string;
  replay_url?: string;
  narration_lines?: string[];
  field_map?: Array<{
    key: string;
    label: string;
    status: 'filled' | 'filling' | 'needs_input' | 'sensitive_skipped' | 'not_applicable';
    value_masked?: string;
    source?: string;
  }>;
}

export type EmailClassification =
  | 'confirmation'
  | 'needs_info'
  | 'pending'
  | 'approved'
  | 'denied'
  | 'benefit_delivered'
  | 'unrelated';

export interface EmailRecord {
  id: string;
  patient_id: string;
  application_id?: string;
  program_name: string;
  thread_id: string;
  inbox_id?: string;
  in_reply_to?: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  subject: string;
  body_html: string;
  body_text?: string;
  extracted_text?: string;
  extracted_html?: string;
  classification: EmailClassification;
  summary: string;
  deadline?: string;
  actions_taken?: string[];
  task_id?: string;
  draft_id?: string;
  labels?: string[];
  starred?: boolean;
  delivery_status?: 'received' | 'sent' | 'delivered' | 'bounced' | 'rejected';
  unread: boolean;
  created_at: string;
  message_id?: string;
  ladder_step?: number;
}

export interface AgentDraftRecord {
  draft_id: string;
  inbox_id: string;
  thread_id?: string;
  in_reply_to?: string;
  patient_id: string;
  application_id?: string;
  program_name: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  kind: 'reply_consent' | 'followup_status';
  reason: string;
  linked_task_id?: string;
  status: 'pending_consent' | 'sent' | 'discarded';
  sent_message_id?: string;
  created_at: string;
  updated_at: string;
}

export interface FollowUpLadderStep {
  step: number;
  day: number;
  label: string;
  status: 'completed' | 'active' | 'pending';
  sent_at?: string;
}

export interface FollowUpConfig {
  application_id: string;
  program_name: string;
  next_followup_date: string;
  next_followup_label: string;
  current_step: number;
  status: 'scheduled' | 'paused' | 'completed';
  ladder: FollowUpLadderStep[];
  draft_subject: string;
  draft_body: string;
  draft_recipient: string;
}

export interface CareEvent {
  id: string;
  patient_id: string;
  application_id?: string;
  type:
    | 'consent_signed'
    | 'inbox_created'
    | 'application_matched'
    | 'form_agent_started'
    | 'task_created'
    | 'task_answered'
    | 'task_consumed'
    | 'task_skipped'
    | 'patient_approved'
    | 'application_submitted'
    | 'email_received'
    | 'email_classified'
    | 'followup_sent'
    | 'benefit_received'
    | 'benefit_approved'
    | 'call_needed'
    | 'reclassified';
  agent?: 'form' | 'inbox' | 'followup' | 'patient';
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export type PatientTaskType =
  | 'text'
  | 'choice'
  | 'date'
  | 'sensitive_text'
  | 'personal_note'
  | 'file'
  | 'signature'
  | 'approve_submit'
  | 'takeover'
  | 'confirm_benefit'
  | 'consent_reply'
  | 'approve_followup';

export interface PatientTask {
  id: string;
  patient_id: string;
  application_id: string;
  program_name: string;
  asker?: string;
  type: PatientTaskType;
  title: string;
  why: string;
  shared_with: string;
  field_key?: string;
  options?: string[];
  status: 'open' | 'answered' | 'skipped';
  answer?: unknown;
  created_at: string;
  answered_at?: string;
  consumed_at?: string;
  skip_reason?: string;
  batch_id?: string;
  step?: number;
  total_steps?: number;
  thread_id?: string;
  message_id?: string;
  draft_id?: string;
  deadline?: string;
  run_id?: string;
  required_input_id?: string;
  source_kind?: 'email_agent' | 'followup_agent' | 'form_agent';
}

export interface AgentRun {
  id: string;
  agent: 'form' | 'inbox' | 'followup';
  application_id?: string;
  application_name: string;
  message: string;
  progress?: {
    filled: number;
    total: number;
  };
  status: 'active' | 'idle' | 'completed';
  started_at: string;
  updated_at: string;
}

export interface StartedGrantSummary {
  application: ApplicationRecord;
  latestRun: ApplicationRun | null;
  pendingQuestionsCount: number;
  answeredQuestionsCount: number;
  totalQuestionsCount: number;
  pendingQuestions: Array<{
    id: string;
    title: string;
    why: string;
    type: PatientTaskType;
    options?: string[];
    run_id?: string;
    required_input_id?: string;
    source_kind?: 'email_agent' | 'followup_agent' | 'form_agent';
  }>;
}
