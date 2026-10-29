import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertApprovedTestRun,
  deliveryModeFor,
  REMEMBER_BETTY_TEST_RECIPIENT,
  testRunCreationMetadata,
} from '../../src/lib/application-agent/test-mode-policy';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';

test('test metadata is server-owned and fixed to Nicole', () => {
  const metadata = testRunCreationMetadata({ APOVO_APPLICATION_TEST_MODE: '1' });
  assert.equal(metadata.test_recipient, REMEMBER_BETTY_TEST_RECIPIENT);
  assert.equal(metadata.delivery_mode, 'test_email');
  assert.ok(metadata.synthetic_fixture_version);
});

test('test mode is unavailable unless explicitly enabled', () => {
  assert.throws(
    () => testRunCreationMetadata({ APOVO_APPLICATION_TEST_MODE: '0' }),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'TEST_MODE_UNAVAILABLE'
  );
});

test('legacy runs default to prepare-only and altered recipients are rejected', () => {
  assert.equal(deliveryModeFor({}), 'prepare_only');
  assert.throws(
    () =>
      assertApprovedTestRun(
        {
          ...testRunCreationMetadata({ APOVO_APPLICATION_TEST_MODE: '1' }),
          test_recipient: 'foundation@example.com',
        },
        { APOVO_APPLICATION_TEST_MODE: '1' }
      ),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'TEST_MODE_UNAVAILABLE'
  );
});
