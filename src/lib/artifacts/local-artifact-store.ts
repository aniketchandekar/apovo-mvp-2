import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApplicationRunError } from '../application-agent/errors';
import type { ApplicationArtifact } from '../application-agent/types';
import type { ArtifactStore, SavePdfArtifactInput } from './types';

const DEFAULT_ARTIFACT_DIR = path.join(process.cwd(), '.data', 'artifacts');

function isWithinDirectory(baseDirectory: string, candidatePath: string): boolean {
  const relative = path.relative(baseDirectory, candidatePath);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export class LocalArtifactStore implements ArtifactStore {
  private readonly baseDirectory: string;

  constructor(baseDirectory = process.env.APOVO_ARTIFACT_DIR || DEFAULT_ARTIFACT_DIR) {
    this.baseDirectory = path.resolve(/* turbopackIgnore: true */ baseDirectory);
  }

  savePdf(input: SavePdfArtifactInput): ApplicationArtifact {
    if (input.pageCount < 1 || !Number.isInteger(input.pageCount)) {
      throw new ApplicationRunError('PDF_INVALID', 'The PDF page count is invalid.');
    }

    const id = `artifact_${crypto.randomUUID()}`;
    const filename = `${id}.pdf`;
    const privatePath = path.join(this.baseDirectory, filename);

    fs.mkdirSync(this.baseDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(privatePath, input.bytes, { mode: 0o600, flag: 'wx' });

    return {
      id,
      run_id: input.runId,
      patient_id: input.patientId,
      kind: input.kind,
      private_path: privatePath,
      mime_type: 'application/pdf',
      sha256: crypto.createHash('sha256').update(input.bytes).digest('hex'),
      byte_size: input.bytes.byteLength,
      page_count: input.pageCount,
      created_at: new Date().toISOString(),
    };
  }

  readPdf(
    artifact: ApplicationArtifact,
    ownership: { runId: string; patientId: string }
  ): Uint8Array {
    if (
      artifact.run_id !== ownership.runId ||
      artifact.patient_id !== ownership.patientId ||
      artifact.mime_type !== 'application/pdf'
    ) {
      throw new ApplicationRunError('ARTIFACT_NOT_FOUND', 'The PDF artifact was not found.');
    }

    const resolvedPath = path.resolve(artifact.private_path);
    if (!isWithinDirectory(this.baseDirectory, resolvedPath)) {
      throw new ApplicationRunError('ARTIFACT_NOT_FOUND', 'The PDF artifact was not found.');
    }

    try {
      return fs.readFileSync(resolvedPath);
    } catch {
      throw new ApplicationRunError('ARTIFACT_NOT_FOUND', 'The PDF artifact was not found.');
    }
  }
}

export const localArtifactStore = new LocalArtifactStore();
