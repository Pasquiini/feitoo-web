import { FormArray, FormControl, FormGroup } from '@angular/forms';

export const quotationLimits = {
  items: 100,
  description: 1000,
  notes: 4000,
  quantityScaled: 10000000000n,
  unitPriceCents: 1000000000,
  totalCents: 100000000000,
  logoBytes: 2097152,
  logoPixels: 4000000,
  logoSide: 1200,
} as const;

export type QuotationTemplate = 'classic' | 'modern';
export type DiscountType = 'fixed' | 'percent';
export interface QuotationParty {
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
}
export type PartyForm = FormGroup<{
  [K in keyof QuotationParty]: FormControl<string>;
}>;
export type ItemForm = FormGroup<{
  description: FormControl<string>;
  quantity: FormControl<string>;
  unit_price_cents: FormControl<number | null>;
}>;
export interface QuotationItemInput {
  description: string;
  quantity: string;
  unit_price_cents: number | null;
}
export interface QuotationEditorValue {
  /** Draft-only display text, including incomplete/invalid currency input. Never used for totals. */
  money_inputs?: { prices: string[]; fixed_discount: string };
  number: string;
  issue_date: string;
  valid_until: string;
  issuer: QuotationParty;
  customer: QuotationParty;
  items: QuotationItemInput[];
  discount_type: DiscountType;
  discount_fixed_cents: number | null;
  discount_percent: string;
  conditions: string;
  notes: string;
  template_id: QuotationTemplate;
}
export type QuotationForm = FormGroup<{
  number: FormControl<string>;
  issue_date: FormControl<string>;
  valid_until: FormControl<string>;
  issuer: PartyForm;
  customer: PartyForm;
  items: FormArray<ItemForm>;
  discount_type: FormControl<DiscountType>;
  discount_fixed_cents: FormControl<number | null>;
  discount_percent: FormControl<string>;
  conditions: FormControl<string>;
  notes: FormControl<string>;
  template_id: FormControl<QuotationTemplate>;
}>;

/** Future wire contract; totals/logo are deliberately separate from this DTO. */
export interface QuotationPayload {
  schema_version: 1;
  currency: 'BRL';
  number: string;
  issue_date: string;
  valid_until: string;
  issuer: QuotationParty;
  customer: QuotationParty;
  items: { description: string; quantity: string; unit_price_cents: number }[];
  discount: { type: 'fixed'; value: number } | { type: 'percent'; value: string };
  conditions: string;
  notes: string;
  template_id: QuotationTemplate;
}

export interface QuotationCalculation {
  lines: (number | null)[];
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  error: string | null;
}
