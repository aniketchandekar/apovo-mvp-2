import { createHash } from 'node:crypto';
import { assemblePacket } from '../pdf/assemble-packet';
import {
  buildRememberBettySyntheticSupportingDocuments,
  fillRememberBettySyntheticApplication,
} from '../pdf/build-remember-betty-test-packet';
import type { EmitDemoWorkflowEvent } from './types';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_PACKET_BYTES = 5 * 1024 * 1024;

function decodePdf(base64: string) {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  if (
    bytes.byteLength < 8 ||
    bytes.byteLength > MAX_SOURCE_BYTES ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-'
  ) {
    throw new Error('The workflow source is not a valid bounded PDF.');
  }
  return bytes;
}

export async function buildSyntheticDemoPacket(input: {
  sourcePdfBase64: string;
  emit: EmitDemoWorkflowEvent;
}) {
  const source = decodePdf(input.sourcePdfBase64);
  await input.emit({
    phase: 'filling_form',
    message: 'Filling the application with the versioned synthetic applicant.',
  });
  const filled = await fillRememberBettySyntheticApplication(source);

  await input.emit({
    phase: 'generating_documents',
    message: 'Generating synthetic diagnosis and personal-note documents.',
  });
  const supporting = await buildRememberBettySyntheticSupportingDocuments();
  const assembled = await assemblePacket([
    filled.bytes,
    supporting.diagnosisLetter,
    supporting.personalNote,
  ]);
  if (assembled.bytes.byteLength > MAX_PACKET_BYTES) {
    throw new Error('The synthetic packet exceeds the five megabyte demo limit.');
  }

  const result = {
    packetBase64: Buffer.from(assembled.bytes).toString('base64'),
    byteLength: assembled.bytes.byteLength,
    pageCount: assembled.pageCount,
    sha256: createHash('sha256').update(assembled.bytes).digest('hex'),
  };
  await input.emit({
    phase: 'packet_ready',
    message: `Assembled a ${assembled.pageCount}-page synthetic test packet for review.`,
    packet: {
      base64: result.packetBase64,
      byteLength: result.byteLength,
      pageCount: result.pageCount,
      sha256: result.sha256,
    },
  });
  return result;
}
