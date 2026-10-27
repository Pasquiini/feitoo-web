import { Component, input, signal } from '@angular/core';
import { QuotationCalculation, QuotationEditorValue } from '../models/quotation';
import { formatCents } from '../services/quotation-calculator';
import { validDate } from '../services/quotation-form';

@Component({
  selector: 'app-quotation-preview',
  templateUrl: './quotation-preview.html',
  styleUrl: './quotation-preview.scss',
})
export class QuotationPreview {
  readonly value = input.required<QuotationEditorValue>();
  readonly calculation = input.required<QuotationCalculation>();
  readonly logo = input<string | null>(null);
  readonly comfortable = signal(false);
  readonly format = formatCents;
  date(text: string): string {
    return validDate(text) ? text.split('-').reverse().join('/') : '—';
  }
}
