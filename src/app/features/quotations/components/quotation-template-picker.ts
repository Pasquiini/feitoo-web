import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { QuotationTemplate } from '../models/quotation';

@Component({
  selector: 'app-quotation-template-picker',
  imports: [ReactiveFormsModule],
  template: `<fieldset class="template-picker">
    <legend>Modelo do documento</legend>
    <div class="template-options">
      @for (option of options; track option.value) {
        <label [class.selected]="control().value === option.value">
          <input
            type="radio"
            [id]="'quotation-template-' + option.value"
            name="quotation-template"
            [value]="option.value"
            [formControl]="control()"
          />
          <span class="mini-paper" [class.modern]="option.value === 'modern'" aria-hidden="true"
            ><i></i><i></i><i></i><b></b
          ></span>
          <span
            ><strong>{{ option.title }}</strong
            ><small>{{ option.description }}</small></span
          >
        </label>
      }
    </div>
  </fieldset>`,
  styles: `
    :host {
      display: block;
    }
    .template-picker {
      border: 0;
      padding: 0;
      margin: 0;
    }
    .template-picker legend {
      font-size: 0.85rem;
      font-weight: 650;
      margin-bottom: 0.75rem;
    }
    .template-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .template-options label {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.8rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      cursor: pointer;
      min-width: 0;
    }
    .template-options .selected {
      border-color: var(--color-primary);
      background: #f2f8ef;
    }
    .template-options label:focus-within {
      outline: 3px solid var(--color-primary);
      outline-offset: 3px;
    }
    .template-options input {
      position: absolute;
      right: 0.55rem;
      top: 0.55rem;
      accent-color: var(--color-primary);
      margin: 0;
    }
    .template-options strong {
      display: block;
      font-size: 0.85rem;
    }
    .template-options small {
      display: block;
      font-size: 0.7rem;
      color: var(--color-muted);
    }
    .mini-paper {
      display: block;
      width: 28px;
      min-width: 28px;
      height: 38px;
      border: 1px solid #b8c9be;
      background: white;
      padding: 6px 4px;
    }
    .mini-paper i {
      display: block;
      background: #dce2dc;
      height: 2px;
      margin-bottom: 4px;
    }
    .mini-paper b {
      display: block;
      border-top: 2px solid #465b51;
      width: 70%;
      margin-left: auto;
      margin-top: 5px;
    }
    .mini-paper.modern i:first-child {
      background: #125d54;
      height: 4px;
    }
    .mini-paper.modern b {
      border-top: 5px solid #125d54;
    }
    @media (max-width: 360px) {
      .template-options label {
        padding: 0.7rem 0.45rem;
        gap: 0.4rem;
      }
      .template-options small {
        font-size: 0.65rem;
      }
    }
  `,
})
export class QuotationTemplatePicker {
  readonly control = input.required<FormControl<QuotationTemplate>>();
  readonly options = [
    { value: 'modern', title: 'Moderno', description: 'Verde e marcante' },
    { value: 'classic', title: 'Clássico', description: 'Discreto e elegante' },
  ] as const;
}
