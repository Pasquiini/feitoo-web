import { guidePages } from './guide-pages';
export const publicPages = {
  '/docx-para-pdf': {
    title: 'DOCX para PDF Online | Converter Word em PDF | Feitoo',
    description:
      'Converta arquivos DOCX do Word para PDF online. Envie seus documentos e baixe os PDFs prontos em poucos passos.',
  },
  '/analisar-xml': {
    title: 'Analisador de XML NF-e Online | Dashboard e Excel | Feitoo',
    description:
      'Analise vários XMLs de notas fiscais online. Visualize valores, emitentes, produtos e tributos em um dashboard e exporte relatórios para Excel.',
  },
  '/organizar-xml': {
    title: 'Organizador de XML Online | Notas por CNPJ e Mês | Feitoo',
    description:
      'Organize arquivos XML de notas fiscais automaticamente por fornecedor, CNPJ, mês ou ano. Envie seus XMLs e baixe tudo organizado em ZIP.',
  },
  '/xml-para-pdf': {
    title: 'XML para PDF Online | Gerar DANFE de NF-e | Feitoo',
    description:
      'Converta XML de nota fiscal em DANFE PDF online. Envie seu arquivo NF-e, visualize o documento e baixe o PDF.',
  },
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
    title: 'Feitoo | Ferramentas Online para XML, Word, PDF e Planilhas',
    description:
      'Converta XML, Word e outros arquivos online. Organize documentos, gere planilhas e PDFs e resolva tarefas em poucos passos com o Feitoo.',
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
