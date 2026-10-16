export const processingTools = {
  docx_to_pdf: {
    id: 'docx_to_pdf',
    path: '/docx-para-pdf',
    name: 'DOCX para PDF',
    subtitle:
      'Transforme documentos do Word em PDF direto no navegador. Envie seus arquivos DOCX e baixe os PDFs prontos em poucos passos.',
  },
  'xml-analyzer': {
    id: 'xml-analyzer',
    path: '/analisar-xml',
    name: 'Analisador de XMLs',
    subtitle:
      'Transforme seus XMLs de NF-e em informações sobre documentos, emitentes, produtos, valores e tributos. Analise seu lote e exporte para Excel.',
  },
  'xml-organizer': {
    id: 'xml-organizer',
    path: '/organizar-xml',
    name: 'Organizador de XMLs',
    subtitle:
      'Organize seus arquivos XML de notas fiscais automaticamente por fornecedor, CNPJ ou período. Envie seus documentos e baixe tudo em um único ZIP.',
  },
  'xml-to-pdf': {
    id: 'xml-to-pdf',
    path: '/xml-para-pdf',
    name: 'XML para PDF',
    subtitle: 'Transforme suas notas fiscais XML em DANFE PDF de forma rápida e simples.',
  },
  'xml-to-excel': {
    id: 'xml-to-excel',
    path: '/xml-para-excel',
    name: 'XML para Excel',
    subtitle: 'Suas NF-es organizadas em Excel. Confira notas e produtos antes de baixar.',
  },
  'products-from-xml': {
    id: 'products-from-xml',
    path: '/produtos-dos-xmls',
    name: 'Produtos dos XMLs',
    subtitle: 'Extraia e consolide os produtos das suas NF-es em poucos segundos.',
  },
} as const;
export type ToolPath = (typeof processingTools)[keyof typeof processingTools]['path'];
