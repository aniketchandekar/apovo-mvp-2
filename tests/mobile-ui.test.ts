import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../', relativePath), 'utf8');
}

test('mobile viewport permits user zoom and uses the Next viewport API', () => {
  const layout = source('src/app/layout.tsx');
  assert.match(layout, /export const viewport: Viewport/);
  assert.doesNotMatch(layout, /maximum-scale|maximumScale|userScalable/);
});

test('shared shell exposes five safe-area-aware mobile destinations', () => {
  const shell = source('src/components/dashboard/AppShell.tsx');
  assert.match(shell, /aria-label="Primary navigation"/);
  assert.match(shell, /grid-template-columns: repeat\(5/);
  assert.match(shell, /env\(safe-area-inset-bottom\)/);
  assert.match(shell, /aria-current=\{item\.active \? 'page'/);
  assert.match(shell, /role=\{sidebarOpen \? 'dialog'/);
});

test('Browserbase mobile view is read-only, responsive, and full-screen capable', () => {
  const browser = source('src/components/application-agent/LiveBrowserPanel.tsx');
  assert.match(browser, /Read only/);
  assert.match(browser, /interaction-shield/);
  assert.match(browser, /aspect-ratio: 16 \/ 9/);
  assert.match(browser, /100dvh/);
  assert.match(browser, /waiting_for_patient/);
  assert.match(browser, /aria-modal="true"/);
});

test('mobile inbox switches between thread list and detail instead of stacking them', () => {
  const inbox = source('src/components/inbox/CareInboxView.tsx');
  assert.match(inbox, /data-mobile-detail=\{Boolean\(selectedThreadId\)\}/);
  assert.match(inbox, /Back to inbox/);
  assert.match(inbox, /data-mobile-detail='false'.*gmail-reading-pane/);
  assert.match(inbox, /data-mobile-detail='true'.*gmail-thread-list/);
});

test('mobile form controls retain a 16px text size', () => {
  const styles = source('src/app/globals.css');
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]*font-size: 16px !important/);
});

test('durable demo packet preview is mobile-safe and revokes private blob URLs', () => {
  const preview = source('src/components/demo/DemoPacketPreview.tsx');
  const workspace = source('src/components/demo/DemoWorkflowWorkspace.tsx');
  assert.match(preview, /URL\.revokeObjectURL/);
  assert.match(preview, /min-height: 48px/);
  assert.match(preview, /recipient is fixed on the server/i);
  assert.match(workspace, /grid-template-columns: 1fr/);
  assert.match(workspace, /Synthetic AI workflow/);
});
