import { Component } from '@angular/core';
import { HomePlans } from './home-plans';

@Component({
  selector: 'app-plans-page',
  imports: [HomePlans],
  template: `<section class="py-5" aria-labelledby="plans-page-title">
    <h1 id="plans-page-title">Planos Feitoo</h1>
    <p>Escolha a forma de usar as ferramentas na sua rotina.</p>
    <app-home-plans />
  </section>`,
})
export class PlansPage {}
