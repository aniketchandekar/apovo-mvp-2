import { REMEMBER_BETTY_SYNTHETIC_APPLICANT } from '../application-agent/test-fixtures/remember-betty';
import { ApplicationRunError } from '../application-agent/errors';
import { assemblePacket } from './assemble-packet';
import { fillRememberBettyApplication } from './fill-application';
import { inspectPdf, requireReviewedTemplate } from './inspect-pdf';
import {
  markPdfAsSyntheticTest,
  renderSyntheticDiagnosisLetter,
  renderSyntheticPersonalNote,
} from './render-synthetic-test-documents';

export async function fillRememberBettySyntheticApplication(
  sourceBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const template = requireReviewedTemplate(await inspectPdf(sourceBytes));
  const values = REMEMBER_BETTY_SYNTHETIC_APPLICANT.values;
  for (const key of Object.keys(template.fields)) {
    if (!values[key as keyof typeof values]?.trim()) {
      throw new ApplicationRunError(
        'PACKET_INCOMPLETE',
        'The synthetic fixture does not cover every reviewed application field.'
      );
    }
  }

  const filled = await fillRememberBettyApplication(sourceBytes, template, values);
  return { bytes: await markPdfAsSyntheticTest(filled.bytes), pageCount: filled.pageCount };
}

export async function buildRememberBettySyntheticSupportingDocuments(): Promise<{
  diagnosisLetter: Uint8Array;
  personalNote: Uint8Array;
}> {
  const values = REMEMBER_BETTY_SYNTHETIC_APPLICANT.values;
  const diagnosisLetter = await renderSyntheticDiagnosisLetter({
    applicantName: values.full_name,
    ...REMEMBER_BETTY_SYNTHETIC_APPLICANT.diagnosisLetter,
  });
  const personalNote = await renderSyntheticPersonalNote({
    applicantName: values.full_name,
    body: REMEMBER_BETTY_SYNTHETIC_APPLICANT.personalNote,
  });

  return { diagnosisLetter, personalNote };
}

export async function buildRememberBettySyntheticTestPacket(
  sourceBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const application = await fillRememberBettySyntheticApplication(sourceBytes);
  const { diagnosisLetter, personalNote } =
    await buildRememberBettySyntheticSupportingDocuments();

  return assemblePacket([application.bytes, diagnosisLetter, personalNote]);
}
