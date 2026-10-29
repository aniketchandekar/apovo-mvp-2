import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectPdf, requireReviewedTemplate } from '../../src/lib/pdf/inspect-pdf';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';
import { REMEMBER_BETTY_2024_09_09_SHA256 } from '../../src/lib/pdf/template-registry';

const fixturePath = path.resolve(
  __dirname,
  '../../../tests/fixtures/remember-betty/current-application.pdf'
);
const fixture = new Uint8Array(fs.readFileSync(fixturePath));

function expectCode(code: string) {
  return (error: unknown) => error instanceof ApplicationRunError && error.code === code;
}

test('recognizes the reviewed Remember Betty application fixture', async () => {
  const inspection = await inspectPdf(fixture);
  assert.equal(inspection.sha256, REMEMBER_BETTY_2024_09_09_SHA256);
  assert.equal(inspection.pageCount, 3);
  assert.ok(inspection.fieldNames.includes('Text1'));
  assert.ok(inspection.fieldNames.includes('Dropdown12.1'));

  const template = requireReviewedTemplate(inspection);
  assert.equal(template.fields.full_name, 'Text2');
  assert.equal(template.fields.care_email, 'Text4');
  assert.equal(template.fields.ssn_last4, 'Text6');
});

test('refuses a one-byte-changed application version', async () => {
  const changed = Uint8Array.from(fixture);
  changed[changed.length - 20] ^= 0xff;
  const changedSha = crypto.createHash('sha256').update(changed).digest('hex');
  assert.notEqual(changedSha, REMEMBER_BETTY_2024_09_09_SHA256);

  const inspection = await inspectPdf(fixture);
  assert.throws(
    () => requireReviewedTemplate({ ...inspection, sha256: changedSha }),
    expectCode('PDF_VERSION_UNKNOWN')
  );
});

test('rejects non-PDF bytes', async () => {
  await assert.rejects(inspectPdf(new TextEncoder().encode('not a pdf')), expectCode('PDF_INVALID'));
});
