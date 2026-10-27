import { Component, ElementRef, inject, input, output } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { ItemForm, quotationLimits } from '../models/quotation';
import { formatCents } from '../services/quotation-calculator';
import { fieldError } from '../services/quotation-form';
import { QuotationMoney } from './quotation-money';

@Component({
  selector: 'app-quotation-items',
  imports: [ReactiveFormsModule, QuotationMoney],
  templateUrl: './quotation-items.html',
  styleUrl: './quotation-items.scss',
})
export class QuotationItems {
  readonly items = input.required<FormArray<ItemForm>>();
  readonly totals = input.required<(number | null)[]>();
  readonly addItem = output<void>();
  readonly removeItem = output<number>();
  readonly format = formatCents;
  readonly error = fieldError;
  readonly limit = quotationLimits.items;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  amountError(item: ItemForm, index: number): string {
    return (
      fieldError(item.controls.unit_price_cents) ||
      (this.totals()[index] === null &&
      item.controls.quantity.valid &&
      item.controls.unit_price_cents.valid
        ? 'O total deste item ultrapassa o limite de R$ 1 bilhão.'
        : '')
    );
  }
  add(): void {
    this.addItem.emit();
    setTimeout(() =>
      this.element.nativeElement
        .querySelector<HTMLTextAreaElement>('article:last-of-type textarea')
        ?.focus(),
    );
  }
  remove(index: number): void {
    this.removeItem.emit(index);
    setTimeout(() =>
      this.element.nativeElement
        .querySelectorAll<HTMLTextAreaElement>('textarea')
        [Math.max(0, index - 1)]?.focus(),
    );
  }
}
