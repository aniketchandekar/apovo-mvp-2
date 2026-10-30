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
  await session.browser.download(applicationUrl);
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
