import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { assemblePacket } from '../../src/lib/pdf/assemble-packet';
import { renderPersonalNote } from '../../src/lib/pdf/render-personal-note';
import { ApplicationRunError } from '../../src/lib/application-agent/errors';

async function blankPdf(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage([612, 792]);
  return document.save();
}

test('assembles application, diagnosis letter, and personal note in order', async () => {
  const application = await blankPdf(3);
  const letter = await blankPdf(1);
  const note = await renderPersonalNote('Breast cancer changed my life.\n\nIt affected my work and family.');

  const { bytes, pageCount } = await assemblePacket([application, letter, note]);
  assert.equal(pageCount, 5);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 5);
});

test('renders long notes across multiple pages', async () => {
  const note = await renderPersonalNote(Array.from({ length: 200 }, (_, i) => `Sentence ${i} about treatment and recovery.`).join(' '));
  assert.ok((await PDFDocument.load(note)).getPageCount() > 1);
});

test('blocks packets over the eight-page foundation limit', async () => {
  await assert.rejects(
    assemblePacket([await blankPdf(3), await blankPdf(4), await blankPdf(2)]),
    (error: unknown) => error instanceof ApplicationRunError && error.code === 'PACKET_PAGE_LIMIT'
  );
});

test('rejects unreadable packet documents', async () => {
  await assert.rejects(
    assemblePacket([new TextEncoder().encode('%PDF-broken')]),
    (error: unknown) => error instanceof ApplicationRunError && error.code === 'PDF_INVALID'
  );
});
