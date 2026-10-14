import { guidePages } from './guide-pages';
export const publicPages = {
  ...guidePages,
  '/planos': {
    title: 'Planos Free, Avulso e Pro | Feitoo',
    description: 'Compare os planos Feitoo para processar seus XMLs.',
  },
  '/produtos-dos-xmls': {
    title: 'Extrair Produtos de XML NF-e para Excel | Feitoo',
    description:
      'Extraia e consolide produtos de vários XMLs de NF-e em uma planilha. Some quantidades e organize os itens automaticamente.',
  },
  '/': {
    title: 'Feitoo | Ferramentas online para XML, planilhas e arquivos',
    description:
      'Ferramentas online rápidas para transformar XMLs, gerar planilhas e resolver tarefas com arquivos. Use direto no navegador com o Feitoo.',
  },
  '/xml-para-excel': {
    title: 'XML para Excel Online | Converter NF-e em Planilha | Feitoo',
    description:
      'Converta arquivos XML de NF-e para Excel online. Extraia dados das notas e gere uma planilha organizada em poucos passos.',
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
