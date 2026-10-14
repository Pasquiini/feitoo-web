import { Component, input } from '@angular/core';

@Component({
  selector: 'app-home-icon',
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="paths[name()]" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
      flex-shrink: 0;
    }
    svg {
      width: 1.25em;
      height: 1.25em;
    }
  `,
})
export class HomeIcon {
  readonly name = input.required<
    | 'xml'
    | 'excel'
    | 'product'
    | 'pdf'
    | 'shield'
    | 'speed'
    | 'browser'
    | 'upload'
    | 'download'
    | 'check'
    | 'arrow'
    | 'search'
  >();
  readonly paths = {
    search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6',
    xml: 'M14 2H5v20h14V7z M14 2v5h5 M9 11l-3 3 3 3 M15 11l3 3-3 3',
    excel: 'M14 2H5v20h14V7z M14 2v5h5 M8 11h8v7H8z M12 11v7 M8 14h8',
    product: 'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10 M7 4l9 5',
    pdf: 'M14 2H5v20h14V7z M14 2v5h5 M8 12h8 M8 15h8 M8 18h5',
    shield: 'M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z M8 11l3 3 5-5',
    speed: 'M12 3v3 M8 2h8 M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 14l4-4',
    browser: 'M3 4h18v16H3z M3 8h18 M6 6h.01 M9 6h.01 M12 6h.01',
    upload: 'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    check: 'M5 12l4 4L19 6',
    arrow: 'M4 12h16 M14 6l6 6-6 6',
  };
}
