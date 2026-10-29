import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-started-grants-'));
process.env.APOVO_DATA_DIR = testDataDir;

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('tracks started grants and counts pending questions per card', async () => {
  const { ApovoStore } = await import('../../src/lib/store');
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const { getResourceCatalog } = await import('../../src/lib/resource-catalog');

  const patient = ApovoStore.setPatientPreset('jane-doe');

  // Initially, matched program has no run started and state is 'Matched'
  const initialStarted = ApovoStore.getStartedGrantsSummary(patient.id);
  assert.equal(initialStarted.length, 0);

  // Start applying with Apovo on Remember Betty
  const bettyAppId = `app_remember-betty_${patient.id}`;
  ApovoStore.updateApplication(bettyAppId, { state: 'Drafting' });
  const bettyRun = RunRepository.createOrGet(bettyAppId, patient.id);

  const now = new Date().toISOString();
  RunRepository.saveInput({
    id: `input_${bettyRun.id}_monthly_income`,
    run_id: bettyRun.id,
    patient_id: patient.id,
    field_key: 'monthly_income',
    input_type: 'text',
    prompt: 'What is your current average household monthly income?',
    reason: 'The foundation needs a current monthly dollar amount.',
    status: 'open',
    created_at: now,
  });
  RunRepository.saveInput({
    id: `input_${bettyRun.id}_actively_employed`,
    run_id: bettyRun.id,
    patient_id: patient.id,
    field_key: 'actively_employed',
    input_type: 'choice',
    options: ['Yes', 'No'],
    prompt: 'Are you currently actively employed?',
    reason: 'Employment status must be confirmed.',
    status: 'open',
    created_at: now,
  });

  // Also start a second grant from catalog (Pink Aid)
  const catalog = getResourceCatalog(patient);
  const pinkAidResource = catalog.find((r) => r.id === 'pink-aid-emergency')!;
  const pinkAidAppId = `app_${pinkAidResource.id}_${patient.id}`;
  ApovoStore.upsertApplication({
    id: pinkAidAppId,
    patient_id: patient.id,
    resource_id: pinkAidResource.id,
    resource: pinkAidResource,
    state: 'Drafting',
    created_at: now,
    updated_at: now,
  });
  RunRepository.createOrGet(pinkAidAppId, patient.id, pinkAidResource.url);
  ApovoStore.createTask({
    patient_id: patient.id,
    application_id: pinkAidAppId,
    program_name: pinkAidResource.name,
    title: 'Confirm household utility bill amount',
    why: 'Needed for Pink Aid emergency relief calculation.',
    type: 'text',
  });

  // Verify both started grants appear and matchInitialPrograms does not wipe Pink Aid
  ApovoStore.matchInitialPrograms(patient.id);
  const started = ApovoStore.getStartedGrantsSummary(patient.id);
  assert.equal(started.length, 2);

  const bettySummary = started.find((s) => s.application.id === bettyAppId)!;
  assert.ok(bettySummary);
  assert.equal(bettySummary.pendingQuestionsCount, 2);
  assert.equal(bettySummary.answeredQuestionsCount, 0);
  assert.equal(bettySummary.totalQuestionsCount, 2);

  const pinkSummary = started.find((s) => s.application.id === pinkAidAppId)!;
  assert.ok(pinkSummary);
  assert.equal(pinkSummary.pendingQuestionsCount, 1);

  // Answer one question on Remember Betty and verify pendingQuestionsCount decrements to 1
  RunRepository.answerInput(`input_${bettyRun.id}_monthly_income`, '$3,200');
  const updatedStarted = ApovoStore.getStartedGrantsSummary(patient.id);
  const updatedBetty = updatedStarted.find((s) => s.application.id === bettyAppId)!;
  assert.equal(updatedBetty.pendingQuestionsCount, 1);
  assert.equal(updatedBetty.answeredQuestionsCount, 1);
  assert.equal(updatedBetty.totalQuestionsCount, 2);
});
