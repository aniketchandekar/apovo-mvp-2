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

test('deployed demo does not render the floating synthetic-session banner', () => {
  const layout = source('src/app/layout.tsx');
  assert.doesNotMatch(layout, /DemoSessionBanner|Synthetic live demo/);
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

test('durable demo packet preview uses browser tabs and a mobile activity drawer', () => {
  const preview = source('src/components/demo/DemoPacketPreview.tsx');
  const canvasViewer = source('src/components/demo/PdfCanvasViewer.tsx');
  const workspace = source('src/components/demo/DemoWorkflowWorkspace.tsx');
  const viewer = source('src/components/demo/DemoWorkspaceViewer.tsx');
  assert.doesNotMatch(preview, /createObjectURL|packet\.base64|<iframe/);
  assert.match(preview, /api\/demo\/workflows/);
  assert.match(preview, /dynamic\(/);
  assert.match(preview, /ssr: false/);
  assert.match(canvasViewer, /import\('pdfjs-dist'\)/);
  assert.match(canvasViewer, /pdf\.worker\.min\.mjs/);
  assert.match(canvasViewer, /credentials: 'same-origin'/);
  assert.match(canvasViewer, /MAX_OUTPUT_SCALE = 2/);
  assert.match(canvasViewer, /ResizeObserver/);
  assert.match(canvasViewer, /renderedCount \+ 1/);
  assert.match(canvasViewer, /Retry preview/);
  assert.match(canvasViewer, /loadingTask\?\.destroy/);
  assert.match(canvasViewer, /renderTask\?\.cancel/);
  assert.match(viewer, /role="tablist"/);
  assert.match(viewer, /packet \? 'pdf' : 'browser'/);
  assert.match(workspace, /key=\{workflow\.packet\?\.artifactId \|\| 'browser'\}/);
  assert.match(workspace, /Activity &amp; actions/);
  assert.match(workspace, /data-open=\{activityOpen\}/);
  assert.match(workspace, /env\(safe-area-inset-bottom\)/);
  assert.match(workspace, /recipient is fixed on the server/i);
  assert.match(workspace, /Synthetic AI workflow/);
});

test('legacy application workspace keeps live browser and filled PDF in separate tabs', () => {
  const workspace = source('src/components/application-agent/ApplicationWorkspace.tsx');
  const viewer = source('src/components/application-agent/ApplicationWorkspaceViewer.tsx');
  const run = source('src/components/application-agent/useApplicationRun.ts');
  assert.match(workspace, /key={`legacy-\$\{runId\}`}/);
  assert.match(viewer, /role="tablist"/);
  assert.match(viewer, /Live browser/);
  assert.match(viewer, /Filled PDF/);
  assert.match(viewer, /pdfAvailable && !sawPdf\.current/);
  assert.match(run, /cursor\.current = 0/);
  assert.match(run, /activeRunId\.current !== requestedRunId/);
});
