import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { PartyForm, QuotationParty } from '../models/quotation';
import { fieldError } from '../services/quotation-form';

@Component({
  selector: 'app-quotation-party',
  imports: [ReactiveFormsModule],
  template: `
    <fieldset [formGroup]="group()" class="editor-section">
      <legend>
        <span class="section-number" aria-hidden="true">{{ step() }}</span
        >{{ title() }}
      </legend>
      <div class="field">
        <label [for]="prefix() + '-name'"
          >{{ prefix() === 'issuer' ? 'Seu nome ou empresa' : 'Nome do cliente' }}
          <span aria-hidden="true">*</span></label
        >
        <input
          class="form-control"
          [id]="prefix() + '-name'"
          formControlName="name"
          maxlength="160"
          autocomplete="off"
          [placeholder]="
            prefix() === 'issuer' ? 'Como você quer se apresentar' : 'Para quem é este orçamento'
          "
          [attr.aria-invalid]="!!error(group().controls.name)"
          [attr.aria-describedby]="prefix() + '-name-error'"
          required
        />
        <span class="field-error" [id]="prefix() + '-name-error'">{{
          error(group().controls.name)
        }}</span>
      </div>
      <details class="optional-fields">
        <summary>Dados de contato <span>opcional</span></summary>
        <div class="fields-grid">
          @for (field of fields; track field.key) {
            <div class="field" [class.full-width]="field.key === 'address'">
              <label [for]="prefix() + '-' + field.key">{{ field.label }}</label>
              <input
                class="form-control"
                [id]="prefix() + '-' + field.key"
                [type]="field.type"
                [formControlName]="field.key"
                [maxlength]="field.max"
                autocomplete="off"
                (blur)="formatContact(field.key)"
                [attr.aria-invalid]="!!error(group().controls[field.key])"
                [attr.aria-describedby]="prefix() + '-' + field.key + '-error'"
              />
              <span class="field-error" [id]="prefix() + '-' + field.key + '-error'">{{
                error(group().controls[field.key])
              }}</span>
            </div>
          }
        </div>
      </details>
    </fieldset>
  `,
})
export class QuotationPartyFields {
  readonly group = input.required<PartyForm>();
  readonly prefix = input.required<'issuer' | 'customer'>();
  readonly title = input.required<string>();
  readonly step = input.required<string>();
  readonly error = fieldError;
  formatContact(key: Exclude<keyof QuotationParty, 'name'>): void {
    const control = this.group().controls[key];
    const value = control.value.trim();
    if (key === 'document' && /^[\d.\-/\s]+$/.test(value)) {
      const digits = value.replace(/\D/g, '');
      if (digits.length === 11)
        control.setValue(digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'));
      else if (digits.length === 14)
        control.setValue(digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'));
    } else if (key === 'phone' && /^[\d()+\-\s]+$/.test(value)) {
      const digits = value.replace(/\D/g, '');
      const international = digits.startsWith('55') && [12, 13].includes(digits.length);
      const local = international ? digits.slice(2) : digits;
      if ([10, 11].includes(local.length))
        control.setValue(
          (international ? '+55 ' : '') + local.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'),
        );
    }
  }
  readonly fields: {
    key: Exclude<keyof QuotationParty, 'name'>;
    label: string;
    type: string;
    max: number;
  }[] = [
    { key: 'document', label: 'CPF / CNPJ', type: 'text', max: 30 },
    { key: 'phone', label: 'Telefone', type: 'tel', max: 40 },
    { key: 'email', label: 'E-mail', type: 'email', max: 254 },
    { key: 'address', label: 'Endereço', type: 'text', max: 400 },
  ];
}
