import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ApplicationRunError } from '../application-agent/errors';
import { getRememberBettyTemplate, type RememberBettyTemplate } from './template-registry';

export interface InspectedPdf {
  sha256: string;
  pageCount: number;
  fieldNames: string[];
}

export async function inspectPdf(bytes: Uint8Array): Promise<InspectedPdf> {
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new ApplicationRunError('PDF_INVALID', 'The downloaded file is not a valid PDF.');
  }

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes);
  } catch {
    throw new ApplicationRunError(
      'PDF_INVALID',
      'The application PDF could not be read or is password protected.'
    );
  }

  if (document.isEncrypted) {
    throw new ApplicationRunError('PDF_INVALID', 'The application PDF is password protected.');
  }

  const pageCount = document.getPageCount();
  if (pageCount < 1) {
    throw new ApplicationRunError('PDF_INVALID', 'The application PDF has no pages.');
  }

  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    pageCount,
    fieldNames: document.getForm().getFields().map((field) => field.getName()),
  };
}

export function requireReviewedTemplate(inspection: InspectedPdf): RememberBettyTemplate {
  const template = getRememberBettyTemplate(inspection.sha256);
  if (!template) {
    throw new ApplicationRunError(
      'PDF_VERSION_UNKNOWN',
      'The foundation published a different application version. It needs review before Apovo can fill it.'
    );
  }

  const knownFields = new Set(inspection.fieldNames);
  for (const fieldName of Object.values(template.fields)) {
    if (!knownFields.has(fieldName)) {
      throw new ApplicationRunError(
        'PDF_VERSION_UNKNOWN',
        'The application fields changed and need review before Apovo can fill the form.'
      );
    }
  }
  return template;
}
