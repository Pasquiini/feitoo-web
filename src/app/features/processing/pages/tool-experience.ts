import { Component, computed, input, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HOME_TOOLS } from '../../public/home-tools';

@Component({
  selector: 'app-tool-hero',
  styleUrl: './tool-hero.scss',
  template: `
    <header class="tool-hero">
      <div>
        <p class="tool-kicker">
          {{ entry()?.category }} <span aria-hidden="true">/</span> {{ entry()?.inputLabel }} →
          {{ entry()?.outputLabel }}
        </p>
        <h1 id="tool-title">{{ title() }}</h1>
        <p class="tool-subtitle">{{ subtitle() }}</p>
      </div>
      <ul class="tool-hero-tags" aria-label="Recursos da ferramenta">
        @for (tag of entry()?.tags; track tag) {
          <li>{{ tag }}</li>
        }
      </ul>
    </header>
  `,
})
export class ToolHero {
  readonly path = input.required<string>();
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly entry = computed(() => HOME_TOOLS.find((tool) => tool.route === this.path()));
}

@Component({
  selector: 'app-tool-workspace',
  styleUrl: './tool-experience.scss',
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="tool-workspace" [attr.aria-label]="name() + ': área de trabalho'">
      <div class="workspace-bar">
        <span class="workspace-name"
          ><span class="workspace-mark" aria-hidden="true">↳</span> {{ name() }}</span
        >
        <span class="workspace-context"
          >Área de trabalho <span aria-hidden="true">·</span> {{ count() }}
          {{ count() === 1 ? 'arquivo' : 'arquivos' }}</span
        >
      </div>
      <div class="workspace-body"><ng-content /></div>
    </section>
  `,
})
export class ToolWorkspace {
  readonly name = input.required<string>();
  readonly count = input(0);
}

@Component({
  selector: 'app-tool-uploader',
  host: { '[class.uploader-disabled]': 'disabled()' },
  template: `
    <div class="uploader-intro">
      <span class="uploader-file" aria-hidden="true"
        ><svg viewBox="0 0 32 40" fill="none">
          <path
            d="M3 1h17l9 9v28H3z M20 1v10h9 M16 30V17m-5 5 5-5 5 5"
            stroke="currentColor"
            stroke-width="1.5"
          /></svg
        >{{ format() }}</span
      >
      <div>
        <p class="uploader-caption">
          {{ count() ? 'Continue seu lote' : 'Comece pelos arquivos' }}
        </p>
        <h2>{{ heading() }}</h2>
        <p class="uploader-help">
          {{
            count()
              ? count() + ' arquivos na seleção. Você pode adicionar mais.'
              : 'Solte os arquivos nesta área ou selecione no seu dispositivo.'
          }}
        </p>
      </div>
    </div>
    <div class="uploader-controls"><ng-content /></div>
  `,
})
export class ToolUploader {
  readonly format = input('XML');
  readonly heading = input('Arraste seus XMLs aqui');
  readonly count = input(0);
  readonly disabled = input(false);
}

export type ToolVisualState =
  | 'idle'
  | 'files-selected'
  | 'uploading'
  | 'pending'
  | 'queued'
  | 'processing'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'error'
  | 'expired';
const statuses: Record<
  ToolVisualState,
  { label: string; title: string; text: string; icon: string }
> = {
  idle: {
    label: 'Pronto para começar',
    title: 'Escolha seus arquivos',
    text: 'Selecione os arquivos para preparar seu lote.',
    icon: '↑',
  },
  'files-selected': {
    label: 'Seleção pronta',
    title: 'Tudo pronto para enviar',
    text: 'Confira os arquivos antes de continuar.',
    icon: '↳',
  },
  uploading: {
    label: 'Enviando',
    title: 'Preparando seus arquivos',
    text: 'Recebendo seus arquivos. O processamento começa depois do envio.',
    icon: '↑',
  },
  pending: {
    label: 'Enviando',
    title: 'Preparando seus arquivos',
    text: 'Preparando o lote para processamento.',
    icon: '↑',
  },
  queued: {
    label: 'Na fila',
    title: 'Seu lote está na fila',
    text: 'Recebemos os arquivos. O processamento começará quando chegar a sua vez.',
    icon: '◷',
  },
  processing: {
    label: 'Em processamento',
    title: 'Trabalhando nos seus arquivos',
    text: 'Você pode acompanhar o andamento abaixo.',
    icon: '↻',
  },
  partial: {
    label: 'Conclusão parcial',
    title: 'Resultado pronto, com observações',
    text: 'Os arquivos concluídos estão disponíveis. Confira também os que tiveram problemas.',
    icon: '!',
  },
  completed: {
    label: 'Concluído',
    title: 'Tudo pronto.',
    text: 'Confira o resultado e baixe seus arquivos.',
    icon: '✓',
  },
  failed: {
    label: 'Não concluído',
    title: 'Não foi possível concluir este processamento',
    text: 'Confira a mensagem abaixo. Você pode selecionar outros arquivos para tentar novamente.',
    icon: '!',
  },
  error: {
    label: 'Atenção ao processamento',
    title: 'Precisamos da sua atenção',
    text: 'Confira a mensagem abaixo e as ações disponíveis para continuar.',
    icon: '!',
  },
  expired: {
    label: 'Indisponível',
    title: 'Arquivos expirados ou excluídos',
    text: 'Envie os arquivos novamente para gerar um novo resultado.',
    icon: '◷',
  },
};

@Component({
  selector: 'app-tool-status',
  template: `
    <div
      class="tool-status"
      [attr.data-state]="state()"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span class="status-symbol" aria-hidden="true">{{ status().icon }}</span>
      <div>
        <p class="status-label">{{ status().label }}</p>
        <h2>{{ title() || status().title }}</h2>
        <p>{{ status().text }}</p>
      </div>
    </div>
  `,
})
export class ToolStatus {
  readonly state = input<ToolVisualState>('idle');
  readonly title = input('');
  readonly status = computed(() => statuses[this.state()]);
}

@Component({
  selector: 'app-tool-security',
  imports: [RouterLink],
  template: `<p class="tool-security">
    <span aria-hidden="true">◇</span
    ><span
      >Armazenamento privado. Seus arquivos são temporários e excluídos conforme o período de
      retenção. <a routerLink="/seguranca">Entenda a proteção dos arquivos →</a></span
    >
  </p>`,
})
export class ToolSecurityNote {}

@Component({
  selector: 'app-tool-related',
  styleUrl: './tool-related.scss',
  imports: [RouterLink],
  template: `
    <aside class="tool-related" aria-label="Ferramentas relacionadas">
      <h2>Continue resolvendo por aqui</h2>
      <div>
        @for (tool of related(); track tool.route) {
          <a [routerLink]="tool.route"
            ><span>{{ tool.inputLabel }} → {{ tool.outputLabel }}</span
            ><strong>{{ tool.title }}</strong
            ><span aria-hidden="true">↗</span></a
          >
        }
      </div>
    </aside>
  `,
})
export class ToolRelated {
  readonly path = input.required<string>();
  readonly related = computed(() => {
    const current = HOME_TOOLS.find((tool) => tool.route === this.path());
    return HOME_TOOLS.filter(
      (tool) =>
        tool.route !== this.path() &&
        (tool.category === current?.category || tool.outputLabel === current?.outputLabel),
    ).slice(0, 3);
  });
}
