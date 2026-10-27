import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
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
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { QuotationCommercePanel } from '../components/quotation-commerce';
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

@Component({
  selector: 'app-quotation-page',
  providers: [QuotationDraftCoordinator, QuotationGenerationCoordinator],
  imports: [
    DatePipe,
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
  readonly reviewed = signal(false);
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
    afterNextRender(() => {
      this.generation.start();
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
    if (this.generation.sending() || this.generation.pending() || this.logoBusy()) return;
    if (!this.auth.user()) {
      this.generation.needLogin();
      return;
    }
    this.validatePreview();
    if (this.ready()) await this.generation.generate();
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
  validatePreview(): void {
    this.reviewed.set(true);
    this.form.markAllAsTouched();
    if (!this.ready()) {
      this.mobileView.set('edit');
      setTimeout(() => {
        const invalid =
          this.element.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]') ??
          this.element.nativeElement.querySelector<HTMLElement>('#calculation-error');
        const details = invalid?.closest('details');
        if (details) details.open = true;
        invalid?.focus();
      });
    }
  }
  /** Issuance remains disabled; drafts preserve the incomplete editor separately. */
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
