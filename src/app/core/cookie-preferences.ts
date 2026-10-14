import { Component, inject } from '@angular/core';
import { AnalyticsService } from './analytics.service';
@Component({
  selector: 'app-cookie-preferences',
  template: ` @if (
    (analytics.enabled && analytics.choice() === 'unknown') || analytics.preferences()
  ) {
    <aside class="cookie-panel" aria-labelledby="cookies-title">
      <h2 id="cookies-title" class="h5">Cookies opcionais, escolha sua preferência</h2>
      @if (analytics.enabled) {
        <p>
          Podemos medir o uso da ferramenta com Google Analytics, sem enviar seus arquivos ou dados
          fiscais. Só carregamos essa medição se você aceitar.
        </p>
        <div class="d-flex flex-wrap gap-2">
          <button
            class="btn btn-outline-secondary"
            type="button"
            (click)="analytics.choose('denied')"
          >
            Recusar opcionais</button
          ><button class="btn btn-primary" type="button" (click)="analytics.choose('granted')">
            Aceitar medição
          </button>
        </div>
      } @else {
        <p>
          A medição opcional está desabilitada. Usamos somente os mecanismos necessários à sessão e
          à proteção do serviço.
        </p>
        <button
          class="btn btn-outline-secondary"
          type="button"
          (click)="analytics.preferences.set(false)"
        >
          Fechar preferências
        </button>
      }
    </aside>
  }`,
})
export class CookiePreferences {
  readonly analytics = inject(AnalyticsService);
}
