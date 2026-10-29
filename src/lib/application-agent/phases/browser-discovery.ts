import { ApplicationRunError } from '../errors';
import type { ApplicationArtifact, ApplicationRun } from '../types';
import type { BrowserAutomationSession } from '../../integrations/browserbase/types';
import type { PhaseResult } from './index';

const MANUAL_REVIEW_ERRORS = new Set([
  'APPLICATION_LINK_NOT_FOUND',
  'APPLICATION_LINK_REJECTED',
  'DOWNLOAD_NOT_FOUND',
  'DOWNLOAD_AMBIGUOUS',
  'DOWNLOAD_INVALID',
  'DOWNLOAD_TIMEOUT',
]);

export interface BrowserDiscoveryRepository {
  update(id: string, updates: Partial<ApplicationRun>): ApplicationRun | null;
}

export interface BrowserDiscoveryDependencies {
  repository: BrowserDiscoveryRepository;
  startSession(run: ApplicationRun): Promise<BrowserAutomationSession>;
  inspectSite(session: BrowserAutomationSession): Promise<{ applicationUrl: string; label: string }>;
  downloadPdf(run: ApplicationRun, session: BrowserAutomationSession): Promise<ApplicationArtifact>;
}

export class BrowserDiscoveryCoordinator {
  private readonly sessions = new Map<string, BrowserAutomationSession>();

  constructor(private readonly dependencies: BrowserDiscoveryDependencies) {}

  private async sessionFor(run: ApplicationRun): Promise<BrowserAutomationSession> {
    const current = this.sessions.get(run.id);
    if (current) return current;

    const session = await this.dependencies.startSession(run);
    this.sessions.set(run.id, session);
    this.dependencies.repository.update(run.id, {
      browserbase_session_id: session.sessionId,
      live_view_url: session.liveViewUrl,
    });
    return session;
  }

  async launch(run: ApplicationRun): Promise<PhaseResult> {
    const session = await this.sessionFor(run);
    return {
      nextPhase: 'inspecting_site',
      updates: {
        browserbase_session_id: session.sessionId,
        live_view_url: session.liveViewUrl,
      },
      event: { kind: 'action', message: 'Opened the official Remember Betty assistance page.' },
    };
  }

  async inspect(run: ApplicationRun): Promise<PhaseResult> {
    try {
      const result = await this.dependencies.inspectSite(await this.sessionFor(run));
      return {
        nextPhase: 'downloading_pdf',
        updates: { discovered_application_url: result.applicationUrl },
        event: { kind: 'action', message: 'Found the current application PDF.' },
      };
    } catch (error) {
      await this.cleanup(run.id);
      if (error instanceof ApplicationRunError && MANUAL_REVIEW_ERRORS.has(error.code)) {
        return {
          nextPhase: 'needs_manual_review',
          updates: { browserbase_session_id: undefined, live_view_url: undefined },
          event: { kind: 'warning', message: error.message },
        };
      }
      throw error;
    }
  }

  async download(run: ApplicationRun): Promise<PhaseResult> {
    try {
      const artifact = await this.dependencies.downloadPdf(run, await this.sessionFor(run));
      return {
        nextPhase: 'inspecting_pdf',
        updates: {
          source_pdf_artifact_id: artifact.id,
          browserbase_session_id: undefined,
          live_view_url: undefined,
        },
        event: { kind: 'status', message: 'The application PDF is ready for review.' },
      };
    } catch (error) {
      if (error instanceof ApplicationRunError && MANUAL_REVIEW_ERRORS.has(error.code)) {
        return {
          nextPhase: 'needs_manual_review',
          updates: { browserbase_session_id: undefined, live_view_url: undefined },
          event: { kind: 'warning', message: error.message },
        };
      }
      throw error;
    } finally {
      await this.cleanup(run.id);
    }
  }

  async cleanup(runId: string): Promise<void> {
    const session = this.sessions.get(runId);
    this.sessions.delete(runId);
    this.dependencies.repository.update(runId, {
      browserbase_session_id: undefined,
      live_view_url: undefined,
    });
    if (session) await session.close();
  }
}
