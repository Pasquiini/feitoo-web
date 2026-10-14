import { Component, input } from '@angular/core';

@Component({
  selector: 'app-tool-icon',
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
      width: 1.15em;
      height: 1.15em;
    }
  `,
})
export class ToolIcon {
  readonly name = input.required<
    'xml' | 'product' | 'spreadsheet' | 'pdf' | 'success' | 'info' | 'download'
  >();
  readonly paths = {
    xml: 'M14 2H5v20h14V7z M14 2v5h5 M9 11l-3 3 3 3 M15 11l3 3-3 3',
    product: 'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10 M7 4l9 5',
    spreadsheet: 'M14 2H5v20h14V7z M14 2v5h5 M8 11h8v7H8z M12 11v7 M8 14h8',
    pdf: 'M14 2H5v20h14V7z M14 2v5h5 M8 12h8 M8 15h8 M8 18h5',
    success: 'M9 12l2 2 4-4 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  };
}
