import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { QuotationPage } from './quotation-page';
import { QuotationLogoLoader } from '../services/quotation-logo';
import { validDate } from '../services/quotation-form';
import { provideRouter } from '@angular/router';

describe('QuotationPage editor in memory', () => {
  let fixture: ComponentFixture<QuotationPage>;
  let page: QuotationPage;
  let loader: { prepare: ReturnType<typeof vi.fn> };
  let originalRevoke: PropertyDescriptor | undefined;
  const element = () => fixture.nativeElement as HTMLElement;
  const fill = () => {
    page.form.patchValue({
      number: 'DEMO-001',
      issue_date: '2026-10-20',
      valid_until: '2026-11-04',
      issuer: { name: 'Prestador fictício' },
      customer: { name: 'Cliente fictício' },
    });
    page.form.controls.items
      .at(0)
      .patchValue({ description: 'Instalação fictícia', quantity: '2', unit_price_cents: 15000 });
    fixture.detectChanges();
  };
  beforeEach(async () => {
    loader = { prepare: vi.fn() };
    originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: QuotationLogoLoader, useValue: loader }],
    });
    fixture = TestBed.createComponent(QuotationPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });
  it('starts with one item, Moderno and no personal data', () => {
    expect(page.form.controls.items.length).toBe(1);
    expect(page.value().template_id).toBe('modern');
    expect(page.value().issuer.name).toBe('');
    expect(page.ready()).toBe(false);
    expect(element().querySelector<HTMLButtonElement>('.generate-pdf')!.disabled).toBe(true);
    expect(
      element().querySelector<HTMLButtonElement>('[aria-label="Remover item 1"]')!.disabled,
    ).toBe(true);
    expect(page.validatedPayload()).toBeNull();
  });
  it('validates required fields, dates and contact fields', () => {
    fill();
    expect(page.ready()).toBe(true);
    page.form.controls.customer.controls.name.setValue('  ');
    expect(page.ready()).toBe(false);
    page.form.controls.customer.controls.name.setValue('Cliente');
    page.form.controls.customer.controls.email.setValue('invalid');
    expect(page.form.invalid).toBe(true);
    page.form.controls.customer.controls.email.setValue('');
    page.form.controls.valid_until.setValue('2026-10-19');
    expect(page.form.hasError('validity')).toBe(true);
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2024-02-29')).toBe(true);
    page.form.controls.valid_until.setValue('2026-11-04');
    expect(page.ready()).toBe(true);
  });
  it('formats Brazilian contacts while preserving alphanumeric documents', () => {
    const details = element().querySelector<HTMLDetailsElement>('app-quotation-party details')!;
    details.open = true;
    const set = (id: string, value: string) => {
      const input = element().querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      return input;
    };
    set('#issuer-document', '12345678000199');
    expect(page.value().issuer.document).toBe('12.345.678/0001-99');
    set('#issuer-document', '12345678901');
    expect(page.value().issuer.document).toBe('123.456.789-01');
    set('#issuer-phone', '11987654321');
    expect(page.value().issuer.phone).toBe('(11) 98765-4321');
    set('#issuer-phone', '+551133334444');
    expect(page.value().issuer.phone).toBe('+55 (11) 3333-4444');
    set('#issuer-document', 'AB123456000199');
    expect(page.value().issuer.document).toBe('AB123456000199');
  });
  it('requires a review before reserving a generation, including double clicks and cancellation', async () => {
    fill();
    vi.spyOn(page.auth, 'user').mockReturnValue({ id: 7 } as NonNullable<
      ReturnType<typeof page.auth.user>
    >);
    const refresh = vi.spyOn(page.generation, 'refresh').mockResolvedValue();
    const generate = vi.spyOn(page.generation, 'generate').mockResolvedValue();
    page.generation.entitlements.set({
      source: 'free',
      policy: 'explicit_source',
      daily_limit: 1,
      remaining: 1,
      consumed: 0,
      reserved: 0,
      enabled: true,
      resets_at: '',
      active_processing: null,
      latest_processing: null,
    });
    await Promise.all([page.generate(), page.generate()]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    expect(page.confirmation()?.source).toBe('free');
    fixture.detectChanges();
    expect(element().querySelector('#generation-confirmation')?.textContent).toContain('300,00');
    page.cancelGeneration();
    expect(generate).not.toHaveBeenCalled();
    await page.generate();
    page.form.controls.number.setValue('REVISED');
    expect(page.confirmation()).toBeNull();
    await page.confirmGeneration();
    expect(generate).not.toHaveBeenCalled();
    await page.generate();
    await page.confirmGeneration();
    await page.confirmGeneration();
    expect(generate).toHaveBeenCalledOnce();
  });
  it('does not generate when the flag is off or the account changes after review', async () => {
    fill();
    const user = vi
      .spyOn(page.auth, 'user')
      .mockReturnValue({ id: 7 } as NonNullable<ReturnType<typeof page.auth.user>>);
    vi.spyOn(page.generation, 'refresh').mockResolvedValue();
    const generate = vi.spyOn(page.generation, 'generate').mockResolvedValue();
    page.generation.entitlements.set({
      source: 'free',
      policy: 'explicit_source',
      daily_limit: 1,
      remaining: 1,
      consumed: 0,
      reserved: 0,
      enabled: false,
      resets_at: '',
      active_processing: null,
      latest_processing: null,
    });
    await page.generate();
    expect(page.confirmation()).toBeNull();
    page.generation.entitlements.update((q) => ({ ...q!, enabled: true }));
    await page.generate();
    expect(page.confirmation()).not.toBeNull();
    user.mockReturnValue({ id: 8 } as NonNullable<ReturnType<typeof page.auth.user>>);
    await page.confirmGeneration();
    expect(generate).not.toHaveBeenCalled();
  });
  it('adds/removes items without removing the last and enforces 100', () => {
    page.removeItem(0);
    expect(page.form.controls.items.length).toBe(1);
    page.addItem();
    expect(page.form.controls.items.length).toBe(2);
    page.removeItem(0);
    expect(page.form.controls.items.length).toBe(1);
    for (let index = 0; index < 101; index++) page.addItem();
    expect(page.form.controls.items.length).toBe(100);
  });
  it('uses the currency mask without corrupting stored cents', () => {
    const input = element().querySelector<HTMLInputElement>('#item-price-0')!;
    input.value = '1.234,56';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(page.value().items[0].unit_price_cents).toBe(123456);
    expect(input.value).toBe('1.234,56');
    input.value = '10,001';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(page.value().items[0].unit_price_cents).toBeNull();
    expect(input.value).toBe('10,001');
    expect(page.calculation().total).toBeNull();
  });
  it('updates the preview and preserves data during template changes', () => {
    fill();
    expect(element().querySelector('.paper')!.textContent).toContain('Instalação fictícia');
    expect(element().querySelector('.paper .grand-total')!.textContent).toContain('300,00');
    const radio = element().querySelector<HTMLInputElement>('#quotation-template-classic')!;
    radio.click();
    fixture.detectChanges();
    expect(page.value().template_id).toBe('classic');
    expect(element().querySelector('.paper')!.classList.contains('modern')).toBe(false);
    expect(page.value().customer.name).toBe('Cliente fictício');
    expect(page.value().items[0].unit_price_cents).toBe(15000);
  });
  it('updates percentage/fixed discounts and never displays a negative total', () => {
    fill();
    page.form.patchValue({ discount_type: 'percent', discount_percent: '10' });
    fixture.detectChanges();
    expect(page.calculation().total).toBe(27000);
    page.form.patchValue({ discount_type: 'fixed', discount_fixed_cents: 5000 });
    expect(page.calculation().total).toBe(25000);
    page.form.controls.discount_fixed_cents.setValue(30001);
    fixture.detectChanges();
    expect(page.calculation().total).toBeNull();
    expect(element().querySelector('.editor-grand')!.textContent).toContain('—');
  });
  it('identifies the excessive line amount without marking a valid discount invalid', () => {
    fill();
    page.form.controls.items
      .at(0)
      .patchValue({ quantity: '1000000', unit_price_cents: 1000000000 });
    fixture.detectChanges();
    expect(page.calculation().total).toBeNull();
    expect(page.validatedPayload()).toBeNull();
    expect(element().querySelector('#item-price-0')!.getAttribute('aria-invalid')).toBe('true');
    expect(element().querySelector('#item-price-error-0')!.textContent).toContain('limite');
    expect(element().querySelector('#discount-value')!.getAttribute('aria-invalid')).toBe('false');
  });
  it('shows full plain text, including HTML and long conditions', () => {
    fill();
    const text =
      '<script>window.untrusted = true</script> ' + 'Observações de manutenção. '.repeat(90);
    page.form.controls.notes.setValue(text);
    fixture.detectChanges();
    expect(element().querySelector('.doc-text:last-of-type')!.textContent).toContain(text);
    expect(element().querySelector('.paper script')).toBeNull();
  });
  const eventFor = () =>
    ({
      target: {
        files: [new File(['synthetic'], 'logo.png', { type: 'image/png' })],
        value: 'logo.png',
      },
    }) as unknown as Event;
  it('selects, replaces and removes logos, revoking old object URLs', async () => {
    loader.prepare.mockResolvedValueOnce({ url: 'blob:first', width: 240, height: 100 });
    await page.selectLogo(eventFor());
    fixture.detectChanges();
    expect(element().querySelector('.paper img')!.getAttribute('src')).toBe('blob:first');
    loader.prepare.mockResolvedValueOnce({ url: 'blob:second', width: 120, height: 50 });
    await page.selectLogo(eventFor());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    page.removeLogo();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
    expect(page.logo()).toBeNull();
  });
  it('rejects invalid logos and keeps the previous valid image explicitly', async () => {
    loader.prepare.mockResolvedValueOnce({ url: 'blob:first', width: 10, height: 10 });
    await page.selectLogo(eventFor());
    loader.prepare.mockRejectedValueOnce(new Error('invalid'));
    await page.selectLogo(eventFor());
    expect(page.logo()!.url).toBe('blob:first');
    expect(page.logoError()).toContain('anterior foi mantido');
  });
  it('releases an image that finishes loading after removal/destruction', async () => {
    let finish!: (logo: { url: string; width: number; height: number }) => void;
    loader.prepare.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const pending = page.selectLogo(eventFor());
    page.removeLogo();
    finish({ url: 'blob:late', width: 1, height: 1 });
    await pending;
    expect(page.logo()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  });
  it('associates fields with labels/errors and makes validation explicit', () => {
    page.validatePreview();
    fixture.detectChanges();
    expect(element().querySelector('#issuer-name')!.getAttribute('aria-invalid')).toBe('true');
    expect(element().querySelector('#issuer-name-error')!.textContent).toContain('Preencha');
    for (const control of element().querySelectorAll<HTMLInputElement>(
      'input:not([type=radio]), textarea, select',
    )) {
      expect(element().querySelector(`label[for="${control.id}"]`)).not.toBeNull();
    }
    expect(element().querySelector('.generate-pdf')!.getAttribute('aria-describedby')).toBe(
      'pdf-policy',
    );
    expect(element().querySelector('#pdf-policy')!.textContent).toContain('franquia Free');
  });
});
