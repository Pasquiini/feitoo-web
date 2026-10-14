export const guidePages = {
  '/como-converter-xml-nfe-para-excel': {
    title: 'Como Converter XML NF-e para Excel Online | Feitoo',
    description:
      'Veja como converter arquivos XML de NF-e para Excel e transformar notas fiscais em uma planilha organizada de forma rápida e online.',
    headline: 'Como converter XML NF-e para Excel',
    toolPath: '/xml-para-excel',
    toolName: 'XML para Excel',
    action: 'Converter XML para Excel',
  },
  '/como-extrair-produtos-de-xml-nfe': {
    title: 'Como Extrair Produtos de XML NF-e para Excel | Feitoo',
    description:
      'Aprenda a extrair produtos de vários XMLs de NF-e, consolidar itens, somar quantidades e gerar uma planilha organizada.',
    headline: 'Como extrair produtos de XMLs NF-e',
    toolPath: '/produtos-dos-xmls',
    toolName: 'Produtos dos XMLs',
    action: 'Extrair produtos de XMLs',
  },
} as const;
export type GuidePath = keyof typeof guidePages;
