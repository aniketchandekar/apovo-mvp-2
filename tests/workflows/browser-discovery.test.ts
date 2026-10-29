import assert from 'node:assert/strict';
import test from 'node:test';
import { runSyntheticBrowserDiscovery } from '../../src/lib/demo-workflow/browser-discovery';
import type { BrowserAutomationSession } from '../../src/lib/integrations/browserbase/types';

function fakeSession(close: () => void): BrowserAutomationSession {
  return {
    sessionId: 'bb_session_test',
    connectUrl: 'wss://connect.example.test',
    liveViewUrl: 'https://debug.example.test/session',
    browser: {} as BrowserAutomationSession['browser'],
    stagehand: {} as BrowserAutomationSession['stagehand'],
    close: async () => close(),
  };
}

test('emits safe progress, returns in-memory PDF bytes, and always closes Browserbase', async () => {
  let closes = 0;
  const events: Array<{ phase: string; liveViewUrl?: string }> = [];
  const result = await runSyntheticBrowserDiscovery({
    runId: 'demo_run_test',
    startSession: async () => fakeSession(() => { closes += 1; }),
    inspectSite: async () => ({
      applicationUrl: 'https://rememberbetty.com/application.pdf',
      label: 'Application',
    }),
    downloadPdf: async () => ({
      bytes: new Uint8Array(Buffer.from('%PDF-test')),
      pageCount: 3,
      sha256: 'abc123',
    }),
    emit: async (event) => { events.push(event); },
  });

  assert.equal(closes, 1);
  assert.equal(result.pageCount, 3);
  assert.equal(Buffer.from(result.bytesBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.equal(events[0].phase, 'browser_live');
  assert.equal(events[0].liveViewUrl, 'https://debug.example.test/session');
  assert.equal(events.at(-1)?.phase, 'source_ready');
});

test('closes Browserbase when discovery fails', async () => {
  let closes = 0;
  await assert.rejects(() =>
    runSyntheticBrowserDiscovery({
      runId: 'demo_run_test',
      startSession: async () => fakeSession(() => { closes += 1; }),
      inspectSite: async () => { throw new Error('provider detail that must not be emitted'); },
      downloadPdf: async () => { throw new Error('unreachable'); },
      emit: async () => undefined,
    })
  );
  assert.equal(closes, 1);
});
