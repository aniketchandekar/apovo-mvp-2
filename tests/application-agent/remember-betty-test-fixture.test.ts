import assert from 'node:assert/strict';
import test from 'node:test';
import { REMEMBER_BETTY_SYNTHETIC_APPLICANT } from '../../src/lib/application-agent/test-fixtures/remember-betty';
import {
  getRememberBettyTemplate,
  REMEMBER_BETTY_2024_09_09_SHA256,
} from '../../src/lib/pdf/template-registry';

test('synthetic fixture fills every reviewed Remember Betty field', () => {
  const template = getRememberBettyTemplate(REMEMBER_BETTY_2024_09_09_SHA256);
  assert.ok(template);
  for (const key of Object.keys(template.fields)) {
    assert.ok(
      REMEMBER_BETTY_SYNTHETIC_APPLICANT.values[
        key as keyof typeof REMEMBER_BETTY_SYNTHETIC_APPLICANT.values
      ]
    );
  }
  assert.match(REMEMBER_BETTY_SYNTHETIC_APPLICANT.personalNote, /fictional/i);
  assert.match(REMEMBER_BETTY_SYNTHETIC_APPLICANT.diagnosisLetter.body, /no real patient/i);
});
