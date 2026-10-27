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

  // Short-lived browser handoff across Google navigation; never sent to analytics.
  private handoffDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('feitoo-selection-handoff', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('selection');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('selection', 'readwrite');
        const cursor = tx.objectStore('selection').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          if (row.value.expires <= Date.now()) row.delete();
          row.continue();
        };
        tx.oncomplete = () => resolve(db);
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }
  discardHandoff(tool: ProcessingTool): void {
    if (
      typeof sessionStorage === 'undefined' ||
      sessionStorage.getItem('feitoo-selection-tool') !== tool
    )
      return;
    sessionStorage.removeItem('feitoo-selection-tool');
    void this.handoffDb()
      .then((db) => {
        const tx = db.transaction('selection', 'readwrite');
        tx.objectStore('selection').delete(tool);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      })
      .catch(() => {
        /* Browser storage is optional after processing. */
      });
  }
  async preserveForGoogle(tool: ProcessingTool): Promise<void> {
    const files = this.forTool(tool)();
    if (!files.length) return;
    const db = await this.handoffDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('selection', 'readwrite');
        tx.objectStore('selection').put(
          { files: [...files], expires: Date.now() + 15 * 60000 },
          tool,
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      sessionStorage.setItem('feitoo-selection-tool', tool);
    } finally {
      db.close();
    }
  }
  async restoreGoogle(tool: ProcessingTool): Promise<boolean> {
    if (sessionStorage.getItem('feitoo-selection-tool') !== tool) return false;
    const db = await this.handoffDb();
    try {
      const saved = await new Promise<{ files: File[]; expires: number } | undefined>(
        (resolve, reject) => {
          const tx = db.transaction('selection', 'readwrite');
          const store = tx.objectStore('selection');
          const request = store.get(tool);
          store.delete(tool);
          tx.oncomplete = () => resolve(request.result);
          tx.onerror = () => reject(tx.error);
        },
      );
      sessionStorage.removeItem('feitoo-selection-tool');
      if (saved && saved.expires > Date.now() && !this.forTool(tool)().length) {
        this.forTool(tool).set(saved.files);
        return true;
      }
      return false;
    } finally {
      db.close();
    }
  }

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
