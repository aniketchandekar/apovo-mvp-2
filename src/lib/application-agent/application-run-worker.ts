import 'server-only';
import { initialPhaseHandlers } from './phases/initial-handlers';
import { RunWorker } from './worker';

export const applicationRunWorker = new RunWorker(initialPhaseHandlers, async (runId) => {
  const { browserDiscoveryCoordinator } = await import('./phases/browser-discovery-runtime');
  await browserDiscoveryCoordinator.cleanup(runId);
});
