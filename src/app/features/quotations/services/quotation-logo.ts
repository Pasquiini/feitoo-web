import { Injectable } from '@angular/core';
import { quotationLimits } from '../models/quotation';

export interface LocalQuotationLogo {
  blob?: Blob;
  url: string;
  width: number;
  height: number;
}
const invalid = () =>
  new Error('Escolha um PNG ou JPEG válido, de até 2 MB e 4 milhões de pixels.');

export function logoDimensions(bytes: Uint8Array): { type: string; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length > 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) &&
    String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR'
  ) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset);
      if (String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === 'acTL') throw invalid();
      if (offset + 12 + size > bytes.length) throw invalid();
      offset += size + 12;
    }
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) throw invalid();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw invalid();
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 8
      )
        return {
          type: 'image/jpeg',
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
        };
      offset += length;
    }
  }
  throw invalid();
}

@Injectable({ providedIn: 'root' })
export class QuotationLogoLoader {
  async prepare(file: File): Promise<LocalQuotationLogo> {
    if (!file.size || file.size > quotationLimits.logoBytes) throw invalid();
    const dimensions = logoDimensions(new Uint8Array(await file.arrayBuffer()));
    if (
      (file.type && file.type !== dimensions.type) ||
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width * dimensions.height > quotationLimits.logoPixels
    )
      throw invalid();
    const source = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        const timer = setTimeout(() => {
          element.src = '';
          reject(invalid());
        }, 10000);
        element.onload = () => {
          clearTimeout(timer);
          resolve(element);
        };
        element.onerror = () => {
          clearTimeout(timer);
          reject(invalid());
        };
        element.src = source;
      });
      if (image.naturalWidth !== dimensions.width || image.naturalHeight !== dimensions.height)
        throw invalid();
      const scale = Math.min(
        1,
        quotationLimits.logoSide / Math.max(dimensions.width, dimensions.height),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(dimensions.width * scale));
      canvas.height = Math.max(1, Math.round(dimensions.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw invalid();
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png || png.size > quotationLimits.logoBytes) throw invalid();
      return {
        blob: png,
        url: URL.createObjectURL(png),
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      URL.revokeObjectURL(source);
    }
  }
}
