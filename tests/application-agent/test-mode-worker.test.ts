import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-test-mode-worker-'));
process.env.APOVO_DATA_DIR = path.join(testDataDir, 'data');
process.env.APOVO_ARTIFACT_DIR = path.join(testDataDir, 'artifacts');
process.env.APOVO_APPLICATION_TEST_MODE = '1';

const fixture = new Uint8Array(
  fs.readFileSync(path.resolve(__dirname, '../../../tests/fixtures/remember-betty/current-application.pdf'))
);

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('runs from inspected PDF to one synthetic test delivery without patient input', async () => {
  const { ApovoStore } = await import('../../src/lib/store');
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const { RunWorker } = await import('../../src/lib/application-agent/worker');
  const { pdfPhaseHandlers } = await import('../../src/lib/application-agent/phases/pdf-handlers');
  const { createTestModePhaseHandlers } = await import(
    '../../src/lib/application-agent/phases/test-mode-handlers'
  );
  const { localArtifactStore } = await import('../../src/lib/artifacts/local-artifact-store');

  const patient = ApovoStore.createPatient({
    first_name: 'REALPATIENTSECRET',
    last_name: 'DO-NOT-USE',
    diagnosis: 'REALDIAGNOSISSECRET',
    status: 'active',
  });
  const run = RunRepository.createOrGet('app_remember-betty_test', patient.id, undefined, {
    deliveryMode: 'test_email',
    testRecipient: 'nicole.wu.mail@gmail.com',
    syntheticFixtureVersion: 'remember-betty-synthetic-v1',
  });
  const source = localArtifactStore.savePdf({
    runId: run.id,
    patientId: patient.id,
    kind: 'source_pdf',
    bytes: fixture,
    pageCount: 3,
  });
  RunRepository.saveArtifact(source);
  RunRepository.update(run.id, { source_pdf_artifact_id: source.id });
  RunRepository.transition(run.id, 'created', 'launching_browser');
  RunRepository.transition(run.id, 'launching_browser', 'inspecting_site');
  RunRepository.transition(run.id, 'inspecting_site', 'downloading_pdf');
  RunRepository.transition(run.id, 'downloading_pdf', 'inspecting_pdf');

  let deliveries = 0;
  const handlers = {
    ...pdfPhaseHandlers,
    ...createTestModePhaseHandlers({
      inboxId: () => 'sender@agentmail.to',
      deliver: async (input) => {
        deliveries += 1;
        assert.equal(input.run.test_recipient, 'nicole.wu.mail@gmail.com');
        assert.ok(input.packetBytes.byteLength > 0);
        return {
          recipient: 'nicole.wu.mail@gmail.com',
          draftId: 'draft_test',
          messageId: 'message_test',
          threadId: 'thread_test',
          sentAt: '2026-10-28T01:00:00.000Z',
        };
      },
    }),
  };
  const result = await new RunWorker(handlers).start(run.id);

  assert.equal(result.current_phase, 'test_email_sent');
  assert.equal(deliveries, 1);
  assert.equal(RunRepository.inputs(run.id).length, 0);
  assert.ok(result.test_packet_artifact_id);

  const packetArtifact = RunRepository.artifact(result.test_packet_artifact_id!);
  assert.ok(packetArtifact);
  const packetBytes = localArtifactStore.readPdf(packetArtifact!, {
    runId: run.id,
    patientId: patient.id,
  });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: Uint8Array.from(packetBytes) }).promise;
  const textParts: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    textParts.push(content.items.map((item: { str: string }) => item.str).join(' '));
  }
  const text = textParts.join('\n');
  assert.match(text, /Ava Testperson/);
  assert.doesNotMatch(text, /REALPATIENTSECRET|REALDIAGNOSISSECRET|DO-NOT-USE/);
});
