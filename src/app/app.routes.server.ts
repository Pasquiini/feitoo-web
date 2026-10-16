import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [
  ...[
    '',
    'docx-para-pdf',
    'xml-para-excel',
    'xml-para-pdf',
    'organizar-xml',
    'analisar-xml',
    'produtos-dos-xmls',
    'planos',
    'seguranca',
    'privacidade',
    'termos',
    'como-converter-xml-nfe-para-excel',
    'como-extrair-produtos-de-xml-nfe',
    '404',
  ].map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  { path: '**', renderMode: RenderMode.Client },
];
