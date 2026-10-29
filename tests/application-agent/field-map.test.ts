import assert from 'node:assert/strict';
import test from 'node:test';
import { answeredFormValues, knownProfileValues, REQUIRED_INPUT_SPECS } from '../../src/lib/pdf/field-map';
import type { PatientProfile } from '../../src/lib/types';
import type { RequiredInput } from '../../src/lib/application-agent/types';

function patient(overrides: Partial<PatientProfile> = {}): PatientProfile {
  return {
    id: 'patient_1',
    first_name: 'Elena',
    last_name: 'Morales',
    dob: '1980-04-12',
    phone: '',
    address_street: '100 Test St',
    address_city: 'Austin',
    address_state: 'TX',
    address_zip: '78701',
    diagnosis: 'Breast cancer',
    stage: 'II',
    treatment_status: '',
    treatment_types: [],
    insurance: '',
    needs: [],
    household_size: 1,
    monthly_income_band: '',
    employment_status: '',
    status: 'active',
    created_at: '2026-10-26T00:00:00.000Z',
    updated_at: '2026-10-26T00:00:00.000Z',
    ...overrides,
  };
}

test('maps known profile values without inventing missing data', () => {
  const values = knownProfileValues(patient(), { applicationDate: '10/26/2026' });
  assert.equal(values.full_name, 'Elena Morales');
  assert.equal(values.mailing_address, '100 Test St\nAustin, TX 78701');
  assert.equal(values.birth_date, '1980-04-12');
  assert.equal(values.diagnosis_description, 'Breast cancer, II');
  assert.equal(values.application_date, '10/26/2026');
  assert.equal(values.care_email, undefined);
  assert.equal(values.monthly_income, undefined);
  assert.equal(values.ssn_last4, undefined);
});

test('uses the care email only when an inbox ID is also confirmed', () => {
  const confirmed = knownProfileValues(
    patient({ care_email: 'elena@agentmail.to', agentmail_inbox_id: 'elena@agentmail.to' })
  );
  assert.equal(confirmed.care_email, 'elena@agentmail.to');

  const unconfirmed = knownProfileValues(patient({ care_email: 'elena@agentmail.to' }));
  assert.equal(unconfirmed.care_email, undefined);
});

test('always asks for current and sensitive answers and supporting documents', () => {
  const keys = REQUIRED_INPUT_SPECS.map((spec) => spec.field_key);
  for (const required of ['ssn_last4', 'monthly_income', 'actively_employed', 'active_treatment', 'diagnosis_date', 'diagnosis_letter', 'personal_note']) {
    assert.ok(keys.includes(required), `${required} must be asked`);
  }
});

test('merges only answered non-document inputs into form values', () => {
  const inputs = [
    { field_key: 'monthly_income', status: 'answered', answer: '1800' },
    { field_key: 'ssn_last4', status: 'open', answer: undefined },
    { field_key: 'diagnosis_letter', status: 'answered', answer: { artifactId: 'a1' } },
  ] as RequiredInput[];
  assert.deepEqual(answeredFormValues(inputs), { monthly_income: '1800' });
});
