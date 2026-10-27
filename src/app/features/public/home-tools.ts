export interface ToolCard {
  title: string;
  description: string;
  benefit: string;
  route: string;
  icon: 'excel' | 'product' | 'pdf';
  badge: string;
  category: string;
  keywords: readonly string[];
  aliases: readonly string[];
  inputLabel: string;
  outputLabel: string;
  tags: readonly string[];
  meta: string;
  cta: string;
}

export const HOME_TOOLS: readonly ToolCard[] = [
  {
    title: 'XML para Excel',
    description: 'Transforme várias NF-e em uma planilha organizada.',
    benefit: 'Notas, emitentes, valores e itens em um único arquivo.',
    route: '/xml-para-excel',
    aliases: [],
    inputLabel: 'XML',
    outputLabel: 'XLSX',
    tags: ['NF-e', 'Excel', 'Lote'],
    icon: 'excel',
    badge: 'Mais usado',
    category: 'XML e Fiscal',
    keywords: ['xml', 'excel', 'planilha', 'nota fiscal', 'nfe', 'nf-e', 'converter', 'conversão'],
    meta: 'Até 3 XMLs grátis por lote',
    cta: 'Abrir ferramenta',
  },
  {
    title: 'Produtos dos XMLs',
    description: 'Extraia e consolide os produtos das suas notas fiscais.',
    benefit: 'Quantidades, valores, NCM, fornecedores e muito mais.',
    route: '/produtos-dos-xmls',
    aliases: [],
    inputLabel: 'XML',
    outputLabel: 'XLSX',
    tags: ['Produtos', 'Excel', 'Lote'],
    icon: 'product',
    badge: 'Novo',
    category: 'XML e Fiscal',
    keywords: ['xml', 'excel', 'produto', 'nota fiscal', 'nfe', 'nf-e', 'ncm', 'resumo', 'extrair'],
    meta: 'Excel + resumo',
    cta: 'Usar agora',
  },
  {
    title: 'XML para PDF',
    description: 'Transforme XMLs de NF-e em DANFE PDF.',
    benefit: 'Visualize cada documento e baixe PDFs individuais ou em ZIP.',
    route: '/xml-para-pdf',
    aliases: [],
    inputLabel: 'XML',
    outputLabel: 'PDF',
    tags: ['NF-e', 'DANFE', 'Lote'],
    icon: 'product',
    badge: 'Novo',
    category: 'XML e Fiscal',
    keywords: ['xml', 'pdf', 'danfe', 'nota fiscal', 'nfe', 'nf-e', 'converter'],
    meta: 'DANFE PDF + ZIP',
    cta: 'Gerar DANFE',
  },
  {
    title: 'Organizar XML',
    description: 'Separe notas fiscais por fornecedor, CNPJ ou período.',
    benefit: 'XMLs originais organizados em ZIP com relatório Excel opcional.',
    route: '/organizar-xml',
    aliases: [],
    inputLabel: 'XML',
    outputLabel: 'ZIP',
    tags: ['NF-e', 'Organização', 'Lote'],
    icon: 'product',
    badge: 'Novo',
    category: 'XML e Fiscal',
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
    title: 'Analisar XML',
    description: 'Analise valores, emitentes, produtos e tributos das notas fiscais.',
    benefit: 'Dashboard de NF-e com filtros, indicadores e relatório Excel.',
    route: '/analisar-xml',
    aliases: [],
    inputLabel: 'XML',
    outputLabel: 'Dados',
    tags: ['NF-e', 'Análise', 'Excel'],
    icon: 'product',
    badge: 'Novo',
    category: 'XML e Fiscal',
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
  {
    title: 'DOCX para PDF',
    description: 'Converta documentos do Word em PDF online.',
    benefit: 'PDFs individuais e ZIP, com resultado por documento.',
    route: '/docx-para-pdf',
    aliases: ['word para pdf', 'transformar word em pdf'],
    inputLabel: 'DOCX',
    outputLabel: 'PDF',
    tags: ['Word', 'PDF', 'Lote'],
    icon: 'product',
    badge: 'Novo',
    category: 'Documentos',
    keywords: ['docx', 'word', 'pdf', 'documento', 'converter'],
    meta: 'DOCX → PDF',
    cta: 'Converter DOCX',
  },
  {
    title: 'Gerador de Orçamentos',
    description: 'Crie orçamentos profissionais para seus clientes e baixe em PDF.',
    benefit: 'Dois modelos, logotipo, itens e descontos calculados na hora.',
    route: '/gerador-de-orcamentos',
    aliases: ['proposta comercial', 'orçamento de serviços'],
    inputLabel: 'Orçamento',
    outputLabel: 'PDF',
    tags: ['Serviços', 'Produtos', 'PDF'],
    icon: 'pdf',
    badge: 'Grátis para começar',
    category: 'Negócios',
    keywords: ['orçamento', 'orcamento', 'proposta', 'cliente', 'serviço', 'produto', 'pdf'],
    meta: '1 geração grátis por dia · com conta',
    cta: 'Criar orçamento',
  },
];

export function normalizeToolSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const TOOL_CATEGORIES = [...new Set(HOME_TOOLS.map((tool) => tool.category))];

export function searchTools(query: string, tools: readonly ToolCard[] = HOME_TOOLS) {
  const terms = normalizeToolSearch(query).split(/\s+/).filter(Boolean);
  return tools.filter((tool) => {
    const text = normalizeToolSearch(
      [
        tool.title,
        tool.description,
        tool.benefit,
        tool.category,
        ...tool.keywords,
        ...tool.aliases,
      ].join(' '),
    );
    return terms.every((term) => text.includes(term));
  });
}
