import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrganizerOptions } from '../models/processing';

@Component({
  selector: 'app-organizer-options',
  imports: [FormsModule],
  styles: `
    fieldset {
      min-inline-size: 0;
    }
    select {
      width: 100%;
      max-width: 100%;
      font: inherit;
    }
    input {
      accent-color: var(--color-primary);
      margin-right: 0.4rem;
    }
  `,
  template: `
    <fieldset class="border rounded p-3 my-3" [disabled]="disabled()">
      <legend class="h5">Como organizar seus XMLs</legend>
      <label class="d-block mb-2" for="organizer-criterion">Critério de organização</label>
      <select
        id="organizer-criterion"
        class="form-control mb-3"
        [ngModel]="options().criterion"
        (ngModelChange)="patch({ criterion: $event })"
      >
        <option value="year_month">Por ano e mês</option>
        <option value="supplier">Por fornecedor (emitente)</option>
        <option value="issuer_document">Por CNPJ/CPF do emitente</option>
        <option value="year_month_supplier">Por ano/mês e fornecedor</option>
        <option value="model">Por modelo de documento</option>
      </select>
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
      <p class="small text-secondary mb-0">
        Nenhum arquivo é descartado. Nomes repetidos recebem um sufixo. Campos ausentes são
        identificados sem inventar dados fiscais.
      </p>
    </fieldset>
  `,
})
export class OrganizerOptionsPanel {
  readonly options = input.required<OrganizerOptions>();
  readonly disabled = input(false);
  readonly changed = output<OrganizerOptions>();
  patch(patch: Partial<OrganizerOptions>): void {
    this.changed.emit({ ...this.options(), ...patch });
  }
}
