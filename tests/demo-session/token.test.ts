import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDemoSession,
  signDemoSession,
  verifyDemoSession,
} from '../../src/lib/demo-session/token';

const secret = 'session-test-secret-that-is-at-least-32-characters';
const now = Date.parse('2026-10-29T18:00:00.000Z');

test('creates and verifies a versioned 15-minute demo session', () => {
  const session = createDemoSession({ now, sessionId: 'session_test' });
  const token = signDemoSession(session, secret);
  const verified = verifyDemoSession(token, secret, now + 1);

  assert.deepEqual(verified, session);
  assert.equal(session.expiresAt - session.issuedAt, 15 * 60);
  assert.deepEqual(session.remaining, {
    chatTurns: 10,
    workflows: 1,
    retries: 2,
    packets: 1,
    emails: 1,
  });
});

test('rejects altered signatures, malformed tokens, and expiry', () => {
  const session = createDemoSession({ now, sessionId: 'session_test' });
  const token = signDemoSession(session, secret);
  const [payload, signature] = token.split('.');

  assert.throws(() => verifyDemoSession(`${payload}.${signature.slice(0, -1)}x`, secret, now));
  assert.throws(() => verifyDemoSession('not-a-token', secret, now));
  assert.throws(() => verifyDemoSession(token, secret, now + 15 * 60 * 1000));
});

test('rejects an unsupported version even with a valid signature', () => {
  const session = createDemoSession({ now, sessionId: 'session_test' });
  const unsupported = { ...session, version: 2 as 1 };
  const token = signDemoSession(unsupported, secret);
  assert.throws(() => verifyDemoSession(token, secret, now));
});
