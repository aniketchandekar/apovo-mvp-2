import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

const secret = 'route-test-secret-that-is-at-least-32-characters';

test('creates a session and returns only its safe summary', async () => {
  process.env.APOVO_DEPLOYMENT_MODE = 'vercel_demo';
  process.env.APOVO_DEMO_SESSION_SECRET = secret;
  const route = await import('../../src/app/api/demo/session/route');
  const response = await route.POST(
    new NextRequest('http://localhost/api/demo/session', { method: 'POST' })
  );
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.session.active, true);
  assert.equal(payload.session.remaining.chatTurns, 10);
  assert.equal('sessionId' in payload.session, false);
  assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
  assert.match(response.headers.get('set-cookie') || '', /SameSite=Strict/i);
});

test('returns 404 when the Vercel demo mode is disabled', async () => {
  process.env.APOVO_DEPLOYMENT_MODE = 'local';
  process.env.APOVO_DEMO_SESSION_SECRET = secret;
  const route = await import('../../src/app/api/demo/session/route');
  const response = await route.POST(
    new NextRequest('http://localhost/api/demo/session', { method: 'POST' })
  );
  assert.equal(response.status, 404);
});

test('replaces the signed session with fresh synthetic data and budgets', async () => {
  process.env.APOVO_DEPLOYMENT_MODE = 'vercel_demo';
  process.env.APOVO_DEMO_SESSION_SECRET = secret;
  const route = await import('../../src/app/api/demo/session/route');
  const initial = await route.POST(
    new NextRequest('http://localhost/api/demo/session', { method: 'POST' })
  );
  const initialCookie = initial.headers.get('set-cookie') || '';

  const response = await route.DELETE();
  const payload = await response.json();
  const replacementCookie = response.headers.get('set-cookie') || '';

  assert.equal(response.status, 201);
  assert.equal(payload.session.active, true);
  assert.equal(payload.session.remaining.chatTurns, 10);
  assert.equal(payload.session.remaining.workflows, 2);
  assert.equal(payload.session.workflowBound, false);
  assert.equal(payload.session.canRestartWorkflow, false);
  assert.notEqual(replacementCookie, initialCookie);
  assert.match(replacementCookie, /HttpOnly/i);
  assert.equal('sessionId' in payload.session, false);
});
