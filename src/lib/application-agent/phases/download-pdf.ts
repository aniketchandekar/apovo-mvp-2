import 'server-only';
import type { ArtifactStore } from '../../artifacts/types';
import { localArtifactStore } from '../../artifacts/local-artifact-store';
import {
  type SessionDownloadsClient,
} from '../../integrations/browserbase/downloads';
import { downloadApplicationPdfBytes } from '../../integrations/browserbase/download-bytes';
import type { BrowserAutomationSession } from '../../integrations/browserbase/types';
import { RunRepository } from '../run-repository';
import type { ApplicationRun, ApplicationArtifact } from '../types';

export async function downloadApplicationPdf(
  run: ApplicationRun,
  session: BrowserAutomationSession,
  dependencies: {
    downloads?: SessionDownloadsClient;
    artifacts?: ArtifactStore;
  } = {}
): Promise<ApplicationArtifact> {
  if (!run.discovered_application_url) {
    throw new Error('A validated application URL is required before downloading.');
  }

  const downloaded = await downloadApplicationPdfBytes(
    run.discovered_application_url,
    session,
    { downloads: dependencies.downloads }
  );
  const artifact = (dependencies.artifacts || localArtifactStore).savePdf({
    runId: run.id,
    patientId: run.patient_id,
    kind: 'source_pdf',
    bytes: downloaded.bytes,
    pageCount: downloaded.pageCount,
  });
  RunRepository.saveArtifact(artifact);
  RunRepository.update(run.id, { source_pdf_artifact_id: artifact.id });
  RunRepository.appendEvent(run.id, 'action', `Downloaded and checked the ${artifact.page_count}-page application.`);
  return artifact;
}
