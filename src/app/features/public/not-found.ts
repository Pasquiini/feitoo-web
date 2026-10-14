import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `<section class="hero">
    <p class="eyebrow">404</p>
    <h1>Esse caminho não existe.</h1>
    <p>Mas sua próxima tarefa pode começar aqui.</p>
    <div class="d-flex flex-wrap gap-3">
      <a class="btn btn-primary" routerLink="/">Voltar ao início</a
      ><a class="btn btn-outline-primary" routerLink="/xml-para-excel">XML para Excel</a>
    </div>
  </section>`,
})
export class NotFoundPage {}
