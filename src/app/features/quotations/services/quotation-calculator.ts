import {
  QuotationCalculation,
  QuotationEditorValue,
  QuotationPayload,
  quotationLimits,
} from '../models/quotation';

/** Brazilian input → canonical decimal. No grouping for quantity/percentage. */
export function parseDecimal(
  input: string,
  places: number,
): { canonical: string; scaled: bigint } | null {
  const text = input.trim();
  const match = new RegExp(`^(0|[1-9][0-9]{0,6})(?:[,.]([0-9]{1,${places}}))?$`).exec(text);
  if (!match) return null;
  const fraction = match[2] ?? '';
  return {
    canonical: match[1] + (fraction ? '.' + fraction : ''),
    scaled: BigInt(match[1]) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0')),
  };
}

export function parseQuantity(text: string) {
  const value = parseDecimal(text, 4);
  return value && value.scaled > 0n && value.scaled <= quotationLimits.quantityScaled
    ? value
    : null;
}

export function parsePercent(text: string) {
  const value = parseDecimal(text, 2);
  return value && value.scaled <= 10000n ? value : null;
}

export function parseMoneyInput(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/, '');
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{0,2})?$/.test(text)) return null;
  // Bound before constructing a BigInt from a pasted, arbitrarily long number.
  if (text.length > 24) return null;
  const [integer, fraction = ''] = text.replaceAll('.', '').split(',');
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function formatCents(cents: number | null): string {
  if (cents === null || !Number.isSafeInteger(cents) || cents < 0) return '—';
  const value = BigInt(cents);
  return (
    (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
    ',' +
    (value % 100n).toString().padStart(2, '0')
  );
}

function validCents(value: number | null, maximum: number): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

export function calculateQuotation(
  value: Pick<
    QuotationEditorValue,
    'items' | 'discount_type' | 'discount_fixed_cents' | 'discount_percent'
  >,
): QuotationCalculation {
  const lines = value.items.map((item) => {
    const quantity = parseQuantity(item.quantity);
    if (!quantity || !validCents(item.unit_price_cents, quotationLimits.unitPriceCents))
      return null;
    const rounded = (quantity.scaled * BigInt(item.unit_price_cents) + 5000n) / 10000n;
    return rounded <= BigInt(quotationLimits.totalCents) ? Number(rounded) : null;
  });
  const invalid = (error: string): QuotationCalculation => ({
    lines,
    subtotal: null,
    discount: null,
    total: null,
    error,
  });
  if (!lines.length || lines.length > quotationLimits.items || lines.some((line) => line === null))
    return invalid('Confira as quantidades e os valores dos itens.');
  const subtotal = lines.reduce<bigint>((sum, line) => sum + BigInt(line!), 0n);
  if (subtotal > BigInt(quotationLimits.totalCents))
    return invalid('O subtotal ultrapassa o limite de R$ 1 bilhão.');
  let discount: bigint;
  if (value.discount_type === 'percent') {
    const percent = parsePercent(value.discount_percent);
    if (!percent) return invalid('Use um desconto entre 0 e 100%, com até duas casas decimais.');
    discount = (subtotal * percent.scaled + 5000n) / 10000n;
  } else {
    if (!validCents(value.discount_fixed_cents, quotationLimits.totalCents))
      return invalid('Informe um desconto válido em reais.');
    discount = BigInt(value.discount_fixed_cents);
  }
  if (discount > subtotal)
    return {
      lines,
      subtotal: Number(subtotal),
      discount: null,
      total: null,
      error: 'O desconto não pode ser maior que o subtotal.',
    };
  return {
    lines,
    subtotal: Number(subtotal),
    discount: Number(discount),
    total: Number(subtotal - discount),
    error: null,
  };
}

/** Only called after form validation; no request or serialization side effect. */
export function quotationPayload(value: QuotationEditorValue): QuotationPayload | null {
  if (calculateQuotation(value).error) return null;
  return {
    schema_version: 1,
    currency: 'BRL',
    number: value.number,
    issue_date: value.issue_date,
    valid_until: value.valid_until,
    issuer: { ...value.issuer },
    customer: { ...value.customer },
    items: value.items.map((item) => ({
      description: item.description,
      quantity: parseQuantity(item.quantity)!.canonical,
      unit_price_cents: item.unit_price_cents!,
    })),
    discount:
      value.discount_type === 'percent'
        ? { type: 'percent', value: parsePercent(value.discount_percent)!.canonical }
        : { type: 'fixed', value: value.discount_fixed_cents! },
    conditions: value.conditions,
    notes: value.notes,
    template_id: value.template_id,
  };
}
