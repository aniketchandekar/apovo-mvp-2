import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DemoSessionConfigurationError,
  getDemoSessionConfiguration,
  isVercelDemoMode,
} from '../../src/lib/demo-session/config';

test('detects only the explicit Vercel demo deployment mode', () => {
  assert.equal(isVercelDemoMode({ APOVO_DEPLOYMENT_MODE: 'vercel_demo' }), true);
  assert.equal(isVercelDemoMode({ APOVO_DEPLOYMENT_MODE: 'local' }), false);
  assert.equal(isVercelDemoMode({}), false);
});

test('requires a signing secret of at least 32 characters', () => {
  assert.throws(
    () =>
      getDemoSessionConfiguration({
        APOVO_DEPLOYMENT_MODE: 'vercel_demo',
        APOVO_DEMO_SESSION_SECRET: 'too-short',
      }),
    DemoSessionConfigurationError
  );

  const configuration = getDemoSessionConfiguration({
    APOVO_DEPLOYMENT_MODE: 'vercel_demo',
    APOVO_DEMO_SESSION_SECRET: 'a'.repeat(32),
  });
  assert.equal(configuration.signingSecret.length, 32);
  assert.equal(configuration.sessionDurationSeconds, 15 * 60);
});
