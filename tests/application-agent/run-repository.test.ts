import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-run-repository-'));
process.env.APOVO_DATA_DIR = testDataDir;

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('persists one active run and ordered events', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const first = RunRepository.createOrGet('application_1', 'patient_1');
  const second = RunRepository.createOrGet('application_1', 'patient_1');

  assert.equal(second.id, first.id);

  RunRepository.appendEvent(first.id, 'status', 'Created the application run.');
  RunRepository.appendEvent(first.id, 'action', 'Opening the official application page.');

  assert.deepEqual(
    RunRepository.events(first.id).map((event) => event.sequence),
    [1, 2]
  );
  assert.deepEqual(
    RunRepository.events(first.id, 1).map((event) => event.sequence),
    [2]
  );
});

test('compare-and-set transition prevents duplicate phase advancement', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const run = RunRepository.createOrGet('application_2', 'patient_1');

  const advanced = RunRepository.transition(run.id, 'created', 'launching_browser');
  const duplicate = RunRepository.transition(run.id, 'created', 'launching_browser');

  assert.equal(advanced?.current_phase, 'launching_browser');
  assert.equal(duplicate, null);
});

test('captures immutable delivery mode and rejects active mode changes', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const run = RunRepository.createOrGet('application_mode', 'patient_1', undefined, {
    deliveryMode: 'test_email',
    testRecipient: 'nicole.wu.mail@gmail.com',
    syntheticFixtureVersion: 'remember-betty-synthetic-v1',
  });
  assert.equal(run.delivery_mode, 'test_email');
  assert.equal(run.test_recipient, 'nicole.wu.mail@gmail.com');

  assert.throws(
    () => RunRepository.createOrGet('application_mode', 'patient_1', undefined, {
      deliveryMode: 'prepare_only',
    }),
    /RUN_MODE_CONFLICT/
  );
});

test('creates a fresh run after an unresolved manual-review attempt', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const first = RunRepository.createOrGet('application_retry', 'patient_1');
  RunRepository.transition(first.id, 'created', 'launching_browser');
  RunRepository.transition(first.id, 'launching_browser', 'inspecting_site');
  RunRepository.transition(first.id, 'inspecting_site', 'needs_manual_review');

  const retry = RunRepository.createOrGet('application_retry', 'patient_1');

  assert.notEqual(retry.id, first.id);
  assert.equal(retry.current_phase, 'created');
});

test('deduplicates required inputs by field key', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const run = RunRepository.createOrGet('application_3', 'patient_1');
  const createdAt = new Date().toISOString();
  const first = RunRepository.saveInput({
    id: 'input_1',
    run_id: run.id,
    patient_id: 'patient_1',
    field_key: 'monthly_income',
    input_type: 'text',
    prompt: 'What is your current monthly household income?',
    reason: 'The application asks for current income.',
    status: 'open',
    created_at: createdAt,
  });
  const duplicate = RunRepository.saveInput({ ...first, id: 'input_2' });

  assert.equal(duplicate.id, first.id);
  assert.equal(RunRepository.inputs(run.id).length, 1);
});
