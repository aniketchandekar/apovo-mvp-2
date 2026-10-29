import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTransition,
  canTransition,
  isTerminalPhase,
  stateForPhase,
} from '../../src/lib/application-agent/state-machine';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';

test('allows the primary application-packet path', () => {
  const path = [
    'created',
    'launching_browser',
    'inspecting_site',
    'downloading_pdf',
    'inspecting_pdf',
    'mapping_fields',
    'waiting_for_patient',
    'filling_pdf',
    'assembling_packet',
    'awaiting_patient_review',
    'applying_patient_signature',
    'packet_ready',
  ] as const;

  for (let index = 0; index < path.length - 1; index += 1) {
    assert.equal(canTransition(path[index], path[index + 1]), true);
  }
});

test('refuses skipped and post-terminal transitions', () => {
  assert.equal(canTransition('created', 'packet_ready'), false);
  assert.equal(canTransition('packet_ready', 'launching_browser'), false);
  assert.equal(canTransition('stopped', 'launching_browser'), false);
  assert.equal(canTransition('failed', 'launching_browser'), false);
  assert.equal(canTransition('test_email_sent', 'sending_test_email'), false);
});

test('allows the synthetic test path without patient phases', () => {
  const path = [
    'inspecting_pdf',
    'loading_synthetic_test_data',
    'filling_test_pdf',
    'generating_test_documents',
    'assembling_test_packet',
    'sending_test_email',
    'test_email_sent',
  ] as const;
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.equal(canTransition(path[index], path[index + 1]), true);
  }
  assert.equal(stateForPhase('test_email_sent'), 'test_email_sent');
  assert.equal(stateForPhase('test_email_delivery_uncertain'), 'needs_manual_review');
});

test('throws a safe typed error for invalid transitions', () => {
  assert.throws(
    () => assertTransition('created', 'submitted' as never),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'INVALID_TRANSITION'
  );
});

test('maps phases to public run states', () => {
  assert.equal(stateForPhase('inspecting_site'), 'active');
  assert.equal(stateForPhase('waiting_for_patient'), 'waiting_for_patient');
  assert.equal(stateForPhase('awaiting_patient_review'), 'awaiting_patient_review');
  assert.equal(stateForPhase('packet_ready'), 'packet_ready');
  assert.equal(isTerminalPhase('packet_ready'), true);
  assert.equal(isTerminalPhase('needs_manual_review'), false);
});
