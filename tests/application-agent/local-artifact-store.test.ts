import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';
import { LocalArtifactStore } from '../../src/lib/artifacts/local-artifact-store';

test('stores and reads an opaque private PDF artifact', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-artifacts-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new LocalArtifactStore(directory);
  const bytes = new TextEncoder().encode('%PDF-1.7\nsynthetic test file');

  const artifact = store.savePdf({
    runId: 'run_1',
    patientId: 'patient_1',
    kind: 'source_pdf',
    bytes,
    pageCount: 3,
  });

  assert.match(artifact.id, /^artifact_[0-9a-f-]+$/);
  assert.equal(artifact.private_path.includes('synthetic test file'), false);
  assert.equal(artifact.sha256.length, 64);
  assert.equal(
    Buffer.from(store.readPdf(artifact, { runId: 'run_1', patientId: 'patient_1' })).equals(
      Buffer.from(bytes)
    ),
    true
  );
});

test('refuses cross-run access and paths outside its private directory', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apovo-artifacts-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new LocalArtifactStore(directory);
  const artifact = store.savePdf({
    runId: 'run_1',
    patientId: 'patient_1',
    kind: 'source_pdf',
    bytes: new TextEncoder().encode('%PDF-1.7\nsynthetic'),
    pageCount: 1,
  });

  assert.throws(
    () => store.readPdf(artifact, { runId: 'run_2', patientId: 'patient_1' }),
    ApplicationRunError
  );
  assert.throws(
    () =>
      store.readPdf(
        { ...artifact, private_path: path.join(directory, '..', 'outside.pdf') },
        { runId: 'run_1', patientId: 'patient_1' }
      ),
    ApplicationRunError
  );
});
