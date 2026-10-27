import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { QuotationEditorValue } from '../models/quotation';

export interface RemoteDraft {
  uuid: string;
  revision: number;
  schema_version: 1;
  payload: QuotationEditorValue;
  logo_checksum: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
export interface LocalDraft {
  generationRequest?: { revision: number; key: string; source?: 'free' | 'pro' | 'credit' };
  id: string;
  schemaVersion: 1;
  localRevision: number;
  ownerId: number | null;
  payload: QuotationEditorValue;
  logo: Blob | null;
  logoDirty: boolean;
  remote: RemoteDraft | null;
  importKey: string;
  importPayload: QuotationEditorValue | null;
  dirty: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
export class LocalDraftConflict extends Error {
  constructor(readonly source: 'local' | 'remote' = 'local') {
    super('draft conflict');
  }
}
export const draftLifetime = 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class QuotationLocalStore {
  static readonly marker = 'feitoo.quotation.context';
  readonly changes = new Subject<string>();
  private channel: BroadcastChannel | null = null;

  connect(): void {
    if (!this.channel && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('feitoo-quotation-drafts');
      this.channel.onmessage = (event) => {
        if (typeof event.data === 'string') this.changes.next(event.data);
      };
    }
  }
  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponível');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('feitoo-quotation-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Não foi possível abrir os rascunhos'));
      request.onblocked = () => reject(new Error('Armazenamento bloqueado'));
    });
  }
  private async transaction<T>(
    action: (store: IDBObjectStore, done: (value: T) => void) => void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      let result: T;
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(new Error('Não foi possível salvar o rascunho'));
      };
      try {
        action(tx.objectStore('drafts'), (value) => {
          result = value;
        });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }
  async read(ownerId: number | null): Promise<{ draft: LocalDraft | null; expired: boolean }> {
    const context = sessionStorage.getItem(QuotationLocalStore.marker);
    const result = await this.transaction<{ draft: LocalDraft | null; expired: boolean }>(
      (store, done) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const rows = request.result as LocalDraft[];
          const matching = rows.filter((d) => d.ownerId === ownerId && d.schemaVersion === 1);
          const selected =
            matching.find((d) => d.id === context) ??
            matching.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          for (const row of rows)
            if (row.expiresAt <= Date.now() || row.schemaVersion !== 1) store.delete(row.id);
          done({
            draft: selected && selected.expiresAt > Date.now() ? selected : null,
            expired: !!selected && selected.expiresAt <= Date.now(),
          });
        };
      },
    );
    if (result.draft) sessionStorage.setItem(QuotationLocalStore.marker, result.draft.id);
    return result;
  }
  async get(id: string): Promise<LocalDraft | null> {
    return this.transaction((store, done) => {
      const request = store.get(id);
      request.onsuccess = () =>
        done(request.result?.expiresAt > Date.now() ? request.result : null);
    });
  }
  async write(draft: LocalDraft): Promise<LocalDraft> {
    sessionStorage.setItem(QuotationLocalStore.marker, draft.id);
    const result = await this.transaction<LocalDraft | null>((store, done) => {
      const request = store.get(draft.id);
      request.onsuccess = () => {
        const previous = request.result as LocalDraft | undefined;
        // Deleted records must not be resurrected by an old tab or a late response.
        if ((previous?.localRevision ?? 0) !== draft.localRevision) {
          done(null);
          return;
        }
        const next = { ...draft, localRevision: draft.localRevision + 1 };
        try {
          store.put(next);
          done(next);
        } catch {
          store.transaction.abort();
        }
      };
    });
    if (!result) throw new LocalDraftConflict();
    this.channel?.postMessage(draft.id);
    return result;
  }
  async remove(id: string, expectedRevision?: number): Promise<void> {
    const removed = await this.transaction<boolean>((store, done) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (
          request.result &&
          expectedRevision !== undefined &&
          request.result.localRevision !== expectedRevision
        ) {
          done(false);
          return;
        }
        store.delete(id);
        done(true);
      };
    });
    if (!removed) throw new LocalDraftConflict();
    this.channel?.postMessage(id);
  }
  async clearAccounts(): Promise<void> {
    await this.transaction<void>((store, done) => {
      const request = store.getAll();
      request.onsuccess = () => {
        for (const row of request.result as LocalDraft[])
          if (row.ownerId !== null) store.delete(row.id);
        done();
      };
    });
    this.connect();
    this.changes.next('accounts-cleared');
    this.channel?.postMessage('accounts-cleared');
  }
}
