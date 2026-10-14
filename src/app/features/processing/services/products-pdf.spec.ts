import { describe, expect, it } from 'vitest';
import { productsPdf } from './products-pdf';
import { ProcessingPreview } from '../models/processing';

describe('Products PDF', () => {
  it('creates a bounded PDF with valid offsets, exact money, accents and untrusted text as data', async () => {
    const product = {
      product: 'Café (teste) <script>',
      code: '001',
      issuer_name: 'Fornecedor',
      unit: 'UN',
      total_quantity: '2.00',
      total_value: '9007199254740993.29',
    };
    const preview = {
      summary: {
        successful_documents_count: 3,
        items_count: 15,
        products_count: 12,
        total_value: product.total_value,
        failed_documents_count: 0,
        documents_without_total_count: 0,
      },
      products_preview: Array.from({ length: 12 }, () => product),
      notes_preview: [],
      items_preview: [],
    } as unknown as ProcessingPreview;
    const blob = productsPdf(preview, new Date('2026-10-14T12:00:00Z'));
    expect(blob.type).toBe('application/pdf');
    const pdf = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.match(/436166e9/g)?.length).toBe(10);
    expect(pdf).not.toContain('<script>');
    const decode = (hex: string) =>
      hex.replace(/../g, (part) => String.fromCharCode(parseInt(part, 16)));
    const content = [...pdf.matchAll(/<([0-9a-f]+)> Tj/g)]
      .map((match) => decode(match[1]))
      .join('\n');
    expect(content).toContain('R$ 9.007.199.254.740.993,29');
    expect(content).toContain('Amostra: 10 de 12 produtos');
    const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    for (const [index, match] of [...pdf.matchAll(/(\d{10}) 00000 n/g)].entries()) {
      expect(pdf.slice(Number(match[1]))).toMatch(new RegExp(`^${index + 1} 0 obj`));
    }
  });
});
