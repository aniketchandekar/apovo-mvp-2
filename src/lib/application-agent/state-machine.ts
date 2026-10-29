import { ApplicationRunError } from './errors';
import type { RunPhase, RunState } from './types';

const TERMINAL_PHASES = new Set<RunPhase>([
  'packet_ready',
  'test_email_sent',
  'failed',
  'stopped',
]);

const ALLOWED_TRANSITIONS: Readonly<Record<RunPhase, readonly RunPhase[]>> = {
  created: ['launching_browser', 'failed', 'stopped'],
  launching_browser: ['inspecting_site', 'failed', 'stopped'],
  inspecting_site: ['downloading_pdf', 'needs_manual_review', 'failed', 'stopped'],
  downloading_pdf: ['inspecting_pdf', 'needs_manual_review', 'failed', 'stopped'],
  inspecting_pdf: [
    'provisioning_care_email',
    'mapping_fields',
    'loading_synthetic_test_data',
    'needs_manual_review',
    'failed',
    'stopped',
  ],
  provisioning_care_email: ['mapping_fields', 'waiting_for_patient', 'failed', 'stopped'],
  mapping_fields: ['waiting_for_patient', 'filling_pdf', 'failed', 'stopped'],
  waiting_for_patient: [
    'provisioning_care_email',
    'mapping_fields',
    'filling_pdf',
    'assembling_packet',
    'failed',
    'stopped',
  ],
  filling_pdf: ['waiting_for_patient', 'assembling_packet', 'failed', 'stopped'],
  assembling_packet: [
    'waiting_for_patient',
    'awaiting_patient_review',
    'failed',
    'stopped',
  ],
  awaiting_patient_review: [
    'assembling_packet',
    'applying_patient_signature',
    'failed',
    'stopped',
  ],
  applying_patient_signature: ['packet_ready', 'awaiting_patient_review', 'failed', 'stopped'],
  loading_synthetic_test_data: ['filling_test_pdf', 'failed', 'stopped'],
  filling_test_pdf: ['generating_test_documents', 'failed', 'stopped'],
  generating_test_documents: ['assembling_test_packet', 'failed', 'stopped'],
  assembling_test_packet: ['sending_test_email', 'failed', 'stopped'],
  sending_test_email: [
    'test_email_sent',
    'test_email_delivery_uncertain',
    'failed',
    'stopped',
  ],
  test_email_sent: [],
  test_email_delivery_uncertain: ['failed', 'stopped'],
  packet_ready: [],
  needs_manual_review: ['inspecting_pdf', 'failed', 'stopped'],
  failed: [],
  stopped: [],
};

export function isTerminalPhase(phase: RunPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

export function canTransition(from: RunPhase, to: RunPhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RunPhase, to: RunPhase): void {
  if (!canTransition(from, to)) {
    throw new ApplicationRunError(
      'INVALID_TRANSITION',
      `Application run cannot move from ${from} to ${to}.`
    );
  }
}

export function stateForPhase(phase: RunPhase): RunState {
  if (phase === 'waiting_for_patient') return 'waiting_for_patient';
  if (phase === 'awaiting_patient_review' || phase === 'applying_patient_signature') {
    return 'awaiting_patient_review';
  }
  if (phase === 'packet_ready') return 'packet_ready';
  if (phase === 'test_email_sent') return 'test_email_sent';
  if (phase === 'needs_manual_review' || phase === 'test_email_delivery_uncertain') {
    return 'needs_manual_review';
  }
  if (phase === 'failed') return 'failed';
  if (phase === 'stopped') return 'stopped';
  return 'active';
}
