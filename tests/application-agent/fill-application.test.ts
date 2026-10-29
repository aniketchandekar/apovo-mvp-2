import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { fillRememberBettyApplication } from '../../src/lib/pdf/fill-application';
import { REMEMBER_BETTY_2024_09_09_SHA256, getRememberBettyTemplate } from '../../src/lib/pdf/template-registry';

const fixture = new Uint8Array(
  fs.readFileSync(path.resolve(__dirname, '../../../tests/fixtures/remember-betty/current-application.pdf'))
);
const template = getRememberBettyTemplate(REMEMBER_BETTY_2024_09_09_SHA256)!;

test('fills known fields and leaves unanswered fields and signature blank', async () => {
  const sourceCopy = Uint8Array.from(fixture);
  const { bytes, pageCount } = await fillRememberBettyApplication(fixture, template, {
    application_date: '10/26/2026',
    full_name: 'Elena Morales',
    mailing_address: '100 Test St\nAustin, TX 78701',
    care_email: 'elena.morales@agentmail.to',
    birth_date: '1980-04-12',
    ssn_last4: '1234',
    diagnosis_date: '2025-11-03',
    diagnosis_description: 'Breast cancer, Stage II',
    monthly_income: '$1,800',
    social_worker_details: 'None',
    actively_employed: 'No',
    active_treatment: 'Yes',
  });

  assert.equal(pageCount, 3);
  assert.deepEqual(fixture, sourceCopy);

  const document = await PDFDocument.load(bytes);
  const form = document.getForm();
  assert.equal(form.getTextField('Text2').getText(), 'Elena Morales');
  assert.equal(form.getTextField('Text4').getText(), 'elena.morales@agentmail.to');
  assert.equal(form.getTextField('Text6').getText(), '1234');
  assert.equal(form.getTextField('Text3').getText(), '100 Test St\nAustin, TX 78701');
  assert.equal(form.getDropdown('Dropdown12.0').getSelected()[0], 'No');
  assert.equal(form.getDropdown('Dropdown12.1').getSelected()[0], 'Yes');
  assert.equal(document.getPageCount(), 3);
});

test('does not invent values for unknown fields', async () => {
  const { bytes } = await fillRememberBettyApplication(fixture, template, {
    full_name: 'Elena Morales',
  });
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField('Text2').getText(), 'Elena Morales');
  assert.equal(form.getTextField('Text6').getText(), undefined);
  assert.equal(form.getTextField('Text9').getText(), undefined);
  assert.deepEqual(form.getDropdown('Dropdown12.0').getSelected(), ['Please Select']);
});
