import { Injectable, signal } from '@angular/core';
import { ProcessingTool } from '../models/processing';

@Injectable({ providedIn: 'root' })
export class XmlSelectionService {
  readonly files = signal<readonly File[]>([]);
  continueAfterLogin = false;
  continueTool: ProcessingTool = 'xml-to-excel';
  private readonly productsFiles = signal<readonly File[]>([]);

  forTool(tool: ProcessingTool) {
    return tool === 'xml-to-excel' ? this.files : this.productsFiles;
  }
}
