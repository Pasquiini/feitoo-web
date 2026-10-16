import { Injectable, signal } from '@angular/core';
import { ProcessingTool, OrganizerOptions, defaultOrganizerOptions } from '../models/processing';

@Injectable({ providedIn: 'root' })
export class FileSelectionService {
  readonly files = signal<readonly File[]>([]);
  continueAfterLogin = false;
  continueTool: ProcessingTool = 'xml-to-excel';
  private readonly productsFiles = signal<readonly File[]>([]);
  private readonly pdfFiles = signal<readonly File[]>([]);
  private readonly organizerFiles = signal<readonly File[]>([]);
  private readonly analyzerFiles = signal<readonly File[]>([]);
  private readonly docxFiles = signal<readonly File[]>([]);
  readonly organizerOptions = signal<OrganizerOptions>({ ...defaultOrganizerOptions });

  forTool(tool: ProcessingTool) {
    return tool === 'docx_to_pdf'
      ? this.docxFiles
      : tool === 'xml-analyzer'
        ? this.analyzerFiles
        : tool === 'xml-organizer'
          ? this.organizerFiles
          : tool === 'xml-to-pdf'
            ? this.pdfFiles
            : tool === 'xml-to-excel'
              ? this.files
              : this.productsFiles;
  }
}
