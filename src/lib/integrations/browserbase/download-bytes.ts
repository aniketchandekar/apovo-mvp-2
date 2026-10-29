import 'server-only';
import { createHash } from 'node:crypto';
import { inspectPdf } from '../../pdf/inspect-pdf';
import { validateRememberBettyApplicationUrl } from './url-policy';
import {
  browserbaseDownloadLimits,
  pollForSessionPdf,
  type SessionDownloadsClient,
} from './downloads';
import { createBrowserbaseDownloadsClient } from './download-client';
import type { BrowserAutomationSession } from './types';

async function navigateToDownload(
  applicationUrl: string,
  session: BrowserAutomationSession
) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());
    const cdp = await context.newCDPSession(page);
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: 'downloads',
      eventsEnabled: true,
    });
    await page.goto(applicationUrl).catch(() => undefined);
  } finally {
    await browser.close();
  }
}

export async function downloadApplicationPdfBytes(
  applicationUrl: string,
  session: BrowserAutomationSession,
  dependencies: {
    downloads?: SessionDownloadsClient;
    navigate?: typeof navigateToDownload;
  } = {}
) {
  const validatedUrl = validateRememberBettyApplicationUrl(applicationUrl).toString();
  await (dependencies.navigate || navigateToDownload)(validatedUrl, session);
  const bytes = await pollForSessionPdf(
    dependencies.downloads || createBrowserbaseDownloadsClient(),
    session.sessionId,
    browserbaseDownloadLimits()
  );
  const inspection = await inspectPdf(bytes);
  return {
    bytes,
    pageCount: inspection.pageCount,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
