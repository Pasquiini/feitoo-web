export interface ToolCard {
  title: string;
  description: string;
  benefit: string;
  route: string;
  icon: 'excel' | 'product';
  badge: string;
  category: string;
  keywords: readonly string[];
  meta: string;
  cta: string;
}

export const HOME_TOOLS: readonly ToolCard[] = [
  {
    title: 'XML para Excel',
    description: 'Transforme várias NF-e em uma planilha organizada.',
    benefit: 'Notas, emitentes, valores e itens em um único arquivo.',
    route: '/xml-para-excel',
    icon: 'excel',
    badge: 'Mais usado',
    category: 'XML Fiscal',
    keywords: ['xml', 'excel', 'planilha', 'nota fiscal', 'nfe', 'nf-e', 'converter', 'conversão'],
    meta: 'Até 20 XMLs grátis',
    cta: 'Abrir ferramenta',
  },
  {
    title: 'Produtos dos XMLs',
    description: 'Extraia e consolide os produtos das suas notas fiscais.',
    benefit: 'Quantidades, valores, NCM, fornecedores e muito mais.',
    route: '/produtos-dos-xmls',
    icon: 'product',
    badge: 'Novo',
    category: 'XML Fiscal',
    keywords: ['xml', 'excel', 'produto', 'nota fiscal', 'nfe', 'nf-e', 'ncm', 'resumo', 'extrair'],
    meta: 'Excel + resumo',
    cta: 'Usar agora',
  },
  {
    title: 'XML para PDF',
    description: 'Transforme XMLs de NF-e em DANFE PDF.',
    benefit: 'Visualize cada documento e baixe PDFs individuais ou em ZIP.',
    route: '/xml-para-pdf',
    icon: 'product',
    badge: 'Novo',
    category: 'XML Fiscal',
    keywords: ['xml', 'pdf', 'danfe', 'nota fiscal', 'nfe', 'nf-e', 'converter'],
    meta: 'DANFE PDF + ZIP',
    cta: 'Gerar DANFE',
  },
  {
    title: 'Organizador de XMLs',
    description: 'Separe notas fiscais por fornecedor, CNPJ ou período.',
    benefit: 'XMLs originais organizados em ZIP com relatório Excel opcional.',
    route: '/organizar-xml',
    icon: 'product',
    badge: 'Novo',
    category: 'XML Fiscal',
    keywords: [
      'xml',
      'organizar',
      'fornecedor',
      'cnpj',
      'cpf',
      'mes',
      'ano',
      'nfe',
      'nfce',
      'nota fiscal',
      'zip',
      'duplicados',
    ],
    meta: 'NF-e + NFC-e · ZIP',
    cta: 'Organizar XMLs',
  },
  {
    title: 'Analisador de XMLs',
    description: 'Analise valores, emitentes, produtos e tributos das notas fiscais.',
    benefit: 'Dashboard de NF-e com filtros, indicadores e relatório Excel.',
    route: '/analisar-xml',
    icon: 'product',
    badge: 'Novo',
    category: 'XML Fiscal',
    keywords: [
      'xml',
      'analisar',
      'analise',
      'dashboard',
      'nfe',
      'nota fiscal',
      'emitente',
      'tributos',
      'icms',
      'relatorio',
    ],
    meta: 'Dashboard + Excel',
    cta: 'Analisar XMLs',
  },
];

export function normalizeToolSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
