import type { jsPDF } from 'jspdf';

import { documentText, type ReportDocumentTexts } from './reportDocument';

type ReportInput = {
  name: string;
  primaryType: string;
  aptitudeDescription: string;
  documentTexts?: ReportDocumentTexts;
};

type TemplatePage = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

type TemplateGraphics = {
  firstPageCorner: HTMLImageElement;
  followingPageCorner: HTMLImageElement;
  footer: HTMLImageElement;
};

const pageWidth = 1224;
const pageHeight = 1584;
const contentLeft = 144;
const contentRight = pageWidth - 144;
const contentTop = 116;
const contentBottom = 1380;
const fontFamily = '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif';
const firstPageCornerSource = new URL('../assets/report-first-page-corner.png', import.meta.url).href;
const followingPageCornerSource = new URL('../assets/report-following-page-corner.png', import.meta.url).href;
const footerSource = new URL('../assets/report-footer.png', import.meta.url).href;

function createPage(firstPage: boolean, graphics: TemplateGraphics): TemplatePage {
  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF 캔버스를 준비하지 못했습니다.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pageWidth, pageHeight);
  if (firstPage) context.drawImage(graphics.firstPageCorner, 1044, -11, 180, 180);
  else context.drawImage(graphics.followingPageCorner, 973, -11, 251, 251);
  context.drawImage(graphics.footer, 0, 1416, pageWidth, 168);
  context.fillStyle = '#000000';
  (context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0.8px';
  return { canvas, context };
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('결과지 템플릿 그래픽을 불러오지 못했습니다.'));
    image.src = source;
  });
}

function linesFor(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const character of text.replace(/\s+/g, ' ').trim()) {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line.trim());
      line = character === ' ' ? '' : character;
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function writeLines(context: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function addCanvasPage(pdf: jsPDF, page: TemplatePage, firstPage: boolean) {
  if (!firstPage) pdf.addPage('letter', 'portrait');
  pdf.addImage(page.canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 215.9, 279.4, undefined, 'FAST');
}

export async function createReportPdf(input: ReportInput) {
  const { jsPDF } = await import('jspdf');
  const [firstPageCorner, followingPageCorner, footer] = await Promise.all([
    loadImage(firstPageCornerSource),
    loadImage(followingPageCornerSource),
    loadImage(footerSource),
  ]);
  const graphics = { firstPageCorner, followingPageCorner, footer };
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
  const pages: TemplatePage[] = [createPage(true, graphics)];
  let currentPage = pages[0];
  let y = contentTop;

  const nextPage = () => {
    currentPage = createPage(false, graphics);
    pages.push(currentPage);
    y = contentTop;
  };

  const writeWorkbookAnalysis = (text: string, font: string, lineHeight: number, paragraphGap: number) => {
    const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      currentPage.context.font = font;
      const lines = linesFor(currentPage.context, paragraph, contentRight - contentLeft);
      let offset = 0;
      while (offset < lines.length) {
        if (y + lineHeight > contentBottom) nextPage();
        const lineCapacity = Math.max(1, Math.floor((contentBottom - y) / lineHeight));
        const pageLines = lines.slice(offset, offset + lineCapacity);
        currentPage.context.font = font;
        y = writeLines(currentPage.context, pageLines, contentLeft, y, lineHeight);
        offset += pageLines.length;
        if (offset < lines.length) nextPage();
      }
      y += paragraphGap;
      if (y + lineHeight > contentBottom) nextPage();
    }
  };

  {
    const { context } = currentPage;
    context.font = `700 30px ${fontFamily}`;
    const title = documentText(input.documentTexts, 'document_title');
    context.fillText(title, (pageWidth - context.measureText(title).width) / 2, y + 30);
    y += 92;
    context.font = `500 21px ${fontFamily}`;
    context.fillText(`${documentText(input.documentTexts, 'profile_name_label')}: ${input.name},       ${documentText(input.documentTexts, 'profile_type_label')}: ${input.primaryType}`, contentLeft, y);
    y += 74;
    context.font = `700 22px ${fontFamily}`;
    context.fillText(documentText(input.documentTexts, 'primary_heading'), contentLeft, y);
    y += 42;
  }

  // The selected type's detail is the exact text from the workbook analysis
  // sheet. No extra interpretation, notice, or all-type reference copy is
  // added to the report.
  writeWorkbookAnalysis(input.aptitudeDescription, `500 20px ${fontFamily}`, 32, 32);

  pages.forEach((page, index) => addCanvasPage(pdf, page, index === 0));
  return pdf.output('blob');
}
