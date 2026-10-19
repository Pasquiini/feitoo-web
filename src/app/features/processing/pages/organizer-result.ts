import { Component, computed, input, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { OrganizerSummary, ProcessingFile } from '../models/processing';

@Component({
  selector: 'app-organizer-result',
  imports: [KeyValuePipe],
  styles: `
    .organization-result {
      padding: 1.25rem;
      background: #f1f5eb;
      border-top: 3px solid #125d54;
      margin: 1.5rem 0;
    }
    h2 {
      font-size: 1.2rem;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.65rem 1rem;
    }
    dt {
      font-weight: 500;
      color: #526158;
      font-size: 0.85rem;
    }
    dd {
      margin: 0;
      text-align: right;
      font-weight: 700;
    }
  `,
  template: `
    @if (summary(); as s) {
      <section class="organization-result" aria-labelledby="organizer-summary-title">
        <h2 id="organizer-summary-title" class="h5">Resumo da organização</h2>
        @if (s.organized_count === 0) {
          <p role="status">
            Não encontramos documentos fiscais compatíveis. Os arquivos seguros foram preservados na
            pasta de problemas, sem consumir seu limite.
          </p>
        } @else if (s.invalid_count) {
          <p role="status">
            Organização concluída parcialmente. Confira os arquivos com problemas.
          </p>
        } @else {
          <p role="status">Seus XMLs foram organizados com sucesso.</p>
        }
        <dl class="row">
          <dt class="col-8">Arquivos enviados</dt>
          <dd class="col-4">{{ s.total_files }}</dd>
          <dt class="col-8">Organizados</dt>
          <dd class="col-4">{{ s.organized_count }}</dd>
          <dt class="col-8">Inválidos ou incompatíveis</dt>
          <dd class="col-4">{{ s.invalid_count }}</dd>
          <dt class="col-8">Originais preservados no ZIP</dt>
          <dd class="col-4">{{ s.preserved_count }}</dd>
          <dt class="col-8">Fornecedores identificados</dt>
          <dd class="col-4">{{ s.suppliers_count }}</dd>
          <dt class="col-8">Duplicados após o primeiro</dt>
          <dd class="col-4">
            {{ s.duplicate_detection ? s.duplicates_count : 'Detecção desativada' }}
          </dd>
          <dt class="col-8">Chaves com conteúdo divergente</dt>
          <dd class="col-4">
            {{ s.duplicate_detection ? s.conflicting_keys_count : 'Não verificado' }}
          </dd>
        </dl>
        @if (s.duplicates_count) {
          <p role="status">
            Arquivos duplicados encontrados. Todos foram mantidos conforme sua escolha.
          </p>
        }
        @if (s.conflicting_keys_count) {
          <p class="feedback feedback-error">
            Há documentos com a mesma chave e conteúdos diferentes. Confira as observações;
            igualdade de chave não significa igualdade de conteúdo.
          </p>
        }
        <h3 class="h6">Documentos organizados por mês</h3>
        <ul>
          @for (month of s.documents_by_month | keyvalue; track month.key) {
            <li>{{ month.key }}: {{ month.value }}</li>
          } @empty {
            <li>Nenhuma data confiável identificada.</li>
          }
        </ul>
        <p class="small">{{ s.notice }}</p>
      </section>
    }
    @if (files().length) {
      <section aria-labelledby="organizer-files-title" class="my-3">
        <h2 id="organizer-files-title" class="h5">Destino dos arquivos</h2>
        <ul class="list-group">
          @for (file of visible(); track file.id) {
            <li class="list-group-item">
              <strong style="overflow-wrap:anywhere">{{ file.original_name }}</strong>
              <p class="mb-1">
                {{
                  file.status === 'completed'
                    ? 'Organizado'
                    : file.status === 'failed'
                      ? 'Com problemas'
                      : 'Aguardando organização'
                }}
              </p>
              @if (file.organization; as result) {
                <p class="small" style="overflow-wrap:anywhere">
                  {{ result.archive_path ?? 'Não incluído no ZIP' }}
                </p>
                @for (note of result.notes; track $index) {
                  <p class="small mb-1">{{ note }}</p>
                }
              } @else if (file.error_message) {
                <p>{{ file.error_message }}</p>
              }
            </li>
          }
        </ul>
        @if (files().length > 10) {
          <nav aria-label="Páginas dos arquivos organizados" class="d-flex flex-wrap gap-2 my-2">
            <button
              type="button"
              class="btn btn-outline-secondary"
              [disabled]="page() === 0"
              (click)="page.set(page() - 1)"
            >
              Anterior
            </button>
            <span>Página {{ page() + 1 }} de {{ pages() }}</span>
            <button
              type="button"
              class="btn btn-outline-secondary"
              [disabled]="page() + 1 >= pages()"
              (click)="page.set(page() + 1)"
            >
              Próxima
            </button>
          </nav>
        }
      </section>
    }
  `,
})
export class OrganizerResultPanel {
  readonly summary = input<OrganizerSummary | null>(null);
  readonly files = input<readonly ProcessingFile[]>([]);
  readonly page = signal(0);
  readonly pages = computed(() => Math.ceil(this.files().length / 10));
  readonly visible = computed(() => this.files().slice(this.page() * 10, (this.page() + 1) * 10));
}
