import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInputAnswer, publicInput } from '../../src/lib/application-agent/input-validation';
import type { RequiredInput } from '../../src/lib/application-agent/types';

function input(overrides: Partial<RequiredInput>): RequiredInput {
  return {
    id: 'input_1',
    run_id: 'run_1',
    patient_id: 'patient_1',
    field_key: 'field',
    input_type: 'text',
    prompt: 'Question',
    reason: 'Reason',
    status: 'open',
    created_at: '2026-10-26T00:00:00.000Z',
    ...overrides,
  };
}

test('validates sensitive SSN answers and hides them from public payloads', () => {
  const ssn = input({ field_key: 'ssn_last4', input_type: 'sensitive_text' });
  assert.equal(validateInputAnswer(ssn, '1234'), '1234');
  for (const bad of ['123', '12345', 'abcd', '']) {
    assert.throws(() => validateInputAnswer(ssn, bad));
  }
  assert.equal(publicInput({ ...ssn, answer: '1234', status: 'answered' }).answer, undefined);
});

test('validates dates, choices, and income amounts', () => {
  assert.equal(validateInputAnswer(input({ input_type: 'date' }), '2025-11-03'), '2025-11-03');
  assert.throws(() => validateInputAnswer(input({ input_type: 'date' }), '11/03/2025'));
  assert.throws(() => validateInputAnswer(input({ input_type: 'date' }), '2025-13-40'));

  const choice = input({ input_type: 'choice', options: ['Yes', 'No'] });
  assert.equal(validateInputAnswer(choice, 'Yes'), 'Yes');
  assert.throws(() => validateInputAnswer(choice, 'Maybe'));

  const income = input({ field_key: 'monthly_income' });
  assert.equal(validateInputAnswer(income, '$1,800'), '$1,800');
  assert.throws(() => validateInputAnswer(income, 'not much'));
});

test('allows an empty social worker answer but requires notes and documents', () => {
  assert.equal(validateInputAnswer(input({ field_key: 'social_worker_details' }), ''), 'None');
  assert.throws(() => validateInputAnswer(input({ input_type: 'personal_note' }), '  '));
  assert.throws(() => validateInputAnswer(input({ input_type: 'file' }), 'anything'));
});
