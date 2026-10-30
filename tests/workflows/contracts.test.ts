import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), '..', relativePath), 'utf8');
}

test('configures Next to compile Workflow SDK directives', () => {
  const config = source('next.config.ts');
  const tsconfig = source('tsconfig.json');
  assert.match(config, /withWorkflow\(nextConfig\)/);
  assert.match(tsconfig, /"name": "workflow"/);
});

test('durable workflow claims the session before browser work and waits for approval', () => {
  const workflow = source('workflows/remember-betty-demo.ts');
  assert.match(workflow, /'use workflow'/);
  assert.match(workflow, /'use step'/);
  assert.ok(workflow.indexOf('runGuard.getConflict()') < workflow.indexOf('await discoverApplicationStep('));
  assert.ok(workflow.indexOf('await buildPacketStep(') < workflow.indexOf('approval.getConflict()'));
  assert.ok(workflow.indexOf('approval.getConflict()') < workflow.indexOf('await sendTestEmailStep('));
  assert.match(workflow, /sendTestEmailStep\.maxRetries = 0/);
  assert.match(workflow, /clientId: `apovo-demo-\$\{input\.workflowRunId\}`/);
  assert.match(workflow, /sleep\(new Date\(input\.sessionExpiresAt\)\)/);
});

test('workflow events use an allowlisted public contract', () => {
  const types = source('src/lib/demo-workflow/types.ts');
  assert.match(types, /phase: DemoWorkflowPhase/);
  assert.match(types, /message: string/);
  assert.match(types, /liveViewUrl\?: string/);
  assert.doesNotMatch(types, /connectUrl|apiKey|sessionId/);
});

test('browser workflow uses native Browserbase and reconnects durable streams', () => {
  const client = source('src/lib/integrations/browserbase/client.ts');
  const inspector = source('src/lib/application-agent/phases/inspect-site.ts');
  const stream = source('src/components/demo/useDemoWorkflow.ts');
  assert.match(client, /sdk\.sessions\.create/);
  assert.match(client, /chromium\.connectOverCDP/);
  assert.doesNotMatch(client, /stagehand|browserbase\.launch/);
  assert.doesNotMatch(inspector, /stagehand|\.extract\(/);
  assert.match(stream, /startIndex=\$\{nextStartIndex\}/);
  assert.doesNotMatch(stream, /reconnects > 3[\s\S]*return;/);
});
