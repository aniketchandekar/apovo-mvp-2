import type { ApplicationArtifact, ArtifactKind } from '../application-agent/types';

export interface SavePdfArtifactInput {
  runId: string;
  patientId: string;
  kind: ArtifactKind;
  bytes: Uint8Array;
  pageCount: number;
}

export interface ArtifactStore {
  savePdf(input: SavePdfArtifactInput): ApplicationArtifact;
  readPdf(
    artifact: ApplicationArtifact,
    ownership: { runId: string; patientId: string }
  ): Uint8Array;
}
