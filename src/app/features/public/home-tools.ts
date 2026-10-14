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
];

export function normalizeToolSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
