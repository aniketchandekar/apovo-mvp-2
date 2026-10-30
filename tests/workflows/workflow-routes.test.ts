import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), '..', relativePath), 'utf8');
}

test('workflow start consumes server budgets and binds the returned run', () => {
  const route = source('src/app/api/demo/workflows/start/route.ts');
  assert.match(route, /consumeDemoBudget\(current, 'workflow'\)/);
  assert.match(route, /consumeDemoBudget\(workflowBudget\.session, 'packet'\)/);
  assert.match(route, /bindWorkflowRun\(packetBudget\.session, run\.runId, 1\)/);
  assert.doesNotMatch(route, /request\.json/);
});

test('workflow restart requires the current terminal run and preserves email budget', () => {
  const route = source('src/app/api/demo/workflows/[runId]/restart/route.ts');
  assert.match(route, /current\.workflowRunId !== runId/);
  assert.match(route, /previous\.status/);
  assert.match(route, /consumeDemoBudget\(current, 'workflow'\)/);
  assert.match(route, /consumeDemoBudget\(workflowBudget\.session, 'packet'\)/);
  assert.match(route, /deliveryAvailable: current\.remaining\.emails > 0/);
  assert.match(route, /demoRunGuardToken\(current\.sessionId, attempt\)/);
  assert.match(route, /getHookByToken\(token\)/);
  assert.match(route, /resolveAttemptOwner\(guardToken, started\.runId\)/);
  assert.match(route, /replaceWorkflowRun\(packetBudget\.session, runId, nextRunId\)/);
  assert.doesNotMatch(route, /consumeDemoBudget\([^\n]+, 'email'\)/);
  assert.doesNotMatch(route, /request\.json/);
});

test('event replay is restricted to the workflow bound in the signed session', () => {
  const route = source('src/app/api/demo/workflows/[runId]/events/route.ts');
  assert.match(route, /session\.workflowRunId !== runId/);
  assert.match(route, /getReadable<DemoWorkflowEvent>/);
  assert.match(route, /startIndex: requestedStartIndex\(request\)/);
  assert.match(route, /application\/x-ndjson/);
});

test('approval consumes the only email allowance before resuming the private hook', () => {
  const route = source('src/app/api/demo/workflows/[runId]/approve/route.ts');
  assert.match(route, /session\.workflowRunId !== runId/);
  assert.match(route, /consumeDemoBudget\(session, 'email'\)/);
  assert.match(route, /demoApprovalToken\(session\.sessionId\)/);
  assert.match(route, /HookNotFoundError\.is/);
  assert.doesNotMatch(route, /recipient|emailAddress|\bto:/);
});

test('packet artifact delivery is bound to the signed demo session', () => {
  const route = source('src/app/api/demo/workflows/[runId]/artifacts/[artifactId]/route.ts');
  assert.match(route, /session\.workflowRunId !== runId/);
  assert.match(route, /namespace: DEMO_PACKET_STREAM/);
  assert.match(route, /artifact\.artifactId !== artifactId/);
  assert.match(route, /createHash\('sha256'\)/);
  assert.doesNotMatch(route, /await reader\.cancel/);
  assert.match(route, /Content-Type': 'application\/pdf'/);
  assert.match(route, /X-Frame-Options': 'SAMEORIGIN'/);
  assert.match(route, /export const HEAD = GET/);
});
