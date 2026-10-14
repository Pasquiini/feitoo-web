import { Component } from '@angular/core';
import { HomePlans } from './home-plans';

@Component({
  selector: 'app-plans-page',
  imports: [HomePlans],
  template: `<main class="container py-5">
    <h1>Planos Feitoo</h1>
    <p>Escolha a forma de usar as ferramentas na sua rotina.</p>
    <app-home-plans />
  </main>`,
})
export class PlansPage {}
