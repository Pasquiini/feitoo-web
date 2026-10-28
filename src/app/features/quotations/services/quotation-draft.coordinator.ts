import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationEditorValue } from '../models/quotation';
import { QuotationDraftApi } from './quotation-draft-api.service';
import {
  draftLifetime,
  LocalDraft,
  LocalDraftConflict,
  QuotationLocalStore,
  RemoteDraft,
} from './quotation-local.store';

interface EditorSnapshot {
  payload: QuotationEditorValue;
  logo: Blob | null;
}
@Injectable()
export class QuotationDraftCoordinator {
  private readonly auth = inject(AuthService);
  private readonly local = inject(QuotationLocalStore);
  private readonly api = inject(QuotationDraftApi);
  readonly message = signal(
    'Preencha seu orçamento. O rascunho dura 24 horas após a última edição.',
  );
  readonly warning = signal('');
  readonly conflict = signal(false);
  readonly available = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  private record: LocalDraft | null = null;
  private readEditor: (() => EditorSnapshot) | null = null;
  private restoreEditor: ((snapshot: EditorSnapshot | null) => void) | null = null;
  private owner: number | null = null;
  private epoch = 0;
  private edits = 0;
  private changeVersion = 0;
  private lastEdit = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private initialized = false;
  private conflictSource: 'local' | 'remote' = 'local';

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const owner = this.auth.user()?.id ?? null;
      if (ready && this.readEditor) this.changeAccount(owner);
    });
    const subscription = this.local.changes.subscribe((id) => {
      if (id === 'accounts-cleared' && this.record?.ownerId != null) {
        this.epoch++;
        this.record = null;
        this.edits = 0;
        this.restoreEditor?.(null);
        this.available.set(false);
        this.message.set('Sessão encerrada. A cópia local da conta foi removida.');
      }
      // Other tabs are checked on write (IDB CAS + remote revision), without sharing personal data.
    });
    inject(DestroyRef).onDestroy(() => {
      const snapshot = this.readEditor?.();
      const epoch = this.epoch;
      if (snapshot && this.edits && !this.conflict()) {
        // In-app navigation keeps IndexedDB alive; capture before the form and object URL are destroyed.
        this.queue = this.queue
          .catch(() => {})
          .then(async () => {
            if (epoch !== this.epoch) return;
            const record = this.record
              ? {
                  ...this.record,
                  ...snapshot,
                  dirty: true,
                  logoDirty: this.record.logoDirty || this.record.logo !== snapshot.logo,
                  updatedAt: this.lastEdit,
                  expiresAt: this.lastEdit + draftLifetime,
                }
              : this.fresh(snapshot);
            await this.local.write(record);
          })
          .catch(() => {});
      }
      clearTimeout(this.timer);
      subscription.unsubscribe();
      this.stopped = true;
      if (typeof window === 'undefined') return;
      window.removeEventListener('pagehide', this.pagehide);
      window.removeEventListener('online', this.online);
      window.removeEventListener('focus', this.focus);
      window.removeEventListener('beforeunload', this.beforeUnload);
      document.removeEventListener('visibilitychange', this.visibility);
      if (this.interval) clearInterval(this.interval);
    });
  }
  private interval: ReturnType<typeof setInterval> | undefined;
  private readonly pagehide = () => {
    void this.flush(false);
  };
  private readonly online = () => {
    void this.flush();
  };
  private readonly focus = () => {
    this.queue = this.queue.catch(() => {}).then(() => this.checkRemote());
  };
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.edits) {
      void this.flush(false);
      event.preventDefault();
      event.returnValue = '';
    }
  };
  private readonly visibility = () => {
    if (document.hidden) void this.flush(false);
  };

  start(read: () => EditorSnapshot, restore: (snapshot: EditorSnapshot | null) => void): void {
    this.readEditor = read;
    this.restoreEditor = restore;
    this.local.connect();
    window.addEventListener('pagehide', this.pagehide);
    window.addEventListener('online', this.online);
    window.addEventListener('focus', this.focus);
    window.addEventListener('beforeunload', this.beforeUnload);
    document.addEventListener('visibilitychange', this.visibility);
    this.interval = setInterval(() => this.expire(), 15000);
    // The public editor must also work while the session endpoint is unavailable or still pending.
    this.changeAccount(this.auth.ready() ? (this.auth.user()?.id ?? null) : null);
  }
  private changeAccount(owner: number | null): void {
    if (this.initialized && owner === this.owner) return;
    this.initialized = true;
    const previous = this.owner;
    const guestSnapshot =
      previous === null && this.edits && this.readEditor ? this.readEditor() : null;
    const pendingGuest = guestSnapshot
      ? this.record
        ? {
            ...this.record,
            ...guestSnapshot,
            dirty: true,
            logoDirty: this.record.logoDirty || this.record.logo !== guestSnapshot.logo,
            updatedAt: this.lastEdit,
            expiresAt: this.lastEdit + draftLifetime,
          }
        : this.fresh(guestSnapshot)
      : null;
    this.owner = owner;
    const epoch = ++this.epoch;
    clearTimeout(this.timer);
    this.loading.set(true);
    this.conflict.set(false);
    this.warning.set('');
    if (previous !== owner && previous !== null) {
      this.record = null;
      this.edits = 0;
      this.restoreEditor?.(null);
      if (owner === null)
        this.warning.set(
          'Sessão encerrada ou expirada. Entre novamente para recuperar o rascunho da sua conta.',
        );
    }
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.active(epoch)) return;
        if (pendingGuest) {
          try {
            await this.local.write(pendingGuest);
          } catch (error) {
            this.failure(error, true);
            this.loading.set(false);
            return;
          }
        }
        await this.initialize(owner, epoch);
      });
  }
  private active(epoch: number): boolean {
    return !this.stopped && epoch === this.epoch;
  }
  private async initialize(owner: number | null, epoch: number): Promise<void> {
    try {
      const context = sessionStorage.getItem(QuotationLocalStore.marker);
      const guest = owner !== null && context ? await this.local.get(context) : null;
      let result = await this.local.read(owner);
      if (owner !== null) {
        if (guest?.ownerId === null) result = { draft: guest, expired: false };
      }
      if (!this.active(epoch)) return;
      this.record = result.draft;
      if (result.expired)
        this.message.set('Rascunho expirado. Os dados temporários foram removidos.');
      if (this.record) {
        if (this.record.ownerId === null && owner !== null) {
          this.record = await this.local.write({ ...this.record, ownerId: owner });
        }
        if (!this.active(epoch)) return;
        this.restoreEditor?.(this.record);
        this.available.set(true);
        this.message.set('Rascunho recuperado.');
        if (owner !== null && this.record.remote && !this.record.dirty && !this.record.logoDirty) {
          try {
            await this.acceptRemote(await this.api.read(this.record.remote.uuid), epoch);
          } catch (error) {
            this.failure(error);
          }
        }
      } else if (owner !== null) {
        try {
          const remote = await this.api.latest();
          if (remote && this.active(epoch)) await this.acceptRemote(remote, epoch);
        } catch (error) {
          this.failure(error);
        }
      } else if (result.expired)
        this.message.set('Rascunho expirado. Os dados temporários foram removidos.');
    } catch (error) {
      this.failure(error, true);
    } finally {
      if (this.active(epoch)) {
        this.loading.set(false);
        if (this.record?.dirty || this.record?.logoDirty) void this.flush();
      }
    }
  }
  changed(): void {
    if (this.loading() || this.stopped) return;
    this.edits++;
    this.changeVersion++;
    this.lastEdit = Date.now();
    this.message.set('Alterações ainda não sincronizadas.');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 450);
  }
  private fresh(snapshot: EditorSnapshot): LocalDraft {
    const now = this.lastEdit || Date.now();
    return {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      localRevision: 0,
      ownerId: this.owner,
      ...snapshot,
      logoDirty: !!snapshot.logo,
      remote: null,
      importKey: crypto.randomUUID(),
      importPayload: null,
      dirty: true,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + draftLifetime,
    };
  }
  flush(remote = true): Promise<boolean> {
    clearTimeout(this.timer);
    const epoch = this.epoch;
    const task = this.queue.catch(() => {}).then(() => this.save(epoch, remote));
    this.queue = task;
    return task;
  }
  async generationContext(source?: 'free' | 'pro' | 'credit'): Promise<{
    uuid: string;
    revision: number;
    key: string;
    source?: 'free' | 'pro' | 'credit';
  } | null> {
    if (
      !(await this.flush()) ||
      !this.record?.remote ||
      this.record.dirty ||
      this.record.logoDirty ||
      this.conflict() ||
      this.record.ownerId !== this.auth.user()?.id
    )
      return null;
    const record = this.record;
    const revision = record.remote!.revision;
    if (
      record.generationRequest?.revision !== revision ||
      record.generationRequest?.source !== source
    ) {
      record.generationRequest = {
        revision,
        key: crypto.randomUUID(),
        ...(source ? { source } : {}),
      };
      try {
        this.record = await this.local.write(record);
      } catch (error) {
        this.failure(error, true);
        return null;
      }
    }
    return {
      uuid: record.remote!.uuid,
      revision,
      key: record.generationRequest!.key,
      ...(source ? { source } : {}),
    };
  }
  private async save(epoch: number, sync: boolean): Promise<boolean> {
    if (!this.active(epoch) || this.loading() || this.conflict() || !this.readEditor) return false;
    if (!this.edits && !this.record) return true;
    const version = this.edits;
    const snapshot = this.readEditor();
    this.saving.set(true);
    this.message.set('Salvando...');
    try {
      const old = this.record;
      let record = old
        ? {
            ...old,
            ...snapshot,
            dirty: old.dirty || JSON.stringify(old.payload) !== JSON.stringify(snapshot.payload),
            logoDirty: old.logoDirty || old.logo !== snapshot.logo,
          }
        : this.fresh(snapshot);
      if (version > 0) {
        record.updatedAt = this.lastEdit;
        record.expiresAt = this.lastEdit + draftLifetime;
      }
      if (record.expiresAt <= Date.now()) {
        this.expire();
        return false;
      }
      record = await this.local.write(record);
      if (!this.active(epoch)) return false;
      this.record = record;
      this.available.set(true);
      this.warning.set('');
      if (sync && this.owner !== null && (record.dirty || record.logoDirty)) {
        if (!record.remote) {
          if (!record.importPayload) {
            record.importPayload = structuredClone(record.payload);
            record = await this.local.write(record);
            this.record = record;
          }
          const imported = await this.api.create(record.importPayload!, record.importKey);
          if (!this.active(epoch)) return false;
          // A replay can refer to a draft changed by another tab after the first import.
          if (JSON.stringify(imported.payload) !== JSON.stringify(record.importPayload)) {
            record.remote = imported;
            this.record = await this.local.write(record);
            throw new LocalDraftConflict('remote');
          }
          record.remote = imported;
          this.record = record = await this.local.write(record);
        }
        if (record.dirty) {
          record.remote = await this.api.update(record.remote!, record.payload);
          if (!this.active(epoch)) return false;
          record.dirty = false;
          this.record = record = await this.local.write(record);
        }
        if (record.logoDirty) {
          record.remote = await this.api.setLogo(record.remote!, record.logo);
          if (!this.active(epoch)) return false;
          record.logoDirty = false;
          this.record = record = await this.local.write(record);
        }
      }
      if (version === this.edits) {
        this.edits = 0;
        this.message.set(
          record.ownerId !== null && (record.dirty || record.logoDirty)
            ? 'Salvo neste navegador. Alterações ainda não sincronizadas.'
            : 'Rascunho salvo. Expira 24 horas após a última edição.',
        );
      }
      return true;
    } catch (error) {
      if (this.active(epoch)) this.failure(error, !(error instanceof HttpErrorResponse));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
  private failure(error: unknown, local = false): void {
    if (
      error instanceof LocalDraftConflict ||
      (error instanceof HttpErrorResponse && error.status === 409)
    ) {
      this.conflictSource = error instanceof LocalDraftConflict ? error.source : 'remote';
      this.conflict.set(true);
      this.message.set('Outra aba alterou este rascunho. Escolha qual versão continuar.');
    } else if (
      error instanceof HttpErrorResponse &&
      (error.status === 410 || error.status === 404)
    ) {
      this.conflict.set(true);
      this.message.set(
        error.status === 410
          ? 'Rascunho remoto expirado. Preserve o conteúdo local para continuar.'
          : 'Rascunho remoto removido. Preserve o conteúdo local para continuar.',
      );
    } else if (
      error instanceof HttpErrorResponse &&
      (error.status === 401 || error.status === 419)
    ) {
      this.warning.set(
        'Sessão expirada. O rascunho local foi preservado para esta conta. Entre novamente para sincronizar.',
      );
    } else {
      this.warning.set(
        local
          ? 'Não foi possível salvar neste navegador. A recuperação após sair ou atualizar não está garantida.'
          : 'Não foi possível sincronizar. O rascunho local foi mantido. Tente novamente.',
      );
    }
  }
  private async acceptRemote(remote: RemoteDraft, epoch: number, replace = false): Promise<void> {
    const version = this.changeVersion;
    const logo = remote.logo_checksum ? await this.api.logo(remote.uuid) : null;
    if (!this.active(epoch)) return;
    if (version !== this.changeVersion) throw new LocalDraftConflict();
    const record = (replace ? null : this.record) ?? this.fresh({ payload: remote.payload, logo });
    this.record = await this.local.write({
      ...record,
      ownerId: this.owner,
      payload: remote.payload,
      logo,
      logoDirty: false,
      dirty: false,
      remote,
      updatedAt: Date.parse(remote.updated_at),
      expiresAt: Date.parse(remote.expires_at),
    });
    if (!this.active(epoch)) return;
    if (version !== this.changeVersion) throw new LocalDraftConflict();
    this.restoreEditor?.(this.record);
    this.edits = 0;
    this.available.set(true);
    this.conflict.set(false);
    this.message.set('Rascunho recuperado da sua conta.');
  }
  async open(uuid: string): Promise<boolean> {
    if (this.owner === null || this.loading() || this.conflict()) return false;
    const epoch = this.epoch;
    if (!(await this.flush()) || !this.active(epoch)) return false;
    this.loading.set(true);
    try {
      const remote = await this.api.read(uuid);
      if (!this.active(epoch)) return false;
      await this.acceptRemote(remote, epoch, true);
      return this.active(epoch);
    } catch (error) {
      if (this.active(epoch)) this.failure(error);
      return false;
    } finally {
      if (this.active(epoch)) this.loading.set(false);
    }
  }
  async newDraft(): Promise<void> {
    if (this.loading() || this.conflict()) return;
    const epoch = this.epoch;
    if (!(await this.flush()) || !this.active(epoch)) return;
    this.record = null;
    this.lastEdit = Date.now();
    this.edits = 0;
    this.restoreEditor?.(null);
    this.available.set(false);
    this.changed();
    await this.flush();
  }
  async recoverLatest(): Promise<void> {
    await this.queue;
    try {
      if (!this.record) return;
      const latest = await this.local.get(this.record.id);
      if (latest) this.record = latest;
      if (latest && this.conflictSource === 'local' && (latest.dirty || latest.logoDirty)) {
        this.restoreEditor?.(latest);
        this.conflict.set(false);
        this.edits = 0;
        this.message.set(
          'Versão local mais recente recuperada. Alterações ainda não sincronizadas.',
        );
      } else if (this.record.remote)
        await this.acceptRemote(await this.api.read(this.record.remote.uuid), this.epoch);
      else if (latest) {
        this.restoreEditor?.(latest);
        this.conflict.set(false);
        this.edits = 0;
      } else {
        this.record = null;
        this.restoreEditor?.(null);
        this.conflict.set(false);
        this.available.set(false);
      }
    } catch (error) {
      this.failure(error);
    }
  }
  async preserveCopy(): Promise<void> {
    await this.queue;
    if (!this.readEditor) return;
    this.lastEdit = Date.now();
    this.record = this.fresh(this.readEditor());
    this.conflict.set(false);
    this.edits++;
    await this.flush();
  }
  async discard(): Promise<void> {
    clearTimeout(this.timer);
    await this.queue;
    const record = this.record;
    try {
      if (record) {
        const latest = await this.local.get(record.id);
        if (latest && latest.localRevision !== record.localRevision) throw new LocalDraftConflict();
        if (record.remote) {
          try {
            await this.api.remove(record.remote);
          } catch (error) {
            if (!(error instanceof HttpErrorResponse && error.status === 404)) throw error;
          }
        }
        await this.local.remove(record.id, record.localRevision);
      }
      this.epoch++;
      this.record = null;
      this.edits = 0;
      this.restoreEditor?.(null);
      this.available.set(false);
      this.conflict.set(false);
      this.warning.set('');
      this.message.set('Rascunho descartado.');
    } catch (error) {
      this.failure(error);
    }
  }
  private async checkRemote(): Promise<void> {
    if (!this.record?.remote || this.owner === null || this.loading() || this.conflict()) return;
    const epoch = this.epoch;
    const uuid = this.record.remote.uuid;
    try {
      const remote = await this.api.read(uuid);
      if (
        !this.active(epoch) ||
        this.record?.remote?.uuid !== uuid ||
        remote.revision <= this.record.remote.revision
      )
        return;
      if (this.edits || this.record.dirty || this.record.logoDirty)
        this.failure(new LocalDraftConflict('remote'));
      else await this.acceptRemote(remote, epoch);
    } catch (error) {
      if (this.active(epoch)) this.failure(error);
    }
  }
  private expire(): void {
    const deadline = this.edits ? this.lastEdit + draftLifetime : this.record?.expiresAt;
    if (!deadline || deadline > Date.now()) return;
    const id = this.record?.id;
    const revision = this.record?.localRevision;
    this.epoch++;
    this.record = null;
    this.edits = 0;
    this.conflict.set(false);
    this.restoreEditor?.(null);
    this.available.set(false);
    this.message.set('Rascunho expirado. Os dados temporários foram removidos.');
    if (id) void this.local.remove(id, revision).catch(() => {});
  }
}
