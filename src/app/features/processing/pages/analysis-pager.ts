import { Component, input, output } from '@angular/core';
import { AnalysisPage } from '../models/analysis';
@Component({
  selector: 'app-analysis-pager',
  template: `@if (data(); as p) { <nav class="d-flex flex-wrap gap-2 my-3" [attr.aria-label]="label()">
    <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="busy() || p.page <= 1" (click)="changed.emit(p.page - 1)">Anterior</button>
    <span class="small">Página {{ p.page }} de {{ p.last_page }} · {{ p.total }} registros</span>
    <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="busy() || p.page >= p.last_page" (click)="changed.emit(p.page + 1)">Próxima</button>
  </nav> }`,
})
export class AnalysisPager {
  readonly data = input.required<AnalysisPage<unknown>>(); readonly label = input.required<string>();
  readonly busy = input(false); readonly changed = output<number>();
}
