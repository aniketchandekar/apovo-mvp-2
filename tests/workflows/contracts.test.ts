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
  assert.match(types, /artifactId: string/);
  assert.doesNotMatch(types, /packet\?: \{[^}]*base64: string/);
  assert.doesNotMatch(types, /connectUrl|apiKey|sessionId/);
});

test('browser workflow uses native Browserbase and reconnects durable streams', () => {
  const client = source('src/lib/integrations/browserbase/client.ts');
  const download = source('src/lib/integrations/browserbase/download-bytes.ts');
  const inspector = source('src/lib/application-agent/phases/inspect-site.ts');
  const stream = source('src/components/demo/useDemoWorkflow.ts');
  assert.match(client, /sdk\.sessions\.create/);
  assert.match(client, /chromium\.connectOverCDP/);
  assert.match(client, /Browser\.setDownloadBehavior/);
  assert.match(client, /waitForEvent\('download'/);
  assert.match(download, /session\.browser\.download\(applicationUrl\)/);
  assert.doesNotMatch(download, /connectOverCDP|browser\.close/);
  assert.doesNotMatch(client, /stagehand|browserbase\.launch/);
  assert.doesNotMatch(inspector, /stagehand|\.extract\(/);
  assert.match(stream, /startIndex=\$\{nextStartIndex\}/);
  assert.match(stream, /item\.index === index/);
  assert.doesNotMatch(stream, /eventKey\(|phase.*sha256.*message/);
  assert.doesNotMatch(stream, /reconnects > 3[\s\S]*return;/);
});

test('restart uses an attempt-specific run guard and can terminate without another email', () => {
  const workflow = source('workflows/remember-betty-demo.ts');
  assert.match(workflow, /demoRunGuardToken\(input\.sessionId, input\.attempt\)/);
  assert.match(workflow, /if \(!input\.deliveryAvailable\)/);
  assert.match(workflow, /status: 'preview_only'/);
  assert.match(workflow, /packet_ready_no_delivery/);
});

test('workflow stores the PDF outside the public activity stream', () => {
  const workflow = source('workflows/remember-betty-demo.ts');
  assert.match(workflow, /getWritable<DemoPacketArtifact>\(\{ namespace: DEMO_PACKET_STREAM \}\)/);
  assert.match(workflow, /await persistPacketStep\(writable, packetWritable, packet, input\.deliveryAvailable\)/);
  assert.ok(workflow.indexOf('await writer.write({') < workflow.indexOf('phase: deliveryAvailable'));
  assert.ok(workflow.indexOf('await writer.write({') < workflow.indexOf('await writer.close()'));
});
