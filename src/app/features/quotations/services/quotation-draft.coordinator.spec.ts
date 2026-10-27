import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { Mock } from 'vitest';
import { QuotationEditorValue } from '../models/quotation';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationDraftCoordinator } from './quotation-draft.coordinator';
import { QuotationDraftApi } from './quotation-draft-api.service';
import { createQuotationForm } from './quotation-form';
import {
  draftLifetime,
  LocalDraft,
  LocalDraftConflict,
  QuotationLocalStore,
  RemoteDraft,
} from './quotation-local.store';

describe('quotation draft coordination', () => {
  const user = signal<{ id: number } | null>(null);
  const ready = signal(true);
  let rows: Map<string, LocalDraft>;
  let store: {
    changes: Subject<string>;
    connect: Mock;
    read: Mock;
    get: Mock;
    write: Mock;
    remove: Mock;
  };
  let api: Record<'latest' | 'read' | 'create' | 'update' | 'setLogo' | 'logo' | 'remove', Mock>;
  let coordinator: QuotationDraftCoordinator;
  let view: {
    payload: ReturnType<ReturnType<typeof createQuotationForm>['getRawValue']>;
    logo: Blob | null;
  };
  let restore: (snapshot: { payload: QuotationEditorValue; logo: Blob | null } | null) => void;
  const settle = async () => {
    TestBed.tick();
    for (let i = 0; i < 25; i++) await Promise.resolve();
  };
  const remote = (revision = 1): RemoteDraft => ({
    uuid: 'remote-1',
    revision,
    schema_version: 1,
    payload: structuredClone(view.payload),
    logo_checksum: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + draftLifetime).toISOString(),
  });
  const local = (ownerId: number | null = null): LocalDraft => ({
    id: 'local-1',
    schemaVersion: 1,
    localRevision: 1,
    ownerId,
    payload: structuredClone(view.payload),
    logo: view.logo,
    logoDirty: false,
    remote: null,
    importKey: 'import-1',
    importPayload: null,
    dirty: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + draftLifetime,
  });
  beforeEach(() => {
    sessionStorage.clear();
    rows = new Map();
    user.set(null);
    ready.set(true);
    view = { payload: createQuotationForm().getRawValue(), logo: null };
    restore = vi.fn((snapshot) => {
      view = snapshot
        ? { payload: snapshot.payload, logo: snapshot.logo }
        : { payload: createQuotationForm().getRawValue(), logo: null };
    });
    store = {
      changes: new Subject<string>(),
      connect: vi.fn(),
      read: vi.fn(async (owner: number | null) => ({
        draft: [...rows.values()].find((r) => r.ownerId === owner) ?? null,
        expired: false,
      })),
      get: vi.fn(async (id: string) => rows.get(id) ?? null),
      write: vi.fn(async (record: LocalDraft) => {
        if ((rows.get(record.id)?.localRevision ?? 0) !== record.localRevision)
          throw new LocalDraftConflict();
        const next = {
          ...record,
          payload: structuredClone(record.payload),
          localRevision: record.localRevision + 1,
        };
        sessionStorage.setItem(QuotationLocalStore.marker, next.id);
        rows.set(next.id, next);
        return next;
      }),
      remove: vi.fn(async (id: string, expectedRevision?: number) => {
        if (
          rows.has(id) &&
          expectedRevision !== undefined &&
          rows.get(id)!.localRevision !== expectedRevision
        )
          throw new LocalDraftConflict();
        rows.delete(id);
      }),
    };
    api = {
      latest: vi.fn(async () => null),
      read: vi.fn(async () => remote(2)),
      create: vi.fn(async () => remote()),
      update: vi.fn(async () => remote(2)),
      setLogo: vi.fn(async () => ({ ...remote(3), logo_checksum: 'checksum' })),
      logo: vi.fn(async () => new Blob(['normalized'], { type: 'image/png' })),
      remove: vi.fn(async () => {}),
    };
    TestBed.configureTestingModule({
      providers: [
        QuotationDraftCoordinator,
        { provide: AuthService, useValue: { user, ready } },
        { provide: QuotationLocalStore, useValue: store },
        { provide: QuotationDraftApi, useValue: api },
      ],
    });
    coordinator = TestBed.inject(QuotationDraftCoordinator);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const start = async () => {
    coordinator.start(() => view, restore);
    await settle();
  };

  it('restores partial values and logo without login and never calls the API', async () => {
    view.payload.issuer.name = 'Fictício';
    view.payload.items[0].quantity = '0,';
    view.logo = new Blob(['logo']);
    rows.set('local-1', local());
    await start();
    await coordinator.flush();
    expect(view.payload.issuer.name).toBe('Fictício');
    expect(view.payload.items[0].quantity).toBe('0,');
    expect(view.logo).not.toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect([...rows.values()][0].expiresAt - [...rows.values()][0].updatedAt).toBe(draftLifetime);
  });
  it('debounces edits and saves locally before any remote request', async () => {
    await start();
    vi.useFakeTimers();
    view.payload.customer.name = 'Primeiro';
    coordinator.changed();
    view.payload.customer.name = 'Último';
    coordinator.changed();
    expect(store.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(451);
    await settle();
    expect([...rows.values()][0].payload.customer.name).toBe('Último');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('persists one generation key per synchronized revision and restores it after refresh', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote(3);
    draft.dirty = false;
    rows.set(draft.id, draft);
    api.read.mockResolvedValue(remote(3));
    await start();
    const first = await coordinator.generationContext();
    expect(first).toEqual({ uuid: 'remote-1', revision: 3, key: expect.any(String) });
    expect(rows.get(draft.id)?.generationRequest).toEqual({ revision: 3, key: first!.key });
    expect(await coordinator.generationContext()).toEqual(first);
    coordinator = TestBed.runInInjectionContext(() => new QuotationDraftCoordinator());
    await start();
    expect(await coordinator.generationContext()).toEqual(first);
    view.payload.notes = 'New revision';
    coordinator.changed();
    api.update.mockResolvedValue(remote(4));
    const next = await coordinator.generationContext();
    expect(next?.revision).toBe(4);
    expect(next?.key).not.toBe(first?.key);
  });
  it('refuses generation while remote synchronization fails and preserves the local edit', async () => {
    user.set({ id: 1 });
    await start();
    view.payload.notes = 'Pending edit';
    coordinator.changed();
    api.create.mockRejectedValue(new HttpErrorResponse({ status: 503 }));
    expect(await coordinator.generationContext()).toBeNull();
    expect([...rows.values()][0].payload.notes).toBe('Pending edit');
  });
  it('keeps the public editor usable during session restoration and carries pending edits into login', async () => {
    ready.set(false);
    await start();
    expect(coordinator.loading()).toBe(false);
    view.payload.notes = 'Digitado antes da sessão responder';
    coordinator.changed();
    user.set({ id: 1 });
    ready.set(true);
    await settle();
    await coordinator.flush();
    expect(view.payload.notes).toBe('Digitado antes da sessão responder');
    expect([...rows.values()][0].ownerId).toBe(1);
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Digitado antes da sessão responder' }),
      expect.any(String),
    );
  });
  it('imports the matching guest after authentication and preserves the logo', async () => {
    view.payload.notes = 'Preservado';
    view.logo = new Blob(['logo']);
    const draft = local();
    draft.logoDirty = true;
    rows.set(draft.id, draft);
    sessionStorage.setItem(QuotationLocalStore.marker, draft.id);
    user.set({ id: 1 });
    await start();
    await coordinator.flush();
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Preservado' }),
      'import-1',
    );
    expect(api.setLogo).toHaveBeenCalled();
    expect([...rows.values()][0].ownerId).toBe(1);
  });
  it('restores the latest remote content and private logo without creating another draft', async () => {
    user.set({ id: 1 });
    const saved = { ...remote(5), logo_checksum: 'logo' };
    api.latest.mockResolvedValue(saved);
    await start();
    expect(api.logo).toHaveBeenCalledWith('remote-1');
    expect(view.logo).not.toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect([...rows.values()][0].remote?.revision).toBe(5);
  });
  it('resumes an existing remote draft after refresh', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote(3);
    draft.dirty = false;
    rows.set(draft.id, draft);
    await start();
    expect(api.read).toHaveBeenCalledWith('remote-1');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('does not replace edits made while a newer remote logo is still loading', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote(1);
    draft.dirty = false;
    rows.set(draft.id, draft);
    await start();
    let finish!: (blob: Blob) => void;
    api.read.mockResolvedValue({ ...remote(3), logo_checksum: 'updated-logo' });
    api.logo.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    window.dispatchEvent(new Event('focus'));
    await settle();
    view.payload.notes = 'Nova edição durante o download';
    coordinator.changed();
    finish(new Blob(['logo']));
    await settle();
    expect(view.payload.notes).toBe('Nova edição durante o download');
    expect(coordinator.conflict()).toBe(true);
  });
  it('retains the exact import body and key after a network failure even after edits', async () => {
    user.set({ id: 1 });
    await start();
    api.create.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    view.payload.notes = 'Inicial';
    coordinator.changed();
    await coordinator.flush();
    view.payload.notes = 'Posterior';
    coordinator.changed();
    api.create.mockResolvedValueOnce({
      ...remote(),
      payload: { ...view.payload, notes: 'Inicial' },
    });
    await coordinator.flush();
    const calls = api.create.mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(api.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ notes: 'Posterior' }),
    );
  });
  it('stops on a remote revision conflict and preserves local edits until an explicit choice', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote(3);
    rows.set(draft.id, draft);
    api.update.mockRejectedValue(new HttpErrorResponse({ status: 409 }));
    await start();
    await coordinator.flush();
    expect(coordinator.conflict()).toBe(true);
    const count = api.update.mock.calls.length;
    await coordinator.flush();
    expect(api.update).toHaveBeenCalledTimes(count);
    api.read.mockResolvedValue({ ...remote(4), payload: { ...view.payload, notes: 'Remoto' } });
    await coordinator.recoverLatest();
    expect(view.payload.notes).toBe('Remoto');
    expect(coordinator.conflict()).toBe(false);
  });
  it('does not overwrite a newer IndexedDB revision from another tab', async () => {
    const draft = local();
    rows.set(draft.id, draft);
    await start();
    rows.set(draft.id, {
      ...draft,
      localRevision: 10,
      payload: { ...draft.payload, notes: 'Outra aba' },
    });
    view.payload.notes = 'Minha aba';
    coordinator.changed();
    await coordinator.flush();
    expect(coordinator.conflict()).toBe(true);
    expect(rows.get(draft.id)?.payload.notes).toBe('Outra aba');
    await coordinator.recoverLatest();
    expect(view.payload.notes).toBe('Outra aba');
  });
  it('preserves conflicting local content as a separate draft only on explicit request', async () => {
    rows.set('local-1', local());
    await start();
    rows.set('local-1', { ...rows.get('local-1')!, localRevision: 100 });
    view.payload.notes = 'Revisar';
    coordinator.changed();
    await coordinator.flush();
    await coordinator.preserveCopy();
    expect(rows.size).toBe(2);
    expect(
      [...rows.values()].some((r) => r.id !== 'local-1' && r.payload.notes === 'Revisar'),
    ).toBe(true);
  });
  it('recovers another tab’s unsynchronized local content without replacing it with an older server version', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote(3);
    draft.dirty = false;
    rows.set(draft.id, draft);
    await start();
    const latest = rows.get(draft.id)!;
    rows.set(draft.id, {
      ...latest,
      localRevision: latest.localRevision + 1,
      dirty: true,
      payload: { ...latest.payload, notes: 'Outra aba offline' },
    });
    view.payload.notes = 'Esta aba';
    coordinator.changed();
    await coordinator.flush();
    expect(coordinator.conflict()).toBe(true);
    const calls = api.read.mock.calls.length;
    await coordinator.recoverLatest();
    expect(view.payload.notes).toBe('Outra aba offline');
    expect(api.read).toHaveBeenCalledTimes(calls);
  });
  it('retains local content on network failure and retries without making duplicate imports', async () => {
    user.set({ id: 1 });
    await start();
    api.update.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    coordinator.changed();
    await coordinator.flush();
    expect(coordinator.warning()).toContain('local');
    await coordinator.flush();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(coordinator.warning()).toBe('');
  });
  it.each([401, 419])('preserves the local draft on expired session %i', async (status) => {
    user.set({ id: 1 });
    await start();
    api.create.mockRejectedValue(new HttpErrorResponse({ status }));
    view.payload.notes = 'Recuperável';
    coordinator.changed();
    await coordinator.flush();
    expect(coordinator.warning()).toContain('Sessão expirada');
    expect([...rows.values()][0].payload.notes).toBe('Recuperável');
  });
  it('never restores account A data when account B uses the browser', async () => {
    const draft = local(1);
    draft.payload.notes = 'Conta A';
    rows.set(draft.id, draft);
    user.set({ id: 2 });
    sessionStorage.setItem(QuotationLocalStore.marker, draft.id);
    await start();
    expect(view.payload.notes).toBe('');
    expect(restore).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });
  it('clears displayed account data on logout and does not resurrect deleted records', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.dirty = false;
    rows.set(draft.id, draft);
    await start();
    rows.clear();
    store.changes.next('accounts-cleared');
    await coordinator.flush();
    expect(view.payload.issuer.name).toBe('');
    expect(rows.size).toBe(0);
  });
  it('warns when IndexedDB is unavailable and keeps the form editable', async () => {
    store.read.mockRejectedValue(new Error('unavailable'));
    store.write.mockRejectedValue(new Error('quota'));
    await start();
    view.payload.notes = 'Em memória';
    coordinator.changed();
    expect(await coordinator.flush()).toBe(false);
    expect(coordinator.warning()).toContain('não está garantida');
    expect(view.payload.notes).toBe('Em memória');
    expect(coordinator.loading()).toBe(false);
  });
  it('discards the remote resource and its local copy without any processing', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote();
    draft.dirty = false;
    rows.set(draft.id, draft);
    await start();
    await coordinator.discard();
    expect(api.remove).toHaveBeenCalled();
    expect(rows.size).toBe(0);
    expect(coordinator.message()).toContain('descartado');
  });
  it('does not erase local data when remote deletion fails', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote();
    draft.dirty = false;
    rows.set(draft.id, draft);
    await start();
    api.remove.mockRejectedValue(new HttpErrorResponse({ status: 503 }));
    await coordinator.discard();
    expect(rows.size).toBe(1);
    expect(coordinator.warning()).not.toBe('');
  });
  it('removes expired displayed data and its logo without extending TTL on reads', async () => {
    vi.useFakeTimers();
    const draft = local();
    draft.dirty = false;
    draft.expiresAt = Date.now() + 1000;
    rows.set(draft.id, draft);
    await start();
    await vi.advanceTimersByTimeAsync(15001);
    await settle();
    expect(rows.size).toBe(0);
    expect(coordinator.message()).toContain('expirado');
    expect(view.logo).toBeNull();
  });
  it('expires unsaved in-memory content too when IndexedDB cannot persist it', async () => {
    vi.useFakeTimers();
    store.read.mockRejectedValue(new Error('unavailable'));
    await start();
    view.payload.notes = 'Temporário em memória';
    coordinator.changed();
    vi.setSystemTime(Date.now() + draftLifetime + 1);
    await vi.advanceTimersByTimeAsync(15001);
    await settle();
    expect(view.payload.notes).toBe('');
    expect(coordinator.message()).toContain('expirado');
  });
  it('does not delete a newer edit from another tab when this tab reaches its old expiration', async () => {
    vi.useFakeTimers();
    const draft = local();
    draft.dirty = false;
    draft.expiresAt = Date.now() + 1000;
    rows.set(draft.id, draft);
    await start();
    rows.set(draft.id, {
      ...draft,
      localRevision: draft.localRevision + 1,
      expiresAt: Date.now() + draftLifetime,
      payload: { ...draft.payload, notes: 'Edição recente da outra aba' },
    });
    await vi.advanceTimersByTimeAsync(15001);
    await settle();
    expect(rows.get(draft.id)?.payload.notes).toBe('Edição recente da outra aba');
    expect(view.payload.notes).toBe('');
  });
  it('persists the explicit paid source and stable key across restoration', async () => {
    user.set({ id: 1 });
    const draft = local(1);
    draft.remote = remote(3);
    draft.dirty = false;
    rows.set(draft.id, draft);
    api.read.mockResolvedValue(remote(3));
    await start();
    const first = await coordinator.generationContext('credit');
    expect(first?.source).toBe('credit');
    expect(rows.get(draft.id)?.generationRequest?.source).toBe('credit');
    coordinator = TestBed.runInInjectionContext(() => new QuotationDraftCoordinator());
    await start();
    expect(await coordinator.generationContext('credit')).toEqual(first);
    const free = await coordinator.generationContext('free');
    expect(free?.key).not.toBe(first?.key);
  });
});
