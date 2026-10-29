import type { BrowserAutomationSession } from '../integrations/browserbase/types';
import type { EmitDemoWorkflowEvent } from './types';

interface DownloadedPdf {
  bytes: Uint8Array;
  pageCount: number;
  sha256: string;
}

interface BrowserDiscoveryInput {
  runId: string;
  startSession: (runId: string) => Promise<BrowserAutomationSession>;
  inspectSite: (
    session: BrowserAutomationSession
  ) => Promise<{ applicationUrl: string; label: string }>;
  downloadPdf: (
    applicationUrl: string,
    session: BrowserAutomationSession
  ) => Promise<DownloadedPdf>;
  emit: EmitDemoWorkflowEvent;
}

export interface SyntheticBrowserDiscoveryResult {
  bytesBase64: string;
  byteLength: number;
  pageCount: number;
  sha256: string;
}

export async function runSyntheticBrowserDiscovery(
  input: BrowserDiscoveryInput
): Promise<SyntheticBrowserDiscoveryResult> {
  const session = await input.startSession(input.runId);
  try {
    await input.emit({
      phase: 'browser_live',
      message: 'Opened the official Remember Betty assistance page.',
      liveViewUrl: session.liveViewUrl,
    });
    const inspected = await input.inspectSite(session);
    await input.emit({
      phase: 'site_inspected',
      message: 'Found the current Remember Betty application PDF.',
    });
    const pdf = await input.downloadPdf(inspected.applicationUrl, session);
    const result = {
      bytesBase64: Buffer.from(pdf.bytes).toString('base64'),
      byteLength: pdf.bytes.byteLength,
      pageCount: pdf.pageCount,
      sha256: pdf.sha256,
    };
    await input.emit({
      phase: 'source_ready',
      message: `Downloaded and validated the ${pdf.pageCount}-page application.`,
    });
    return result;
  } finally {
    await session.close();
  }
}
