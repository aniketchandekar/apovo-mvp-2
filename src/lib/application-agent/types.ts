export type RunPhase =
  | 'created'
  | 'launching_browser'
  | 'inspecting_site'
  | 'downloading_pdf'
  | 'inspecting_pdf'
  | 'loading_synthetic_test_data'
  | 'filling_test_pdf'
  | 'generating_test_documents'
  | 'assembling_test_packet'
  | 'sending_test_email'
  | 'test_email_sent'
  | 'test_email_delivery_uncertain'
  | 'provisioning_care_email'
  | 'mapping_fields'
  | 'waiting_for_patient'
  | 'filling_pdf'
  | 'assembling_packet'
  | 'awaiting_patient_review'
  | 'applying_patient_signature'
  | 'packet_ready'
  | 'needs_manual_review'
  | 'failed'
  | 'stopped';

export type RunState =
  | 'active'
  | 'waiting_for_patient'
  | 'awaiting_patient_review'
  | 'packet_ready'
  | 'test_email_sent'
  | 'needs_manual_review'
  | 'failed'
  | 'stopped';

export type RunEventKind =
  | 'status'
  | 'action'
  | 'question'
  | 'warning'
  | 'error'
  | 'complete';

export type ArtifactKind =
  | 'source_pdf'
  | 'diagnosis_letter'
  | 'personal_note'
  | 'draft_pdf'
  | 'unsigned_packet'
  | 'final_packet'
  | 'synthetic_test_packet';

export type DeliveryMode = 'prepare_only' | 'test_email';

export type RequiredInputType =
  | 'text'
  | 'date'
  | 'choice'
  | 'sensitive_text'
  | 'file'
  | 'personal_note'
  | 'signature';

export interface ApplicationRun {
  id: string;
  application_id: string;
  patient_id: string;
  state: RunState;
  current_phase: RunPhase;
  browserbase_session_id?: string;
  live_view_url?: string;
  source_url: string;
  discovered_application_url?: string;
  source_pdf_artifact_id?: string;
  draft_pdf_artifact_id?: string;
  unsigned_packet_artifact_id?: string;
  final_packet_artifact_id?: string;
  test_packet_artifact_id?: string;
  test_diagnosis_artifact_id?: string;
  test_personal_note_artifact_id?: string;
  delivery_mode?: DeliveryMode;
  test_recipient?: string;
  synthetic_fixture_version?: string;
  agentmail_draft_id?: string;
  agentmail_message_id?: string;
  agentmail_thread_id?: string;
  delivery_attempted_at?: string;
  test_email_sent_at?: string;
  error_code?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface RunEvent {
  id: string;
  run_id: string;
  sequence: number;
  kind: RunEventKind;
  public_message: string;
  created_at: string;
}

export interface ApplicationArtifact {
  id: string;
  run_id: string;
  patient_id: string;
  kind: ArtifactKind;
  private_path: string;
  mime_type: 'application/pdf';
  sha256: string;
  byte_size: number;
  page_count: number;
  created_at: string;
}

export interface RequiredInput {
  id: string;
  run_id: string;
  patient_id: string;
  field_key: string;
  input_type: RequiredInputType;
  prompt: string;
  reason: string;
  options?: string[];
  status: 'open' | 'answered' | 'invalidated';
  answer?: unknown;
  created_at: string;
  answered_at?: string;
}

export interface PublicRunError {
  code: RunErrorCode;
  message: string;
  retryable: boolean;
}

export type RunErrorCode =
  | 'CONFIGURATION_MISSING'
  | 'APPLICATION_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'RUN_NOT_OWNED'
  | 'INVALID_TRANSITION'
  | 'BROWSER_LAUNCH_FAILED'
  | 'APPLICATION_LINK_NOT_FOUND'
  | 'APPLICATION_LINK_REJECTED'
  | 'DOWNLOAD_NOT_FOUND'
  | 'DOWNLOAD_AMBIGUOUS'
  | 'DOWNLOAD_INVALID'
  | 'DOWNLOAD_TIMEOUT'
  | 'PDF_VERSION_UNKNOWN'
  | 'PDF_INVALID'
  | 'INPUT_REQUIRED'
  | 'INPUT_INVALID'
  | 'ARTIFACT_NOT_FOUND'
  | 'PACKET_INCOMPLETE'
  | 'PACKET_PAGE_LIMIT'
  | 'REVIEW_INVALIDATED'
  | 'TEST_MODE_UNAVAILABLE'
  | 'TEST_DELIVERY_FAILED'
  | 'TEST_DELIVERY_UNCERTAIN'
  | 'INTERNAL_ERROR';
