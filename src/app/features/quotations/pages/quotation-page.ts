import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  ViewEncapsulation,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toolFaqs } from '../../../core/tool-faqs';
import { map } from 'rxjs';
import { QuotationCommercePanel } from '../components/quotation-commerce';
import { QuotationDrafts } from '../components/quotation-drafts';
import { QuotationItems } from '../components/quotation-items';
import { QuotationMoney } from '../components/quotation-money';
import { QuotationPartyFields } from '../components/quotation-party';
import { QuotationPreview } from '../components/quotation-preview';
import { QuotationTemplatePicker } from '../components/quotation-template-picker';
import { quotationLimits } from '../models/quotation';
import { QuotationEditorValue } from '../models/quotation';
import { QuotationDraftCoordinator } from '../services/quotation-draft.coordinator';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationGenerationCoordinator } from '../services/quotation-generation.coordinator';
import {
  calculateQuotation,
  formatCents,
  parsePercent,
  quotationPayload,
} from '../services/quotation-calculator';
import { createItem, createQuotationForm, fieldError } from '../services/quotation-form';
import { LocalQuotationLogo, QuotationLogoLoader } from '../services/quotation-logo';
import { launch } from '../../../../environments/launch.generated';

@Component({
  selector: 'app-quotation-page',
  providers: [QuotationDraftCoordinator, QuotationGenerationCoordinator],
  imports: [
    DatePipe,
    RouterLink,
    QuotationDrafts,
    QuotationCommercePanel,
    ReactiveFormsModule,
    QuotationItems,
    QuotationMoney,
    QuotationPartyFields,
    QuotationPreview,
    QuotationTemplatePicker,
  ],
  templateUrl: './quotation-page.html',
  styleUrls: ['./quotation-form.scss', './quotation-page.scss', './quotation-draft.scss'],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'quotation-app' },
})
export class QuotationPage {
  readonly generationEnabled = launch.quotationEnabled;
  readonly commerce = viewChild(QuotationCommercePanel);
  readonly draft = inject(QuotationDraftCoordinator);
  readonly generation = inject(QuotationGenerationCoordinator);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  readonly form = createQuotationForm();
  readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  readonly calculation = computed(() => calculateQuotation(this.value()));
  readonly discountInvalid = computed(() => {
    const value = this.value();
    if (value.discount_type === 'percent') return !parsePercent(value.discount_percent);
    const fixed = value.discount_fixed_cents;
    const subtotal = this.calculation().subtotal;
    return (
      fixed === null ||
      !Number.isSafeInteger(fixed) ||
      fixed < 0 ||
      fixed > quotationLimits.totalCents ||
      (subtotal !== null && fixed > subtotal)
    );
  });
  readonly ready = computed(() => this.status() === 'VALID' && !this.calculation().error);
  readonly mobileView = signal<'edit' | 'preview'>('edit');
  readonly steps = [
    'Minha empresa',
    'Cliente',
    'Itens e valores',
    this.generationEnabled ? 'Revisar e gerar' : 'Revisar orçamento',
  ];
  readonly step = signal(1);
  readonly stepMessage = signal('');
  readonly reviewed = signal(false);
  readonly faqs = toolFaqs['/gerador-de-orcamentos'];
  readonly confirmation = signal<{ owner: number; source: 'free' | 'pro' | 'credit' } | null>(null);
  readonly preparing = signal(false);
  readonly logo = signal<LocalQuotationLogo | null>(null);
  readonly logoError = signal('');
  readonly logoBusy = signal(false);
  readonly format = formatCents;
  readonly error = fieldError;
  readonly limits = quotationLimits;
  private readonly loader = inject(QuotationLogoLoader);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private logoRevision = 0;
  private destroyed = false;
  private restoring = false;
  private restoreRevision = 0;

  constructor() {
    effect(() => {
      if (this.confirmation()?.owner !== this.auth.user()?.id) this.confirmation.set(null);
    });
    afterNextRender(() => {
      if (this.generationEnabled) this.generation.start();
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const part = (name: string) => parts.find((entry) => entry.type === name)!.value;
      const today = `${part('year')}-${part('month')}-${part('day')}`;
      const validity = new Date(today + 'T12:00:00Z');
      validity.setUTCDate(validity.getUTCDate() + 15);
      if (!this.form.controls.issue_date.value) this.form.controls.issue_date.setValue(today);
      if (!this.form.controls.valid_until.value)
        this.form.controls.valid_until.setValue(validity.toISOString().slice(0, 10));
      this.draft.start(
        () => {
          const value = this.form.getRawValue();
          const text = (selector: string) =>
            this.element.nativeElement.querySelector<HTMLInputElement>(selector)?.value ?? '';
          return {
            payload: {
              ...value,
              money_inputs: {
                prices: value.items.map((_, index) => text(`#item-price-${index}`)),
                fixed_discount: value.discount_type === 'fixed' ? text('#discount-value') : '',
              },
            },
            logo: this.logo()?.blob ?? null,
          };
        },
        (snapshot) => {
          this.restoring = true;
          this.removeLogo();
          const empty = createQuotationForm().getRawValue();
          empty.issue_date = today;
          empty.valid_until = validity.toISOString().slice(0, 10);
          const value: QuotationEditorValue = snapshot?.payload ?? empty;
          const revision = ++this.restoreRevision;
          this.form.controls.items.clear({ emitEvent: false });
          for (const item of value.items) {
            const group = createItem();
            group.setValue(item);
            this.form.controls.items.push(group, { emitEvent: false });
          }
          this.form.reset(value);
          const params = new URLSearchParams(window.location.search);
          this.step.set(params.has('quotation_order') || params.get('etapa') === 'revisar' ? 4 : 1);
          this.stepMessage.set('');
          this.reviewed.set(false);
          if (snapshot?.logo)
            this.logo.set({
              blob: snapshot.logo,
              url: URL.createObjectURL(snapshot.logo),
              width: 1,
              height: 1,
            });
          this.restoring = false;
          if (value.money_inputs) {
            afterNextRender(
              () => {
                if (this.destroyed || revision !== this.restoreRevision) return;
                const setText = (selector: string, text: string) => {
                  const input =
                    this.element.nativeElement.querySelector<HTMLInputElement>(selector);
                  if (input) input.value = text;
                };
                value.money_inputs!.prices.forEach((text, index) =>
                  setText(`#item-price-${index}`, text),
                );
                if (value.discount_type === 'fixed')
                  setText('#discount-value', value.money_inputs!.fixed_discount);
              },
              { injector: this.injector },
            );
          }
        },
      );
    });
    const subscription = this.form.valueChanges.subscribe(() => {
      this.confirmation.set(null);
      if (!this.restoring) this.draft.changed();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      subscription.unsubscribe();
      const previous = this.logo();
      if (previous) URL.revokeObjectURL(previous.url);
    });
  }
  async buyCredits(): Promise<void> {
    await this.commerce()?.checkout(() => this.draft.flush(false));
  }
  async login(): Promise<void> {
    if (await this.draft.flush(false))
      await this.router.navigate(['/login'], {
        queryParams: { returnTo: '/gerador-de-orcamentos' },
      });
  }
  beforeLeave(): Promise<boolean> {
    return this.draft.flush(false);
  }
  async generate(): Promise<void> {
    if (!this.generationEnabled) return;
    if (
      this.preparing() ||
      this.confirmation() ||
      this.generation.sending() ||
      this.generation.pending() ||
      this.logoBusy()
    )
      return;
    if (!this.auth.user()) {
      this.generation.needLogin();
      this.focusGeneration();
      return;
    }
    this.validatePreview();
    if (!this.ready()) return;
    this.preparing.set(true);
    this.generation.error.set('');
    const owner = this.auth.user()!.id;
    try {
      await this.generation.refresh();
      if (
        this.destroyed ||
        this.auth.user()?.id !== owner ||
        !this.ready() ||
        this.generation.pending()
      )
        return;
      const quota = this.generation.entitlements();
      if (!quota?.enabled || this.generation.error()) return;
      const source = this.generation.selectedSource();
      if (!this.generation.sourceAvailable()) {
        this.generation.error.set(
          'Sua franquia está esgotada. Confira o saldo e escolha um crédito disponível ou aguarde a renovação.',
        );
        return;
      }
      this.confirmation.set({ owner, source });
      setTimeout(() =>
        this.element.nativeElement.querySelector<HTMLElement>('#generation-confirmation')?.focus(),
      );
    } finally {
      this.preparing.set(false);
    }
  }
  async confirmGeneration(): Promise<void> {
    if (!this.generationEnabled) return;
    const confirmation = this.confirmation();
    if (!confirmation || confirmation.owner !== this.auth.user()?.id || !this.ready()) return;
    this.confirmation.set(null);
    this.generation.selectedSource.set(confirmation.source);
    await this.generation.generate();
    this.focusGeneration();
  }
  private focusGeneration(): void {
    setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLElement>('#generation-title')?.focus(),
    );
  }
  cancelGeneration(): void {
    this.confirmation.set(null);
    setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLElement>('.generate-pdf')?.focus(),
    );
  }
  addItem(): void {
    if (this.form.controls.items.length < this.limits.items)
      this.form.controls.items.push(createItem());
  }
  removeItem(index: number): void {
    if (
      this.form.controls.items.length > 1 &&
      index >= 0 &&
      index < this.form.controls.items.length
    )
      this.form.controls.items.removeAt(index);
  }
  goToStep(step: number): void {
    if (
      step < 1 ||
      step > 4 ||
      this.confirmation() ||
      this.preparing() ||
      this.generation.sending()
    )
      return;
    this.step.set(step);
    this.stepMessage.set('');
    this.mobileView.set('edit');
    setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLElement>('#editor-step-title')?.focus(),
    );
  }
  nextStep(): void {
    const controls = this.form.controls;
    const fields =
      this.step() === 1
        ? [controls.issuer]
        : this.step() === 2
          ? [controls.customer]
          : [controls.items, controls.conditions, controls.notes];
    fields.forEach((field) => field.markAllAsTouched());
    if (fields.some((field) => field.invalid) || (this.step() === 3 && this.calculation().error)) {
      this.stepMessage.set('Confira os campos destacados antes de continuar.');
      this.focusInvalid();
      return;
    }
    this.goToStep(this.step() + 1);
  }
  private focusInvalid(): void {
    setTimeout(() => {
      const invalid =
        this.element.nativeElement.querySelector<HTMLElement>(
          '[data-step]:not([hidden]) [aria-invalid="true"], [data-step]:not([hidden])[aria-invalid="true"]',
        ) ?? this.element.nativeElement.querySelector<HTMLElement>('#calculation-error');
      const details = invalid?.closest('details');
      if (details) details.open = true;
      invalid?.focus();
    });
  }
  validatePreview(): void {
    this.reviewed.set(true);
    this.form.markAllAsTouched();
    if (!this.ready()) {
      this.mobileView.set('edit');
      const c = this.form.controls;
      this.step.set(
        c.issuer.invalid
          ? 1
          : c.customer.invalid
            ? 2
            : c.items.invalid || c.conditions.invalid || c.notes.invalid || this.calculation().error
              ? 3
              : 4,
      );
      this.stepMessage.set('Confira os campos destacados antes de gerar.');
      this.focusInvalid();
    }
  }
  /** The backend validates this document again before reserving a generation. */
  validatedPayload() {
    return this.ready() ? quotationPayload(this.value()) : null;
  }
  async selectLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const revision = ++this.logoRevision;
    this.logoBusy.set(true);
    this.logoError.set('');
    try {
      const prepared = await this.loader.prepare(file);
      if (this.destroyed || revision !== this.logoRevision) {
        URL.revokeObjectURL(prepared.url);
        return;
      }
      const previous = this.logo();
      this.logo.set(prepared);
      if (previous) URL.revokeObjectURL(previous.url);
      this.draft.changed();
    } catch {
      if (!this.destroyed && revision === this.logoRevision)
        this.logoError.set(
          'Não foi possível usar esta imagem. Escolha PNG ou JPEG, até 2 MB e 4 milhões de pixels.' +
            (this.logo() ? ' O logotipo anterior foi mantido.' : ''),
        );
    } finally {
      if (revision === this.logoRevision) this.logoBusy.set(false);
      input.value = '';
    }
  }
  removeLogo(): void {
    this.logoRevision++;
    const previous = this.logo();
    if (previous) URL.revokeObjectURL(previous.url);
    this.logo.set(null);
    this.logoError.set('');
    this.logoBusy.set(false);
    if (!this.restoring && !this.destroyed) this.draft.changed();
  }
  logoLoaded(event: Event): void {
    const image = event.target as HTMLImageElement;
    const current = this.logo();
    if (current && image.src === current.url && image.naturalWidth > 0 && image.naturalHeight > 0)
      this.logo.set({ ...current, width: image.naturalWidth, height: image.naturalHeight });
  }
}
