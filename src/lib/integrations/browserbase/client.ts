import 'server-only';
import Browserbase from '@browserbasehq/sdk';
import { browserbase, Stagehand } from '@browserbasehq/stagehand';
import { ApplicationRunError } from '../../application-agent/errors';
import { getBrowserbaseConfiguration } from './config';
import type { BrowserAutomationSession } from './types';

export async function startBrowserbaseSession(
  runId: string,
  applicationId: string
): Promise<BrowserAutomationSession> {
  const configuration = getBrowserbaseConfiguration();
  let browser: Awaited<ReturnType<typeof browserbase.launch>> | undefined;
  let stagehand: Stagehand | undefined;

  try {
    browser = await browserbase.launch({
      apiKey: configuration.apiKey,
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

    if (!browser.sessionId) {
      throw new ApplicationRunError(
        'BROWSER_LAUNCH_FAILED',
        'Browserbase did not return a session identifier.',
        true
      );
    }

    stagehand = await Stagehand.create({
      browser,
      logging: { level: 'off', format: 'json' },
    });

    const sdk = new Browserbase({ apiKey: configuration.apiKey });
    const [liveUrls, sessionInfo] = await Promise.all([
      sdk.sessions.debug(browser.sessionId),
      sdk.sessions.retrieve(browser.sessionId),
    ]);
    const sessionId = browser.sessionId;
    if (!sessionInfo.connectUrl) {
      throw new ApplicationRunError(
        'BROWSER_LAUNCH_FAILED',
        'Browserbase did not return a connection URL.',
        true
      );
    }

    return {
      sessionId,
      connectUrl: sessionInfo.connectUrl,
      liveViewUrl: liveUrls.debuggerFullscreenUrl,
      browser: browser as unknown as BrowserAutomationSession['browser'],
      stagehand: stagehand as unknown as BrowserAutomationSession['stagehand'],
      async close() {
        await Promise.allSettled([stagehand?.close(), browser?.close()]);
      },
    };
  } catch (error) {
    await Promise.allSettled([stagehand?.close(), browser?.close()]);
    if (error instanceof ApplicationRunError) throw error;
    throw new ApplicationRunError(
      'BROWSER_LAUNCH_FAILED',
      'A secure browser session could not be started.',
      true
    );
  }
}
