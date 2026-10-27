import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ItemForm, PartyForm, QuotationForm, quotationLimits } from '../models/quotation';
import { parseQuantity } from './quotation-calculator';

export function textRules(max: number, required = false, singleLine = false): ValidatorFn {
  return (control) => {
    const value = control.value as string;
    if (required && !value.trim()) return { required: true };
    if ([...value].length > max) return { maxlength: true };
    if (
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uD800-\uDFFF]/u.test(value) ||
      (singleLine && /[\r\n\t]/.test(value))
    )
      return { text: true };
    return null;
  };
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateRules: ValidatorFn = (control) =>
  !control.value ? { required: true } : validDate(control.value) ? null : { date: true };
export const centsRules =
  (maximum: number): ValidatorFn =>
  (control) =>
    typeof control.value === 'number' &&
    Number.isSafeInteger(control.value) &&
    control.value >= 0 &&
    control.value <= maximum
      ? null
      : { money: true };

export function createItem(): ItemForm {
  return new FormGroup({
    description: new FormControl('', {
      nonNullable: true,
      validators: textRules(quotationLimits.description, true),
    }),
    quantity: new FormControl('1', {
      nonNullable: true,
      validators: (control) => (parseQuantity(control.value) ? null : { quantity: true }),
    }),
    unit_price_cents: new FormControl<number | null>(0, {
      validators: centsRules(quotationLimits.unitPriceCents),
    }),
  });
}

function createParty(): PartyForm {
  return new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: textRules(160, true, true) }),
    document: new FormControl('', { nonNullable: true, validators: textRules(30, false, true) }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [textRules(254, false, true), Validators.email],
    }),
    phone: new FormControl('', { nonNullable: true, validators: textRules(40, false, true) }),
    address: new FormControl('', { nonNullable: true, validators: textRules(400, false, true) }),
  });
}

export function createQuotationForm(): QuotationForm {
  return new FormGroup(
    {
      number: new FormControl('ORC-001', {
        nonNullable: true,
        validators: textRules(60, true, true),
      }),
      issue_date: new FormControl('', { nonNullable: true, validators: dateRules }),
      valid_until: new FormControl('', { nonNullable: true, validators: dateRules }),
      issuer: createParty(),
      customer: createParty(),
      items: new FormArray([createItem()]),
      discount_type: new FormControl<'fixed' | 'percent'>('fixed', { nonNullable: true }),
      discount_fixed_cents: new FormControl<number | null>(0),
      discount_percent: new FormControl('0', { nonNullable: true }),
      conditions: new FormControl('', {
        nonNullable: true,
        validators: textRules(quotationLimits.notes),
      }),
      notes: new FormControl('', {
        nonNullable: true,
        validators: textRules(quotationLimits.notes),
      }),
      template_id: new FormControl<'classic' | 'modern'>('modern', { nonNullable: true }),
    },
    {
      validators: (group) => {
        const { issue_date, valid_until } = group.getRawValue();
        return validDate(issue_date) && validDate(valid_until) && valid_until < issue_date
          ? { validity: true }
          : null;
      },
    },
  );
}

export function fieldError(control: AbstractControl): string {
  if (!control.invalid || (!control.dirty && !control.touched)) return '';
  if (control.hasError('required')) return 'Preencha este campo.';
  if (control.hasError('maxlength')) return 'O texto ultrapassa o tamanho permitido.';
  if (control.hasError('email')) return 'Informe um e-mail válido.';
  if (control.hasError('quantity'))
    return 'Use quantidade positiva, até 1 milhão, com no máximo 4 casas decimais.';
  if (control.hasError('money'))
    return 'Use reais com vírgula e até 2 casas, entre R$ 0,00 e R$ 10 milhões.';
  if (control.hasError('date')) return 'Informe uma data válida.';
  return 'Confira o formato deste campo.';
}
