import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildSyntheticDemoPacket } from '../../src/lib/demo-workflow/build-packet';

const fixture = new Uint8Array(
  fs.readFileSync(
    path.resolve(__dirname, '../../../tests/fixtures/remember-betty/current-application.pdf')
  )
);

test('builds a bounded in-memory packet using only the synthetic fixture', async () => {
  const events: string[] = [];
  const result = await buildSyntheticDemoPacket({
    sourcePdfBase64: Buffer.from(fixture).toString('base64'),
    emit: async (event) => { events.push(event.phase); },
  });

  assert.ok(result.byteLength > 0);
  assert.ok(result.byteLength <= 5 * 1024 * 1024);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.pageCount >= 3);
  assert.deepEqual(events, ['filling_form', 'generating_documents', 'packet_ready']);

  const packet = Uint8Array.from(Buffer.from(result.packetBase64, 'base64'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: packet }).promise;
  const text: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text.push(content.items.map((item: { str: string }) => item.str).join(' '));
  }
  const combined = text.join('\n');
  assert.match(combined, /Ava Testperson/);
  assert.match(combined, /TEST ONLY|SYNTHETIC/i);
});

test('rejects corrupt source data before generating documents', async () => {
  await assert.rejects(() =>
    buildSyntheticDemoPacket({
      sourcePdfBase64: Buffer.from('not a pdf').toString('base64'),
      emit: async () => undefined,
    })
  );
});
