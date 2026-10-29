import 'server-only';
import { startBrowserbaseSession } from '../../integrations/browserbase/client';
import { RunRepository } from '../run-repository';
import { inspectRememberBettySite } from './inspect-site';
import { downloadApplicationPdf } from './download-pdf';
import { BrowserDiscoveryCoordinator } from './browser-discovery';

export const browserDiscoveryCoordinator = new BrowserDiscoveryCoordinator({
  repository: RunRepository,
  startSession: (run) => startBrowserbaseSession(run.id, run.application_id),
  inspectSite: inspectRememberBettySite,
  downloadPdf: downloadApplicationPdf,
});
