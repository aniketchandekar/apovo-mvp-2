import { ApplicationRunError } from './errors';
import type { ApplicationRun, DeliveryMode } from './types';
import { REMEMBER_BETTY_SYNTHETIC_FIXTURE_VERSION } from './test-fixtures/remember-betty';

export const REMEMBER_BETTY_TEST_RECIPIENT = 'nicole.wu.mail@gmail.com' as const;

type TestModeEnvironment = { APOVO_APPLICATION_TEST_MODE?: string };

export function applicationTestModeEnabled(
  environment: TestModeEnvironment = process.env as TestModeEnvironment
): boolean {
  return environment.APOVO_APPLICATION_TEST_MODE === '1';
}

export function deliveryModeFor(run: Pick<ApplicationRun, 'delivery_mode'>): DeliveryMode {
  return run.delivery_mode === 'test_email' ? 'test_email' : 'prepare_only';
}

export function testRunCreationMetadata(
  environment: TestModeEnvironment = process.env as TestModeEnvironment
) {
  if (!applicationTestModeEnabled(environment)) {
    throw new ApplicationRunError(
      'TEST_MODE_UNAVAILABLE',
      'Application test mode is not enabled on this server.'
    );
  }
  return {
    delivery_mode: 'test_email' as const,
    test_recipient: REMEMBER_BETTY_TEST_RECIPIENT,
    synthetic_fixture_version: REMEMBER_BETTY_SYNTHETIC_FIXTURE_VERSION,
  };
}

export function assertApprovedTestRun(
  run: Pick<ApplicationRun, 'delivery_mode' | 'test_recipient' | 'synthetic_fixture_version'>,
  environment: TestModeEnvironment = process.env as TestModeEnvironment
): void {
  if (
    !applicationTestModeEnabled(environment) ||
    deliveryModeFor(run) !== 'test_email' ||
    run.test_recipient !== REMEMBER_BETTY_TEST_RECIPIENT ||
    run.synthetic_fixture_version !== REMEMBER_BETTY_SYNTHETIC_FIXTURE_VERSION
  ) {
    throw new ApplicationRunError(
      'TEST_MODE_UNAVAILABLE',
      'This application run is not an approved synthetic test run.'
    );
  }
}
