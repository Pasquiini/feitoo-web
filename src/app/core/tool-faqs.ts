export interface ToolFaq {
  readonly question: string;
  readonly answer: string;
}

const common: readonly ToolFaq[] = [
  {
    question: 'Posso enviar vários XMLs de uma vez?',
    answer:
      'Sim. Selecione um lote de XMLs e confira os limites por processamento e por dia exibidos na ferramenta. Os limites variam conforme o plano.',
  },

  {
    question: 'Funciona com NF-e modelo 55?',
    answer:
      'Sim. A ferramenta lê XMLs de NF-e modelo 55. PDF, DANFE e outros documentos fiscais não são convertidos.',
  },

  {
    question: 'Preciso instalar algum programa?',
    answer:
      'Não. O envio e o download são feitos pelo navegador. Você pode selecionar os arquivos antes de entrar, mas precisa de uma conta para processar e baixar o resultado.',
  },

  {
    question: 'Os arquivos ficam armazenados?',
    answer:
      'Os XMLs e o resultado ficam temporariamente em armazenamento privado. O prazo aparece na área de envio e no resultado. Ao vencer, o acesso é bloqueado e a rotina de limpeza exclui os arquivos. Você também pode excluí-los ao terminar.',
  },

  {
    question: 'E se um XML tiver erro?',
    answer:
      'Os documentos válidos entram no Excel. Você pode consultar quais arquivos não puderam ser processados, sem perder os demais.',
  },
];

export const toolFaqs: Record<'/xml-para-excel' | '/produtos-dos-xmls', readonly ToolFaq[]> = {
  '/xml-para-excel': [
    ...common,
    {
      question: 'A planilha contém notas e itens?',
      answer:
        'Sim. O Excel tem uma aba Notas com o resumo de cada NF-e válida e uma aba Itens com os produtos de cada nota. Chaves e documentos são preservados como texto.',
    },
  ],

  '/produtos-dos-xmls': [
    ...common,
    {
      question: 'Produtos de fornecedores diferentes são agrupados?',
      answer:
        'Não. A consolidação considera o emitente, o código do produto, o NCM e a unidade. Sem código, usa a descrição. Produtos com unidades ou emitentes diferentes ficam separados.',
    },
    {
      question: 'O PDF contém todos os produtos?',
      answer:
        'Não. O PDF é um resumo visual com uma amostra dos produtos consolidados. Baixe o Excel para consultar todos os produtos e os itens detalhados.',
    },
  ],
};
