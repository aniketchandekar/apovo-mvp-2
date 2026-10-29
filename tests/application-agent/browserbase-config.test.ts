import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';
import { getBrowserbaseConfiguration } from '../../src/lib/integrations/browserbase/config';

test('requires both Browserbase credentials', () => {
  assert.throws(
    () => getBrowserbaseConfiguration({}),
    (error: unknown) =>
      error instanceof ApplicationRunError && error.code === 'CONFIGURATION_MISSING'
  );
  assert.throws(() => getBrowserbaseConfiguration({ BROWSERBASE_API_KEY: 'key' }));
});

test('returns server configuration without adding patient metadata', () => {
  assert.deepEqual(
    getBrowserbaseConfiguration({
      BROWSERBASE_API_KEY: 'key',
      BROWSERBASE_PROJECT_ID: 'project',
    }),
    { apiKey: 'key', projectId: 'project', region: 'us-east-1' }
  );
});
