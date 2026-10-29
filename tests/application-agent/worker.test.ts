import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-worker-'));
process.env.APOVO_DATA_DIR = testDataDir;

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('advances deterministic phases and pauses for the patient', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const { RunWorker } = await import('../../src/lib/application-agent/worker');
  const run = RunRepository.createOrGet('application_worker_1', 'patient_1');
  const worker = new RunWorker({
    created: async () => ({ nextPhase: 'launching_browser' }),
    launching_browser: async () => ({ nextPhase: 'inspecting_site' }),
    inspecting_site: async () => ({
      nextPhase: 'needs_manual_review',
      event: { kind: 'warning', message: 'The form needs review.' },
    }),
  });

  const result = await worker.start(run.id);

  assert.equal(result.current_phase, 'needs_manual_review');
  assert.equal(worker.isActive(run.id), false);
  assert.equal(RunRepository.events(run.id)[0]?.public_message, 'The form needs review.');
});

test('deduplicates concurrent starts', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const { RunWorker } = await import('../../src/lib/application-agent/worker');
  const run = RunRepository.createOrGet('application_worker_2', 'patient_1');
  let calls = 0;
  const worker = new RunWorker({
    created: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { nextPhase: 'launching_browser' };
    },
  });

  const [first, second] = await Promise.all([worker.start(run.id), worker.start(run.id)]);

  assert.equal(first.id, second.id);
  assert.equal(calls, 1);
  assert.equal(first.current_phase, 'launching_browser');
});

test('stops a paused run and prevents further work', async () => {
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const { RunWorker } = await import('../../src/lib/application-agent/worker');
  const run = RunRepository.createOrGet('application_worker_3', 'patient_1');
  RunRepository.transition(run.id, 'created', 'launching_browser');
  RunRepository.transition(run.id, 'launching_browser', 'inspecting_site');
  RunRepository.transition(run.id, 'inspecting_site', 'needs_manual_review');
  const worker = new RunWorker();

  const stopped = await worker.stop(run.id);
  const afterStart = await worker.start(run.id);

  assert.equal(stopped.current_phase, 'stopped');
  assert.equal(afterStart.current_phase, 'stopped');
});
