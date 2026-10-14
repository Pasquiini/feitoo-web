export const publicPages = {
  '/planos': {
    title: 'Planos Free, Avulso e Pro | Feitoo',
    description: 'Compare os planos Feitoo para processar seus XMLs.',
  },
  '/produtos-dos-xmls': {
    title: 'Extrair produtos de XML NF-e para Excel | Feitoo',
    description: 'Extraia e consolide produtos de vários XMLs de NF-e em uma planilha organizada.',
  },
  '/': {
    title: 'Feitoo — Ferramentas online para XML e arquivos',
    description:
      'Converta XML de NF-e para Excel, consolide produtos e resolva tarefas com arquivos direto no navegador.',
  },
  '/xml-para-excel': {
    title: 'XML para Excel: converta NF-e em planilha | Feitoo',
    description:
      'Converta XMLs de NF-e modelo 55 em Excel com abas Notas e Itens. Envie seus arquivos, acompanhe o processamento e baixe sua planilha.',
  },
  '/seguranca': {
    title: 'Segurança dos seus arquivos | Feitoo',
    description:
      'Entenda o armazenamento privado, o acesso autenticado e a exclusão dos arquivos enviados ao Feitoo.',
  },
  '/privacidade': {
    title: 'Privacidade e cookies | Feitoo',
    description:
      'Saiba como o Feitoo utiliza dados da conta, arquivos enviados e cookies opcionais de medição.',
  },
  '/termos': {
    title: 'Termos de uso | Feitoo',
    description:
      'Condições de uso das ferramentas do Feitoo, processamento automatizado e responsabilidades sobre arquivos.',
  },
} as const;
export type PublicPath = keyof typeof publicPages;
export function safePage(url: string): PublicPath | '/404' | '/login' | '/cadastro' | '/conta' {
  const path = url.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return path in publicPages || path === '/login' || path === '/cadastro' || path === '/conta'
    ? (path as PublicPath | '/login' | '/cadastro' | '/conta')
    : '/404';
}
