import { logoDimensions, QuotationLogoLoader } from './quotation-logo';

describe('Quotation local logo headers', () => {
  const png = (width: number, height: number) => {
    const bytes = new Uint8Array(45);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([73, 72, 68, 82], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    bytes.set([73, 69, 78, 68], 37);
    return bytes;
  };
  it('reads PNG and JPEG dimensions before decoding', () => {
    expect(logoDimensions(png(240, 100))).toEqual({ type: 'image/png', width: 240, height: 100 });
    const jpeg = new Uint8Array([
      255, 216, 255, 192, 0, 17, 8, 0, 100, 0, 240, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
    ]);
    expect(logoDimensions(jpeg)).toEqual({ type: 'image/jpeg', width: 240, height: 100 });
  });
  it('rejects SVG, arbitrary bytes, truncation and animated PNG', () => {
    expect(() => logoDimensions(new TextEncoder().encode('<svg></svg>'))).toThrow();
    expect(() => logoDimensions(new Uint8Array([137, 80, 78, 71]))).toThrow();
    const animated = png(1, 1);
    animated.set([97, 99, 84, 76], 37);
    expect(() => logoDimensions(animated)).toThrow();
  });
  it('rejects oversized files, false MIME and excessive dimensions before browser APIs', async () => {
    const loader = new QuotationLogoLoader();
    await expect(loader.prepare({ size: 2097153 } as File)).rejects.toThrow();
    await expect(
      loader.prepare({
        size: 45,
        type: 'image/jpeg',
        arrayBuffer: async () => png(1, 1).buffer,
      } as File),
    ).rejects.toThrow();
    await expect(
      loader.prepare({
        size: 45,
        type: 'image/png',
        arrayBuffer: async () => png(100000, 100000).buffer,
      } as File),
    ).rejects.toThrow();
  });
});
