import { ProcessingPreview } from '../models/processing';

/** Small, dependency-free PDF summary. Fiscal decimals are formatted as strings. */
export function productsPdf(preview: ProcessingPreview, generatedAt = new Date()): Blob {
  const money = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
  };
  const hex = (value: string) =>
    Array.from(value, (char) => {
      const code = char.charCodeAt(0);
      return (code <= 255 ? code : 63).toString(16).padStart(2, '0');
    }).join('');
  const text = (value: string, x: number, y: number, size = 10, width = 523) => {
    // Bound each text box, including exceptionally long fiscal decimals.
    const horizontalScale = Math.min(100, (width / Math.max(1, value.length * size * 0.65)) * 100);
    return `q ${x} ${y - 4} ${width} ${size + 8} re W n BT /F1 ${size} Tf ${horizontalScale} Tz 1 0 0 1 ${x} ${y} Tm <${hex(value)}> Tj ET Q\n`;
  };
  const rows = (preview.products_preview ?? []).slice(0, 10);
  let stream = '0.07 0.36 0.33 rg 0 735 595 107 re f\n1 1 1 rg\n';
  stream += text('Feitoo | Produtos dos XMLs', 36, 790, 22);
  stream += text(`Gerado em ${generatedAt.toLocaleString('pt-BR')} (horário local)`, 36, 763);
  stream += '0.12 0.2 0.17 rg\n';
  const summary = preview.summary;
  stream += text(
    `${summary.successful_documents_count} NF-es válidas   |   ${summary.items_count} itens   |   ${summary.products_count ?? 0} produtos diferentes`,
    36,
    704,
    12,
  );
  stream += text(`Valor total em produtos: ${money(summary.total_value)}`, 36, 675, 16);
  stream += text('Produtos consolidados | maiores totais primeiro', 36, 630, 13);
  stream += text(
    `Amostra: ${rows.length} de ${summary.products_count ?? 0} produtos. Use o Excel para a versão completa.`,
    36,
    608,
    10,
  );
  stream += '0.93 0.96 0.92 rg 36 570 523 24 re f\n0.12 0.2 0.17 rg\n';
  stream += text('Produto / código / emitente', 44, 579);
  stream += text('Qtd / un.', 340, 579);
  stream += text('Total', 446, 579);
  rows.forEach((row, index) => {
    const y = 552 - index * 45;
    stream += text(row.product.slice(0, 48), 44, y, 10, 282);
    stream += text(
      `${row.code ?? 'Sem código'} | ${row.issuer_name}`.slice(0, 61),
      44,
      y - 15,
      8,
      282,
    );
    stream += text(`${row.total_quantity.replace('.', ',')} ${row.unit}`, 340, y, 9, 96);
    stream += text(money(row.total_value), 446, y, 9, 105);
    stream += `0.83 0.88 0.82 RG 36 ${y - 23} m 559 ${y - 23} l S\n`;
  });
  stream += text(
    'Resumo visual. Descrições longas podem ser abreviadas. O PDF não substitui o Excel.',
    36,
    52,
    9,
  );
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
