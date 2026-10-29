import assert from 'node:assert/strict';
import test from 'node:test';
import { composeIntegrationTestEmail } from '../../src/lib/integrations/gemini/email-composer';

const context = {
  testRunId: 'email_test_synthetic_1',
  attachmentFilenames: ['apovo-test-application.pdf', 'apovo-test-supporting-document.pdf'],
};

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.GEMINI_MODEL;
});

test('composes a structured Gemini email and applies deterministic test labels', async () => {
  let captured: Record<string, unknown> | null = null;
  const result = await composeIntegrationTestEmail(context, async (request) => {
    captured = request as unknown as Record<string, unknown>;
    return {
      text: JSON.stringify({
        subject: 'Synthetic delivery check',
        text: `Hello Nicole,\n\nThis is a synthetic integration test with ${context.attachmentFilenames[0]} and ${context.attachmentFilenames[1]}. No action is needed.\n\nBest,\nApovo Test`,
      }),
    };
  });

  assert.equal(captured!.model, 'gemini-3.7-flash');
  const config = captured!.config as { responseMimeType?: string; responseSchema?: { required?: string[] } };
  assert.equal(config.responseMimeType, 'application/json');
  assert.deepEqual(config.responseSchema?.required, ['subject', 'text']);
  assert.equal(result.source, 'gemini');
  assert.equal(result.subject, '[Apovo Test] Synthetic delivery check');
  assert.ok(result.text.includes(context.testRunId));
  assert.ok(result.text.includes('No grant application was submitted.'));
  const contents = String(captured!.contents);
  assert.ok(!contents.includes('Jane Doe'));
  assert.ok(contents.includes('Do not address or mention Remember Betty as a recipient'));
});

test('fails closed for malformed output or omitted attachment names', async () => {
  await assert.rejects(
    composeIntegrationTestEmail(context, async () => ({ text: 'not-json' })),
    /unreadable email draft/
  );
  await assert.rejects(
    composeIntegrationTestEmail(context, async () => ({
      text: JSON.stringify({ subject: 'Test', text: 'Only one attachment is named apovo-test-application.pdf' }),
    })),
    /did not identify every test attachment/
  );
});

test('does not fall back when Gemini is unavailable or unconfigured', async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  let called = false;
  await assert.rejects(
    composeIntegrationTestEmail(context, async () => {
      called = true;
      return { text: '{}' };
    }),
    /Gemini is not configured/
  );
  assert.equal(called, false);

  process.env.GEMINI_API_KEY = 'test-gemini-key';
  await assert.rejects(
    composeIntegrationTestEmail(context, async () => {
      throw new Error('provider offline');
    }),
    /provider offline/
  );
});
