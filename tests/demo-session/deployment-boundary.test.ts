import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { proxy } from '../../src/proxy';

test('denies legacy mutations and permits only approved demo/read APIs in demo mode', async () => {
  process.env.APOVO_DEPLOYMENT_MODE = 'vercel_demo';

  for (const target of [
    ['/api/demo/session', 'POST'],
    ['/api/demo/chat', 'POST'],
    ['/api/dashboard', 'GET'],
    ['/api/capabilities', 'GET'],
    ['/api/chat', 'GET'],
  ]) {
    const response = proxy(new NextRequest(`https://demo.example${target[0]}`, { method: target[1] }));
    assert.notEqual(response.status, 404, `${target[1]} ${target[0]} should pass the boundary`);
  }

  for (const target of [
    ['/api/chat', 'POST'],
    ['/api/data/clear', 'POST'],
    ['/api/patients', 'GET'],
    ['/api/upload', 'POST'],
    ['/api/test-care-email', 'POST'],
    ['/api/webhooks/agentmail', 'POST'],
    ['/api/applications/app_test/runs', 'POST'],
  ]) {
    const response = proxy(new NextRequest(`https://demo.example${target[0]}`, { method: target[1] }));
    assert.equal(response.status, 404, `${target[1]} ${target[0]} should be hidden`);
  }
});

test('does not change local API behavior when demo mode is disabled', () => {
  process.env.APOVO_DEPLOYMENT_MODE = 'local';
  const response = proxy(
    new NextRequest('http://localhost/api/applications/app_test/runs', { method: 'POST' })
  );
  assert.notEqual(response.status, 404);
});

test('configures baseline security headers and Browserbase frame policy', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../next.config.ts'), 'utf8');
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /frame-src 'self' https:\/\/\*\.browserbase\.com/);
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /Referrer-Policy/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /X-Robots-Tag/);
});
