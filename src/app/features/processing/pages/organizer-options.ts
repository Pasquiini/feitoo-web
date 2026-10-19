import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrganizerOptions } from '../models/processing';

@Component({
  selector: 'app-organizer-options',
  imports: [FormsModule],
  styleUrl: './organizer-options.scss',
  template: `
    <fieldset class="organizer-options" [disabled]="disabled()">
      <legend class="h5">Como organizar seus XMLs</legend>
      <p class="option-hint" id="organizer-criterion-label">Escolha a estrutura das pastas</p>
      <div
        class="criterion-grid"
        id="organizer-criterion"
        role="group"
        aria-labelledby="organizer-criterion-label"
      >
        @for (criterion of criteria; track criterion.value) {
          <label
            class="criterion-option"
            [class.selected]="options().criterion === criterion.value"
          >
            <input
              type="radio"
              name="organizer-criterion"
              [value]="criterion.value"
              [checked]="options().criterion === criterion.value"
              (change)="patch({ criterion: criterion.value })"
            />
            <span
              ><strong>{{ criterion.label }}</strong
              ><small>{{ criterion.description }}</small></span
            >
          </label>
        }
      </div>
      <div class="folder-preview">
        <span aria-hidden="true">↳</span>
        <div>
          <span class="option-hint">Prévia da estrutura</span>
          <p>{{ structure() }}</p>
        </div>
      </div>
      <div class="organizer-toggles">
        <label class="d-block mb-2"
          ><input
            type="checkbox"
            [ngModel]="options().standardize_names"
            (ngModelChange)="patch({ standardize_names: $event })"
          />
          Padronizar nomes com a chave de acesso confiável</label
        >
        <label class="d-block mb-2"
          ><input
            type="checkbox"
            [ngModel]="options().detect_duplicates"
            (ngModelChange)="patch({ detect_duplicates: $event })"
          />
          Identificar duplicados por conteúdo e chave</label
        >
        @if (options().detect_duplicates) {
          <label class="d-block mb-2" for="organizer-duplicates">Arquivos duplicados</label>
          <select
            id="organizer-duplicates"
            class="form-control mb-3"
            [ngModel]="options().duplicate_action"
            (ngModelChange)="patch({ duplicate_action: $event })"
          >
            <option value="separate">Separar em pastas de duplicados</option>
            <option value="keep">Manter nas pastas de organização</option>
          </select>
        }
        <label class="d-block mb-2"
          ><input
            type="checkbox"
            [ngModel]="options().report"
            (ngModelChange)="patch({ report: $event })"
          />
          Incluir relatório Excel no ZIP</label
        >
      </div>
      <p class="small text-secondary mb-0">
        Nenhum arquivo é descartado. Nomes repetidos recebem um sufixo. Campos ausentes são
        identificados sem inventar dados fiscais.
      </p>
    </fieldset>
  `,
})
export class OrganizerOptionsPanel {
  readonly criteria = [
    { value: 'year_month', label: 'Ano e mês', description: 'Separe por período de emissão' },
    { value: 'supplier', label: 'Fornecedor', description: 'Agrupe pelo emitente da nota' },
    {
      value: 'issuer_document',
      label: 'CNPJ / CPF',
      description: 'Pastas pelo documento do emitente',
    },
    {
      value: 'year_month_supplier',
      label: 'Período + fornecedor',
      description: 'Combine data e emitente',
    },
    { value: 'model', label: 'Modelo fiscal', description: 'Separe NF-e e NFC-e' },
  ] as const;
  structure(): string {
    const structures = {
      year_month: 'Ano → Mês → XMLs',
      supplier: 'Fornecedor → XMLs',
      issuer_document: 'CNPJ ou CPF → XMLs',
      year_month_supplier: 'Ano → Mês → Fornecedor → XMLs',
      model: 'Modelo fiscal → XMLs',
    };
    return structures[this.options().criterion];
  }

  readonly options = input.required<OrganizerOptions>();
  readonly disabled = input(false);
  readonly changed = output<OrganizerOptions>();
  patch(patch: Partial<OrganizerOptions>): void {
    this.changed.emit({ ...this.options(), ...patch });
  }
}
