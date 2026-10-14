import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [
  ...[
    '',
    'xml-para-excel',
    'produtos-dos-xmls',
    'planos',
    'seguranca',
    'privacidade',
    'termos',
    '404',
  ].map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  { path: '**', renderMode: RenderMode.Client },
];
