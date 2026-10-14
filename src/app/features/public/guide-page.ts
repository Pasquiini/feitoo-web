import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { guidePages, GuidePath } from '../../core/guide-pages';

@Component({
  selector: 'app-guide-page',
  imports: [RouterLink],
  templateUrl: './guide-page.html',
  styleUrl: './guide-page.scss',
})
export class GuidePage {
  readonly path = inject(ActivatedRoute).snapshot.data['guide'] as GuidePath;
  readonly guide = guidePages[this.path];
  readonly xmlGuide = this.path === '/como-converter-xml-nfe-para-excel';
}
