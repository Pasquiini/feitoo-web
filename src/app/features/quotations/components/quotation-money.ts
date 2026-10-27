import { Directive, ElementRef, forwardRef, HostListener, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatCents, parseMoneyInput } from '../services/quotation-calculator';

/** Leaves editing/caret intact; formats on blur, stores integer cents (or invalid null). */
@Directive({
  selector: 'input[quotationMoney]',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => QuotationMoney), multi: true },
  ],
})
export class QuotationMoney implements ControlValueAccessor {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private change: (value: number | null) => void = () => {};
  private touched: () => void = () => {};
  writeValue(value: number | null): void {
    this.element.nativeElement.value = value === null ? '' : formatCents(value);
  }
  registerOnChange(fn: (value: number | null) => void): void {
    this.change = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.element.nativeElement.disabled = disabled;
  }
  @HostListener('input') input(): void {
    this.change(parseMoneyInput(this.element.nativeElement.value));
  }
  @HostListener('blur') blur(): void {
    const value = parseMoneyInput(this.element.nativeElement.value);
    if (value !== null) this.element.nativeElement.value = formatCents(value);
    this.touched();
  }
}
