import 'server-only';
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright-core';
import { ApplicationRunError } from '../../application-agent/errors';
import { getBrowserbaseConfiguration } from './config';
import type { BrowserAutomationSession } from './types';

function diagnostic(error: unknown, phase: string) {
  const value = error as { name?: unknown; code?: unknown } | null;
  return {
    phase,
    name: typeof value?.name === 'string' ? value.name : 'Error',
    code:
      typeof value?.code === 'string' || typeof value?.code === 'number'
        ? value.code
        : undefined,
  };
}

export async function startBrowserbaseSession(
  runId: string,
  applicationId: string
): Promise<BrowserAutomationSession> {
  const configuration = getBrowserbaseConfiguration();
  const sdk = new Browserbase({ apiKey: configuration.apiKey });
  let sessionId = '';
  let playwrightBrowser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  let phase = 'create_session';

  try {
    const session = await sdk.sessions.create({
      projectId: configuration.projectId,
      region: configuration.region,
      api_timeout: 900,
      keepAlive: false,
      browserSettings: {
        allowedDomains: ['rememberbetty.com', 'squarespace.com'],
        blockAds: true,
        logSession: false,
        recordSession: false,
        viewport: { width: 1440, height: 900 },
      },
      userMetadata: {
        runId,
        applicationId,
        program: 'remember-betty',
      },
    });
    sessionId = session.id.trim();
    if (!sessionId || !session.connectUrl?.trim()) {
      throw new ApplicationRunError(
        'BROWSER_LAUNCH_FAILED',
        'Browserbase did not return a usable session.',
        true
      );
    }

    phase = 'connect_cdp';
    playwrightBrowser = await chromium.connectOverCDP(session.connectUrl);
    const context = playwrightBrowser.contexts()[0];
    if (!context) throw new Error('Browserbase session did not expose a browser context.');

    phase = 'load_debug_url';
    const liveUrls = await sdk.sessions.debug(sessionId);
    let closed = false;

    return {
      sessionId,
      connectUrl: session.connectUrl,
      liveViewUrl: liveUrls.debuggerFullscreenUrl,
      browser: {
        context: {
          async pages() {
            return context.pages();
          },
          async newPage() {
            return context.newPage();
          },
        },
        async download(url) {
          const page = context.pages()[0] || (await context.newPage());
          const cdp = await context.newCDPSession(page);
          try {
            await cdp.send('Browser.setDownloadBehavior', {
              behavior: 'allow',
              downloadPath: 'downloads',
              eventsEnabled: true,
            });
            const downloadStarted = page
              .waitForEvent('download', { timeout: 15_000 })
              .catch(() => undefined);
            await page.goto(url).catch(() => undefined);
            const download = await downloadStarted;
            await download?.path().catch(() => undefined);
          } finally {
            await cdp.detach().catch(() => undefined);
          }
        },
        async close() {
          await playwrightBrowser?.close();
        },
      },
      async close() {
        if (closed) return;
        closed = true;
        await Promise.allSettled([
          playwrightBrowser?.close(),
          sdk.sessions.update(sessionId, { status: 'REQUEST_RELEASE' }),
        ]);
      },
    };
  } catch (error) {
    console.error('[Browserbase] Session startup failed', diagnostic(error, phase));
    await Promise.allSettled([
      playwrightBrowser?.close(),
      sessionId
        ? sdk.sessions.update(sessionId, { status: 'REQUEST_RELEASE' })
        : Promise.resolve(),
    ]);
    if (error instanceof ApplicationRunError) throw error;
    throw new ApplicationRunError(
      'BROWSER_LAUNCH_FAILED',
      'A secure browser session could not be started.',
      true
    );
  }
}
