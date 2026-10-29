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
  assert.match(route, /bindWorkflowRun\(packetBudget\.session, run\.runId\)/);
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
