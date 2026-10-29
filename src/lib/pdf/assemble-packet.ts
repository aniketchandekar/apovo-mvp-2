import { PDFDocument } from 'pdf-lib';
import { ApplicationRunError } from '../application-agent/errors';
import { PACKET_PAGE_LIMIT } from './template-registry';

export async function assemblePacket(
  parts: Uint8Array[]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (parts.length === 0) {
    throw new ApplicationRunError('PACKET_INCOMPLETE', 'The application packet has no documents.');
  }

  const output = await PDFDocument.create();
  for (const part of parts) {
    let document: PDFDocument;
    try {
      document = await PDFDocument.load(part);
    } catch {
      throw new ApplicationRunError('PDF_INVALID', 'A packet document could not be read.');
    }
    const form = document.getForm();
    if (form.getFields().length > 0) form.flatten();
    const pages = await output.copyPages(document, document.getPageIndices());
    for (const page of pages) output.addPage(page);
  }

  const pageCount = output.getPageCount();
  if (pageCount > PACKET_PAGE_LIMIT) {
    throw new ApplicationRunError(
      'PACKET_PAGE_LIMIT',
      `The packet is ${pageCount} pages, but the foundation accepts at most ${PACKET_PAGE_LIMIT}. Use a shorter personal note or diagnosis letter.`
    );
  }

  return { bytes: await output.save(), pageCount };
}
