import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const BODY_SIZE = 12;
const LINE_HEIGHT = 18;

function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function renderPersonalNote(note: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  page.drawText('Personal Note', { x: MARGIN, y, size: 18, font: bold });
  y -= 36;

  for (const paragraph of note.trim().split(/\n\s*\n/)) {
    for (const line of paragraph.split('\n').flatMap((part) => wrapParagraph(part, font, BODY_SIZE, maxWidth))) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font });
      y -= LINE_HEIGHT;
    }
    y -= LINE_HEIGHT / 2;
  }

  return document.save();
}
