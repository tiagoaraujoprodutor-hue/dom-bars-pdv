import PDFDocument from 'pdfkit';

export interface ReportSection {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
  /** Linha de totalização opcional (mesma largura de columns). */
  total?: (string | number)[];
}

export interface ReportSpec {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
}

const PAGE_MARGIN = 40;

/** Renderiza um relatório estruturado em PDF (A4) e devolve um Buffer. */
export function renderPdf(spec: ReportSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).fillColor('#111111').text(spec.title);
    if (spec.subtitle) {
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#666666').text(spec.subtitle);
    }
    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    doc.moveDown(1);

    for (const section of spec.sections) {
      renderSection(doc, section);
    }

    doc.end();
  });
}

function renderSection(doc: PDFKit.PDFDocument, section: ReportSection): void {
  if (doc.y > doc.page.height - 120) doc.addPage();

  doc.fontSize(13).fillColor('#111111').text(section.heading);
  doc.moveDown(0.4);

  const startX = PAGE_MARGIN;
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = usableWidth / section.columns.length;

  const writeRow = (cells: (string | number)[], bold: boolean): void => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    const y = doc.y;
    doc.fontSize(9).fillColor(bold ? '#111111' : '#333333');
    cells.forEach((cell, i) => {
      const align = i === 0 ? 'left' : 'right';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(String(cell), startX + i * colWidth, y, { width: colWidth - 6, align });
    });
    doc.font('Helvetica');
    doc.moveDown(0.2);
  };

  writeRow(section.columns, true);
  doc
    .moveTo(startX, doc.y)
    .lineTo(startX + usableWidth, doc.y)
    .strokeColor('#cccccc')
    .stroke();
  doc.moveDown(0.2);

  if (section.rows.length === 0) {
    doc.fontSize(9).fillColor('#999999').text('Sem registros.', startX, doc.y);
    doc.moveDown(0.3);
  } else {
    for (const row of section.rows) writeRow(row, false);
  }

  if (section.total) {
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + usableWidth, doc.y)
      .strokeColor('#cccccc')
      .stroke();
    doc.moveDown(0.2);
    writeRow(section.total, true);
  }

  doc.moveDown(1);
}
