export const processingTools = {
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
