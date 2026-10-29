import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-pdf-pipeline-'));
process.env.APOVO_DATA_DIR = path.join(testDataDir, 'data');
process.env.APOVO_ARTIFACT_DIR = path.join(testDataDir, 'artifacts');

const fixture = new Uint8Array(
  fs.readFileSync(path.resolve(__dirname, '../../../tests/fixtures/remember-betty/current-application.pdf'))
);

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('runs from downloaded PDF to a reviewable packet with patient answers', async () => {
  const { ApovoStore } = await import('../../src/lib/store');
  const { RunRepository } = await import('../../src/lib/application-agent/run-repository');
  const { RunWorker } = await import('../../src/lib/application-agent/worker');
  const { pdfPhaseHandlers } = await import('../../src/lib/application-agent/phases/pdf-handlers');
  const { localArtifactStore } = await import('../../src/lib/artifacts/local-artifact-store');

  const patient = ApovoStore.createPatient({
    first_name: 'Elena',
    last_name: 'Morales',
    dob: '1980-04-12',
    address_street: '100 Test St',
    address_city: 'Austin',
    address_state: 'TX',
    address_zip: '78701',
    diagnosis: 'Breast cancer',
    stage: 'II',
    care_email: 'elena.morales@agentmail.to',
    agentmail_inbox_id: 'elena.morales@agentmail.to',
  });
  const run = RunRepository.createOrGet('application_pipeline', patient.id);
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

  const worker = new RunWorker(pdfPhaseHandlers);
  const waiting = await worker.start(run.id);
  assert.equal(waiting.current_phase, 'waiting_for_patient');

  const inputs = RunRepository.inputs(run.id);
  assert.equal(inputs.length, 8);
  const letterDocument = await PDFDocument.create();
  letterDocument.addPage([612, 792]);
  const letter = localArtifactStore.savePdf({
    runId: run.id,
    patientId: patient.id,
    kind: 'diagnosis_letter',
    bytes: await letterDocument.save(),
    pageCount: 1,
  });
  RunRepository.saveArtifact(letter);

  const answers: Record<string, unknown> = {
    ssn_last4: '1234',
    monthly_income: '$1,800',
    actively_employed: 'No',
    active_treatment: 'Yes',
    diagnosis_date: '2025-11-03',
    social_worker_details: 'None',
    diagnosis_letter: { artifactId: letter.id },
    personal_note: 'Breast cancer changed my life and my ability to work.',
  };
  for (const input of inputs) {
    assert.ok(RunRepository.answerInput(input.id, answers[input.field_key]));
  }

  RunRepository.transition(run.id, 'waiting_for_patient', 'filling_pdf');
  const review = await worker.start(run.id);
  assert.equal(review.current_phase, 'awaiting_patient_review');
  assert.ok(review.unsigned_packet_artifact_id);

  const packetArtifact = RunRepository.artifact(review.unsigned_packet_artifact_id!);
  assert.ok(packetArtifact);
  assert.equal(packetArtifact!.page_count, 5);

  const packetBytes = localArtifactStore.readPdf(packetArtifact!, {
    runId: run.id,
    patientId: patient.id,
  });
  const packet = await PDFDocument.load(packetBytes);
  assert.equal(packet.getPageCount(), 5);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const rendered = await pdfjs.getDocument({ data: Uint8Array.from(packetBytes) }).promise;
  const formPage = await rendered.getPage(2);
  const text = (await formPage.getTextContent()).items
    .map((item: { str: string }) => item.str)
    .join(' ');
  assert.ok(text.includes('Elena Morales'));
  assert.ok(text.includes('1234'));
  assert.ok(text.includes('elena.morales@agentmail.to'));
  assert.ok(text.includes('Yes'));

  const publicActivity = RunRepository.events(run.id)
    .map((event) => event.public_message)
    .join('\n');
  assert.ok(!publicActivity.includes('1234'));
  assert.ok(!publicActivity.includes('changed my life'));
  assert.ok(publicActivity.includes('Nothing has been sent or submitted.'));
});
