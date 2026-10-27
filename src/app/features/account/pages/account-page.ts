import { QuotationCommercePanel } from '../../quotations/components/quotation-commerce';
import { AnalyticsService } from '../../../core/analytics.service';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationStart, Router, RouterLink } from '@angular/router';
import { finalize, Subscription, timer } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { ProcessingService } from '../../processing/services/processing.service';
import { HistoryProcessing } from '../models/account';
import { processingTools } from '../../processing/tools';
import { AccountService } from '../services/account.service';
import {
  BillingService,
  Purchase,
  Usage,
  SubscriptionSummary,
} from '../../processing/services/billing.service';

@Component({
  selector: 'app-account-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, QuotationCommercePanel],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  readonly tools = {
    ...processingTools,
    'quotation-generator': { name: 'Orçamento profissional', path: '/gerador-de-orcamentos' },
  };
  private readonly analytics = inject(AnalyticsService);
  readonly subscription = signal<SubscriptionSummary | null>(null);
  readonly subscriptionBusy = signal(false);
  readonly subscriptionError = signal('');
  readonly subscriptionLoading = signal(false);
  readonly confirmingSubscription = signal(false);
  readonly subscriptionPollingActive = signal(false);
  readonly subscriptionRetryBlocked = signal(false);
  readonly subscriptionMessage = signal('');
  private confirmationWork = new Subscription();
  private confirmationAttempts = 0;
  proPrice(): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      (this.subscription()?.offer.amount ?? 0) / 100,
    );
  }
  paymentProblem(): boolean {
    return ['past_due', 'unpaid'].includes(this.subscription()?.subscription?.status ?? '');
  }
  subscriptionStatus(): string {
    const sub = this.subscription()?.subscription;
    if (!sub) return '';
    if (this.paymentProblem()) return 'Problema no pagamento';
    if (sub.grants_pro && sub.cancel_at_period_end) return 'Cancelamento agendado';
    if (sub.grants_pro) return 'Ativo';
    return (
      (
        {
          incomplete: 'Pagamento pendente',
          incomplete_expired: 'Cancelado',
          canceled: 'Cancelado',
          paused: 'Assinatura pausada',
          active: 'Período encerrado',
        } as Record<string, string>
      )[sub.status] ?? 'Assinatura indisponível'
    );
  }
  canUpgrade(): boolean {
    const sub = this.subscription()?.subscription;
    return (
      this.usage()?.plan === 'free' &&
      (!sub || ['canceled', 'incomplete_expired'].includes(sub.status))
    );
  }
  usagePercent(): number {
    const limits = this.usage()?.limits;
    return limits && limits.daily > 0
      ? Math.min(100, Math.max(0, (limits.used_today / limits.daily) * 100))
      : 0;
  }
  usageState(): string {
    return this.usagePercent() >= 100
      ? 'Limite de hoje atingido'
      : this.usagePercent() >= 80
        ? 'Próximo do limite de hoje'
        : 'Dentro do limite de hoje';
  }
  loadSubscription(): void {
    if (this.subscriptionPollingActive() || this.subscriptionRetryBlocked()) return;
    this.querySubscription();
  }
  private stopSubscriptionPolling(): void {
    this.subscriptionPollingActive.set(false);
    this.confirmationWork.unsubscribe();
  }
  cancelSubscriptionConfirmation(): void {
    this.stopSubscriptionPolling();
    this.confirmingSubscription.set(false);
    this.subscriptionMessage.set('Você pode consultar sua assinatura novamente mais tarde.');
  }
  private startSubscriptionConfirmation(): void {
    if (this.subscriptionPollingActive()) return;
    this.confirmingSubscription.set(true);
    this.subscriptionPollingActive.set(true);
    this.confirmationAttempts = 0;
    this.confirmationWork = new Subscription();
    this.confirmationWork.add(
      timer(30000).subscribe(() => {
        this.stopSubscriptionPolling();
        this.subscriptionMessage.set(
          'Seu pagamento ainda está sendo confirmado. Você pode aguardar mais alguns segundos ou consultar novamente.',
        );
      }),
    );
    this.querySubscription(true);
  }
  private querySubscription(automatic = false): void {
    if (this.subscriptionLoading() || this.destroyRef.destroyed) return;
    if (automatic) this.confirmationAttempts++;
    this.subscriptionLoading.set(true);
    this.subscriptionError.set('');
    const request = this.billing
      .subscription()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.subscriptionLoading.set(false);
          if (automatic && this.subscriptionPollingActive() && this.confirmationAttempts < 10) {
            this.confirmationWork.add(timer(3000).subscribe(() => this.querySubscription(true)));
          }
        }),
      )
      .subscribe({
        next: (r) => {
          this.subscription.set(r.data);
          this.analytics.confirmSubscription(r.data);
          const status = r.data.subscription?.status;
          if (status && status !== 'incomplete') this.stopSubscriptionPolling();
          if (
            this.confirmingSubscription() &&
            status === 'active' &&
            r.data.subscription?.grants_pro
          ) {
            this.confirmingSubscription.set(false);
            this.subscriptionMessage.set('Feitoo Pro ativado.');
            this.loadUsage(true);
          } else if (this.confirmingSubscription() && status && status !== 'incomplete') {
            this.confirmingSubscription.set(false);
            this.subscriptionMessage.set(
              'A confirmação terminou. Confira abaixo o estado da sua assinatura.',
            );
          } else if (this.confirmingSubscription() && !this.subscriptionPollingActive()) {
            this.subscriptionMessage.set(
              'Seu pagamento ainda está sendo confirmado. Você pode aguardar mais alguns segundos ou consultar novamente.',
            );
          }
          if (
            ['past_due', 'unpaid', 'incomplete_expired'].includes(r.data.subscription?.status ?? '')
          )
            this.analytics.track('pro_subscription_failed');
        },
        error: (error: HttpErrorResponse) => {
          this.stopSubscriptionPolling();
          if (error.status === 429) {
            this.subscriptionError.set(
              'Estamos consultando a confirmação com muita frequência. Aguarde alguns segundos e tente novamente.',
            );
            const header = error.headers?.get('Retry-After');
            const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
            const wait = Number.isFinite(seconds)
              ? seconds * 1000
              : header
                ? Date.parse(header) - Date.now()
                : 3000;
            this.subscriptionRetryBlocked.set(true);
            timer(Math.max(3000, Number.isFinite(wait) ? wait : 3000))
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe(() => this.subscriptionRetryBlocked.set(false));
          } else
            this.subscriptionError.set(
              'Não foi possível consultar sua assinatura. Tente novamente.',
            );
          this.subscriptionMessage.set(
            'A consulta automática foi interrompida. Você pode consultar novamente.',
          );
        },
      });
    if (automatic) this.confirmationWork.add(request);
  }
  openSubscription(portal = false): void {
    if (this.subscriptionBusy()) return;
    this.subscriptionBusy.set(true);
    this.subscriptionError.set('');
    (portal ? this.billing.portal() : this.billing.proCheckout())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.subscriptionBusy.set(false)),
      )
      .subscribe({
        next: (r) => {
          try {
            this.analytics.track(portal ? 'pro_portal_opened' : 'pro_checkout_started');
            if (portal) this.billing.portalRedirect(r.data.url);
            else {
              this.analytics.track('checkout_started', {
                purchase_type: 'subscription',
                plan: 'pro',
              });
              this.analytics.beginSubscriptionCheckout();
              this.billing.redirect(r.data.url);
            }
          } catch {
            if (!portal)
              this.analytics.track('checkout_failed', {
                purchase_type: 'subscription',
                plan: 'pro',
              });
            this.subscriptionError.set('Não foi possível abrir a Stripe.');
          }
        },
        error: () => {
          if (!portal)
            this.analytics.track('checkout_failed', { purchase_type: 'subscription', plan: 'pro' });
          this.subscriptionError.set('Não foi possível abrir a Stripe. Tente novamente.');
        },
      });
  }

  private readonly billing = inject(BillingService);
  readonly usage = signal<Usage | null>(null);
  readonly usageError = signal('');
  readonly usageLoading = signal(false);
  private usageRequest?: Subscription;
  loadUsage(refresh = false): void {
    if (this.usageLoading()) {
      if (!refresh) return;
      this.usageRequest?.unsubscribe();
    }
    this.usageLoading.set(true);
    this.usageError.set('');
    this.usageRequest = this.billing
      .usage()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.usageLoading.set(false)),
      )
      .subscribe({
        next: (r) => this.usage.set(r.data),
        error: () => this.usageError.set('Não foi possível consultar o uso do plano.'),
      });
  }
  readonly purchases = signal<readonly Purchase[]>([]);
  readonly purchasesLoading = signal(false);
  readonly billingError = signal('');
  readonly purchasePage = signal(1);
  readonly purchaseLastPage = signal(1);
  purchasePrice(item: Purchase): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: item.currency }).format(
      item.amount / 100,
    );
  }
  purchaseStatus(item: Purchase): string {
    return {
      pending: 'Aguardando pagamento',
      paid: 'Pago',
      failed: 'Pagamento não concluído',
      expired: 'Expirado',
      refunded: 'Reembolsado',
    }[item.status];
  }
  loadPurchases(page = 1): void {
    if (this.purchasesLoading()) return;
    this.purchasesLoading.set(true);
    this.billingError.set('');
    this.billing
      .purchases(page)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.purchasesLoading.set(false)),
      )
      .subscribe({
        next: (r) => {
          this.purchases.set(r.data);
          this.purchasePage.set(r.meta.current_page);
          this.purchaseLastPage.set(r.meta.last_page);
        },
        error: () => this.billingError.set('Não foi possível consultar suas compras.'),
      });
  }
  readonly auth = inject(AuthService);
  private readonly api = inject(AccountService);
  private readonly processingApi = inject(ProcessingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly historyTitle = viewChild<ElementRef<HTMLElement>>('historyTitle');
  private deleteTrigger: HTMLButtonElement | null = null;
  readonly profileForm = this.fb.nonNullable.group({
    name: [
      this.auth.user()?.name ?? '',
      [
        Validators.required,
        Validators.maxLength(120),
        Validators.pattern(/^[^<>\x00-\x1f\x7f]+$/u),
      ],
    ],
  });
  readonly passwordForm = this.fb.nonNullable.group({
    current_password: ['', [Validators.required, Validators.maxLength(72)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(72)]],
    password_confirmation: ['', Validators.required],
  });
  readonly saving = signal(false);
  readonly changingPassword = signal(false);
  readonly linkingGoogle = signal(false);
  readonly profileMessage = signal('');
  readonly profileError = signal('');
  readonly passwordMessage = signal('');
  readonly passwordError = signal('');
  readonly googleError = signal('');
  readonly loading = signal(false);
  readonly history = signal<readonly HistoryProcessing[]>([]);
  readonly historyError = signal('');
  readonly historyMessage = signal('');
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly confirming = signal<HistoryProcessing | null>(null);
  readonly action = signal<{ id: string; kind: 'download' | 'delete' } | null>(null);
  readonly now = signal(Date.now());

  fiscalTotal(value: string): string {
    // Keep decimal digits as text, including values larger than Number's safe range.
    const [whole, fraction = ''] = value.split('.');
    return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`;
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.stopSubscriptionPolling());
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) this.stopSubscriptionPolling();
    });
    this.loadUsage();
    this.loadPurchases();
    this.loadHistory();
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('subscription') === 'confirming')
      this.startSubscriptionConfirmation();
    else this.loadSubscription();
    this.analytics.track('pro_offer_viewed');
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('google_error'))
      this.googleError.set(
        'Não foi possível vincular Google. Use uma conta com o mesmo e-mail do Feitoo.',
      );
    timer(15000, 15000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.now.set(Date.now());
        if (Date.parse(this.usage()?.limits.resets_at ?? '') <= Date.now()) this.loadUsage();
      });
  }

  loadHistory(page = this.page()): void {
    if (this.loading() || this.action() || this.confirming()) return;
    this.loading.set(true);
    this.historyError.set('');
    this.api
      .history(page)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.history.set(response.data);
          this.page.set(response.meta.current_page);
          this.lastPage.set(response.meta.last_page);
          this.total.set(response.meta.total);
          this.now.set(Date.now());
        },
        error: (error) => {
          this.handleSession(error);
          this.historyError.set('Não foi possível carregar seus processamentos. Tente novamente.');
        },
      });
  }

  saveProfile(): void {
    if (this.saving()) return;
    this.profileError.set('');
    this.profileMessage.set('');
    this.profileForm.controls.name.setValue(this.profileForm.controls.name.value.trim());
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api
      .profile(this.profileForm.getRawValue().name)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.profileForm.reset({ name: response.data.name });
          this.profileMessage.set('Nome atualizado.');
        },
        error: (error) => {
          this.handleSession(error);
          this.profileError.set('Não foi possível salvar. Confira seu nome e tente novamente.');
        },
      });
  }

  changePassword(): void {
    if (this.changingPassword() || !this.auth.user()?.has_password) return;
    this.passwordError.set('');
    this.passwordMessage.set('');
    if (
      this.passwordForm.invalid ||
      this.passwordForm.controls.password.value !==
        this.passwordForm.controls.password_confirmation.value
    ) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.changingPassword.set(true);
    this.api
      .password(this.passwordForm.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.changingPassword.set(false)),
      )
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.passwordMessage.set('Senha atualizada. Use a nova senha no próximo acesso.');
        },
        error: (error) => {
          this.handleSession(error);
          this.passwordError.set(
            error instanceof HttpErrorResponse && error.status === 422
              ? error.error?.errors?.current_password
                ? 'A senha atual não confere.'
                : 'Confira a nova senha e sua confirmação. Use de 12 a 72 caracteres (até 72 bytes).'
              : 'Não foi possível atualizar a senha. Tente novamente.',
          );
        },
      });
  }

  nameError(): string {
    const control = this.profileForm.controls.name;
    return control.touched && control.invalid
      ? 'Informe um nome de até 120 caracteres, sem marcação HTML.'
      : '';
  }

  passwordFieldError(field: 'current_password' | 'password' | 'password_confirmation'): string {
    const control = this.passwordForm.controls[field];
    if (!control.touched) return '';
    if (control.hasError('required'))
      return field === 'password_confirmation' ? 'Confirme a nova senha.' : 'Informe a senha.';
    if (control.hasError('minlength')) return 'Use pelo menos 12 caracteres.';
    if (control.hasError('maxlength')) return 'Use no máximo 72 caracteres.';
    if (
      field === 'password_confirmation' &&
      control.value !== this.passwordForm.controls.password.value
    )
      return 'As senhas precisam ser iguais.';
    return '';
  }

  linkGoogle(): void {
    if (this.linkingGoogle() || this.auth.user()?.google_linked) return;
    this.googleError.set('');
    this.linkingGoogle.set(true);
    this.auth
      .startGoogle('link')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.linkingGoogle.set(false)),
      )
      .subscribe({
        next: (response) => window.location.assign(response.redirect_url),
        error: (error) => {
          this.handleSession(error);
          this.googleError.set('Google indisponível. Tente novamente mais tarde.');
        },
      });
  }

  expired(batch: HistoryProcessing): boolean {
    return (
      batch.status === 'expired' || !batch.expires_at || Date.parse(batch.expires_at) <= this.now()
    );
  }

  available(batch: HistoryProcessing): boolean {
    return batch.result.available && !batch.files_deleted && !this.expired(batch);
  }

  status(batch: HistoryProcessing): string {
    if (batch.files_deleted) return 'Arquivos excluídos';
    if (this.expired(batch)) return 'Resultado expirado';
    return {
      pending: 'Aguardando envio',
      uploading: 'Enviando',
      queued: 'Aguardando',
      processing: 'Processando',
      completed: 'Concluído',
      failed: 'Falhou',
      expired: 'Expirado',
    }[batch.status];
  }

  download(batch: HistoryProcessing): void {
    this.now.set(Date.now());
    if (!this.available(batch) || this.action() || this.confirming()) return;
    this.historyError.set('');
    this.historyMessage.set('');
    this.action.set({ id: batch.id, kind: 'download' });
    this.processingApi
      .download(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.action.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response.body) {
            this.historyError.set('O arquivo não está disponível. Atualize o histórico.');
            return;
          }
          const url = URL.createObjectURL(response.body);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download =
            /filename="?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
            batch.result.file_name ??
            'feitoo-xml-para-excel.xlsx';
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.historyMessage.set('Download iniciado.');
        },
        error: (error) => {
          this.handleSession(error);
          this.historyError.set(
            'Não foi possível baixar. O resultado pode ter expirado; atualize o histórico.',
          );
        },
      });
  }

  requestDelete(batch: HistoryProcessing, event: Event): void {
    if (!batch.can_delete_files || this.action() || this.loading()) return;
    this.deleteTrigger = event.currentTarget as HTMLButtonElement;
    this.historyError.set('');
    this.historyMessage.set('');
    this.confirming.set(batch);
    afterNextRender(() => this.confirmButton()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelDelete(): void {
    if (this.action()) return;
    this.confirming.set(null);
    this.deleteTrigger?.focus();
  }

  deleteFiles(): void {
    const batch = this.confirming();
    if (!batch || this.action()) return;
    this.action.set({ id: batch.id, kind: 'delete' });
    this.historyError.set('');
    this.processingApi
      .deleteFiles(batch.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.action.set(null)),
      )
      .subscribe({
        next: () => {
          this.history.update((rows) =>
            rows.map((row) =>
              row.id === batch.id
                ? {
                    ...row,
                    files_deleted: true,
                    can_delete_files: false,
                    status: 'expired',
                    result: { available: false, file_name: null },
                  }
                : row,
            ),
          );
          this.confirming.set(null);
          this.historyMessage.set('Arquivos excluídos. O registro permanece no histórico.');
          this.historyTitle()?.nativeElement.focus();
        },
        error: (error) => {
          this.handleSession(error);
          this.historyError.set('Não foi possível excluir os arquivos. Tente novamente.');
        },
      });
  }

  private handleSession(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.clear();
      void this.router.navigate(['/login'], { queryParams: { returnTo: '/conta' } });
    }
  }
}
