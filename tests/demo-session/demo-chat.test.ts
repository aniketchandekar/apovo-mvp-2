import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createDemoChatHandler } from '../../src/lib/demo-session/chat-handler';
import { DEMO_SESSION_COOKIE } from '../../src/lib/demo-session/cookie';
import { createDemoSession, signDemoSession, verifyDemoSession } from '../../src/lib/demo-session/token';
import { askSyntheticDemoConcierge } from '../../src/lib/integrations/gemini/demo-chat-service';

const secret = 'chat-test-secret-that-is-at-least-32-characters';

function requestWith(message: string, token: string) {
  return new NextRequest('http://localhost/api/demo/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${DEMO_SESSION_COOKIE}=${token}`,
    },
    body: JSON.stringify({ message, sessionId: 'client-controlled-value' }),
  });
}

test('uses only the synthetic prompt and returns a bounded Gemini reply', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let receivedPrompt = '';
  const result = await askSyntheticDemoConcierge('How does the application work?', async (input) => {
    receivedPrompt = input.contents;
    return { text: 'I can demonstrate the synthetic application workflow.' };
  });

  assert.match(receivedPrompt, /synthetic/i);
  assert.doesNotMatch(receivedPrompt, /ApovoStore|patient_guest|client-controlled-value/);
  assert.equal(result.reply, 'I can demonstrate the synthetic application workflow.');
});

test('meters a chat turn and ignores client-provided session identity', async () => {
  const session = createDemoSession({ sessionId: 'server_session' });
  const token = signDemoSession(session, secret);
  let calls = 0;
  let observedSessionId = '';
  const handler = createDemoChatHandler({
    signingSecret: secret,
    configured: () => true,
    ask: async (_message, sessionId) => {
      calls += 1;
      observedSessionId = sessionId;
      return { reply: 'Synthetic answer', source: 'gemini' as const, model: 'test-model' };
    },
  });

  const response = await handler(requestWith('Hello', token));
  const payload = await response.json();
  const setCookie = response.headers.get('set-cookie') || '';
  const rotatedToken = setCookie.match(/apovo_demo_session=([^;]+)/)?.[1] || '';
  const rotated = verifyDemoSession(rotatedToken, secret);

  assert.equal(response.status, 200);
  assert.equal(payload.reply, 'Synthetic answer');
  assert.equal(payload.session.remaining.chatTurns, 9);
  assert.equal(rotated.remaining.chatTurns, 9);
  assert.equal(observedSessionId, 'server_session');
  assert.equal(calls, 1);
});

test('rejects oversized prompts and exhausted budgets without calling Gemini', async () => {
  let calls = 0;
  const handler = createDemoChatHandler({
    signingSecret: secret,
    configured: () => true,
    ask: async () => {
      calls += 1;
      return { reply: 'no', source: 'gemini' as const };
    },
  });
  const normal = createDemoSession({ sessionId: 'server_session' });
  const oversized = await handler(requestWith('a'.repeat(2_001), signDemoSession(normal, secret)));
  assert.equal(oversized.status, 400);

  const exhausted = {
    ...normal,
    remaining: { ...normal.remaining, chatTurns: 0 },
  };
  const limited = await handler(requestWith('Hello', signDemoSession(exhausted, secret)));
  assert.equal(limited.status, 429);
  assert.equal(calls, 0);
});
