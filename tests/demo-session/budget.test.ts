import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeDemoBudget, publicDemoSessionSummary } from '../../src/lib/demo-session/budget';
import { createDemoSession } from '../../src/lib/demo-session/token';
import { demoSessionCookieOptions } from '../../src/lib/demo-session/cookie';

const now = Date.parse('2026-10-29T18:00:00.000Z');

test('consumes each immutable budget and rejects the next action', () => {
  let session = createDemoSession({ now, sessionId: 'session_test' });

  for (let index = 0; index < 10; index += 1) {
    const result = consumeDemoBudget(session, 'chat', now);
    assert.equal(result.ok, true);
    if (result.ok) session = result.session;
  }
  assert.equal(consumeDemoBudget(session, 'chat', now).ok, false);

  for (const action of ['workflow', 'packet', 'email'] as const) {
    const first = consumeDemoBudget(session, action, now);
    assert.equal(first.ok, true);
    if (first.ok) session = first.session;
    assert.equal(consumeDemoBudget(session, action, now).ok, false);
  }

  for (let index = 0; index < 2; index += 1) {
    const result = consumeDemoBudget(session, 'retry', now);
    assert.equal(result.ok, true);
    if (result.ok) session = result.session;
  }
  assert.equal(consumeDemoBudget(session, 'retry', now).ok, false);
  assert.equal(session.sequence, 15);
});

test('rejects actions at expiry and exposes only a safe public summary', () => {
  const session = createDemoSession({ now, sessionId: 'session_test' });
  const expired = consumeDemoBudget(session, 'chat', now + 15 * 60 * 1000);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, 'SESSION_EXPIRED');

  const summary = publicDemoSessionSummary(session, now);
  assert.equal(summary.active, true);
  assert.equal(summary.expiresAt, '2026-10-29T18:15:00.000Z');
  assert.equal('sessionId' in summary, false);
  assert.equal('sequence' in summary, false);
});

test('uses strict HttpOnly cookie attributes and a 15-minute lifetime', () => {
  const production = demoSessionCookieOptions(true);
  assert.equal(production.httpOnly, true);
  assert.equal(production.secure, true);
  assert.equal(production.sameSite, 'strict');
  assert.equal(production.path, '/');
  assert.equal(production.maxAge, 15 * 60);

  assert.equal(demoSessionCookieOptions(false).secure, false);
});
