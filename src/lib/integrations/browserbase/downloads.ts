import crypto from 'node:crypto';
import { ApplicationRunError } from '../../application-agent/errors';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_PDF_BYTES = 15 * 1024 * 1024;

export interface SessionDownloadsClient {
  list(sessionId: string): Promise<Response>;
  get(downloadId: string): Promise<Response>;
}

export interface DownloadPollingOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxPdfBytes?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface DownloadMetadata {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
}

function safeLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
}

function parseDownloadList(payload: unknown): DownloadMetadata[] {
  const downloads = (payload as { downloads?: unknown })?.downloads;
  if (!Array.isArray(downloads)) {
    throw new ApplicationRunError('DOWNLOAD_INVALID', 'The download list could not be read.', true);
  }
  return downloads.filter(
    (entry): entry is DownloadMetadata =>
      typeof entry === 'object' && entry !== null && typeof (entry as DownloadMetadata).id === 'string'
  );
}

export async function pollForSessionPdf(
  client: SessionDownloadsClient,
  sessionId: string,
  options: DownloadPollingOptions = {}
): Promise<Uint8Array> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPdfBytes = options.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
  const sleep =
    options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const response = await client.list(sessionId);
    if (response.ok) {
      const pdfs = parseDownloadList(await response.json()).filter(
        (entry) =>
          entry.mimeType === 'application/pdf' || entry.filename?.toLowerCase().endsWith('.pdf')
      );
      if (pdfs.length > 1) {
        throw new ApplicationRunError('DOWNLOAD_AMBIGUOUS', 'More than one PDF was downloaded.');
      }

      if (pdfs.length === 1) {
        const metadata = pdfs[0];
        if (metadata.size !== undefined && metadata.size > maxPdfBytes) {
          throw new ApplicationRunError('DOWNLOAD_INVALID', 'The downloaded PDF is too large.');
        }

        const fileResponse = await client.get(metadata.id);
        if (!fileResponse.ok) {
          throw new ApplicationRunError(
            'DOWNLOAD_INVALID',
            'The application PDF could not be downloaded.',
            true
          );
        }
        const pdf = new Uint8Array(await fileResponse.arrayBuffer());
        if (pdf.byteLength > maxPdfBytes) {
          throw new ApplicationRunError('DOWNLOAD_INVALID', 'The downloaded PDF is too large.');
        }
        if (!isPdf(pdf)) {
          throw new ApplicationRunError('DOWNLOAD_INVALID', 'The downloaded file is not a valid PDF.');
        }
        if (
          metadata.checksum &&
          crypto.createHash('sha256').update(pdf).digest('hex') !== metadata.checksum.toLowerCase()
        ) {
          throw new ApplicationRunError('DOWNLOAD_INVALID', 'The downloaded PDF failed its integrity check.');
        }
        return pdf;
      }
    } else if (response.status !== 404 && response.status !== 409) {
      throw new ApplicationRunError('DOWNLOAD_INVALID', 'The application PDF could not be downloaded.', true);
    }

    if (Date.now() >= deadline) break;
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  }

  throw new ApplicationRunError('DOWNLOAD_TIMEOUT', 'The application PDF download timed out.', true);
}

export function browserbaseDownloadLimits() {
  return {
    maxPdfBytes: safeLimit(process.env.APPLICATION_PDF_MAX_BYTES, DEFAULT_MAX_PDF_BYTES),
  };
}
