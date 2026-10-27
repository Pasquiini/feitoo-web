import {
  calculateQuotation,
  formatCents,
  parseMoneyInput,
  parsePercent,
  parseQuantity,
  quotationPayload,
} from './quotation-calculator';
import { createQuotationForm } from './quotation-form';

describe('Quotation decimal contract', () => {
  const item = (quantity: string, unit_price_cents: number | null) => ({
    description: 'Serviço fictício',
    quantity,
    unit_price_cents,
  });
  const calculate = (items: ReturnType<typeof item>[], discount_fixed_cents = 0) =>
    calculateQuotation({
      items,
      discount_type: 'fixed',
      discount_fixed_cents,
      discount_percent: '0',
    });
  it('rounds HALF_UP per line using the Phase 1 vectors', () => {
    const result = calculateQuotation({
      items: [item('0,5', 101), item('0.5', 101), item('0,0001', 5000)],
      discount_type: 'percent',
      discount_fixed_cents: 0,
      discount_percent: '50,00',
    });
    expect(result).toEqual({
      lines: [51, 51, 1],
      subtotal: 103,
      discount: 52,
      total: 51,
      error: null,
    });
  });
  it('matches the fractional/fixed vector exactly', () => {
    expect(calculate([item('12,3456', 2750), item('0,5', 101)], 1000)).toEqual({
      lines: [33950, 51],
      subtotal: 34001,
      discount: 1000,
      total: 33001,
      error: null,
    });
  });
  it('accepts free items, high values and full discount', () => {
    expect(calculate([item('1', 0)]).total).toBe(0);
    expect(calculate([item('100', 1000000000)]).total).toBe(100000000000);
    expect(calculate([item('1', 123)], 123).total).toBe(0);
    expect(
      calculateQuotation({
        items: [item('1', 123)],
        discount_type: 'percent',
        discount_fixed_cents: 0,
        discount_percent: '100',
      }).total,
    ).toBe(0);
  });
  it('rejects subtotal overflow, too many items and discount above subtotal', () => {
    expect(calculate([item('100', 1000000000), item('1', 1)]).total).toBeNull();
    expect(calculate(Array.from({ length: 101 }, () => item('1', 1))).total).toBeNull();
    expect(calculate([item('1', 1)], 2).error).toContain('maior');
    expect(calculate([item('1000000', 1000000000)]).total).toBeNull();
  });
  it.each(['', '0', '-1', '1,00001', '01,2', '1e4', '1.000,2', '1000000,0001', 'NaN', 'Infinity'])(
    'rejects invalid quantity %s',
    (value) => {
      expect(parseQuantity(value)).toBeNull();
      expect(calculate([item(value, 100)]).total).toBeNull();
    },
  );
  it.each([null, -1, 100.5, 1000000001, NaN, Infinity])(
    'rejects invalid integer cents %s',
    (value) => expect(calculate([item('1', value)]).total).toBeNull(),
  );
  it.each(['-1', '100,01', '1,001', '1e2', ''])('rejects invalid percentage %s', (text) =>
    expect(parsePercent(text)).toBeNull(),
  );
  it.each([
    ['0,01', 1],
    ['1.234,56', 123456],
    ['R$ 1.234,50', 123450],
    ['150', 15000],
    ['0', 0],
    ['10.000.000,00', 1000000000],
  ])('parses Brazilian money %s', (input, expected) =>
    expect(parseMoneyInput(input)).toBe(expected),
  );
  it.each([
    '-1',
    '1e3',
    '1.23',
    '10,001',
    '1,2,3',
    'abc',
    '',
    '0.100',
    '999999999999999999999999999999999999',
  ])('rejects invalid money %s', (input) => expect(parseMoneyInput(input)).toBeNull());
  it('formats cents without converting through floating point', () => {
    expect(formatCents(100000000000)).toBe('1.000.000.000,00');
    expect(formatCents(1)).toBe('0,01');
    expect(formatCents(null)).toBe('—');
  });
  it('prepares canonical DTO fields without totals or logo', () => {
    const form = createQuotationForm();
    form.controls.items.at(0).patchValue(item('2,5000', 101));
    form.patchValue({ discount_type: 'percent', discount_percent: '12,50' });
    const payload = quotationPayload(form.getRawValue())!;
    expect(payload.items[0].quantity).toBe('2.5000');
    expect(payload.discount).toEqual({ type: 'percent', value: '12.50' });
    expect(payload.currency).toBe('BRL');
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('logo');
  });
});
