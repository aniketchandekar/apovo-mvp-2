import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { buildRememberBettySyntheticTestPacket } from '../../src/lib/pdf/build-remember-betty-test-packet';

const fixture = new Uint8Array(
  fs.readFileSync(path.resolve(__dirname, '../../../tests/fixtures/remember-betty/current-application.pdf'))
);

test('builds a complete marked synthetic packet without patient input', async () => {
  const result = await buildRememberBettySyntheticTestPacket(fixture);
  const document = await PDFDocument.load(result.bytes);
  assert.equal(result.pageCount, 5);
  assert.equal(document.getPageCount(), 5);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const rendered = await pdfjs.getDocument({ data: Uint8Array.from(result.bytes) }).promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= rendered.numPages; pageNumber += 1) {
    const page = await rendered.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item: { str: string }) => item.str).join(' '));
  }
  const text = pageTexts.join('\n');
  assert.match(text, /Ava Testperson/);
  assert.match(text, /TEST ONLY/);
  assert.match(text, /Synthetic Diagnosis Confirmation/);
  assert.match(text, /Synthetic Personal Note/);
  assert.doesNotMatch(text, /Elena Morales/);
});
