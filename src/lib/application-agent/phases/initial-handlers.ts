import type { PhaseHandlers } from './index';
import { pdfPhaseHandlers } from './pdf-handlers';
import { testModePhaseHandlers } from './test-mode-handlers';

export const initialPhaseHandlers: PhaseHandlers = {
  ...pdfPhaseHandlers,
  ...testModePhaseHandlers,
  created: async () => ({
    nextPhase: 'launching_browser',
    event: {
      kind: 'status',
      message: 'Preparing a secure browser session.',
    },
  }),
  launching_browser: async (run) => {
    const { browserDiscoveryCoordinator } = await import('./browser-discovery-runtime');
    return browserDiscoveryCoordinator.launch(run);
  },
  inspecting_site: async (run) => {
    const { browserDiscoveryCoordinator } = await import('./browser-discovery-runtime');
    return browserDiscoveryCoordinator.inspect(run);
  },
  downloading_pdf: async (run) => {
    const { browserDiscoveryCoordinator } = await import('./browser-discovery-runtime');
    return browserDiscoveryCoordinator.download(run);
  },
};
