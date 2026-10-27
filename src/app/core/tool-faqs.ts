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

export const toolFaqs: Record<
  | '/gerador-de-orcamentos'
  | '/docx-para-pdf'
  | '/xml-para-excel'
  | '/produtos-dos-xmls'
  | '/xml-para-pdf'
  | '/organizar-xml'
  | '/analisar-xml',
  readonly ToolFaq[]
> = {
  '/gerador-de-orcamentos': [
    {
      question: 'O gerador de orçamentos é grátis?',
      answer:
        'Sim. Com uma conta gratuita, você pode concluir um orçamento por dia, com renovação à meia-noite no horário de São Paulo. Os modelos Clássico e Moderno estão incluídos.',
    },
    {
      question: 'Preciso de cadastro para gerar e baixar o PDF?',
      answer:
        'Sim. Você pode preencher o orçamento antes de entrar. Para gerar e baixar o PDF, entre ou crie uma conta. O rascunho é recuperado neste navegador quando o armazenamento local está disponível.',
    },
    {
      question: 'Posso colocar meu logotipo e aplicar descontos?',
      answer:
        'Sim. Adicione um logotipo PNG ou JPEG de até 2 MB e 4 milhões de pixels. Os itens aceitam quantidades fracionadas e o desconto pode ser em reais ou percentual. Confira o resumo antes de confirmar a geração.',
    },
    {
      question: 'Por quanto tempo meus documentos ficam disponíveis?',
      answer:
        'O PDF fica disponível por duas horas após a conclusão. O rascunho expira 24 horas após a última edição. O acesso é privado, e os arquivos expirados são removidos pela rotina de limpeza. Baixe o PDF para guardar sua cópia.',
    },
    {
      question: 'Como funcionam o Pro e os créditos de orçamentos?',
      answer:
        'O Feitoo Pro inclui 100 gerações por período da assinatura, com saldo e fim do período exibidos na conta. Essa franquia tem prioridade. Créditos avulsos são exclusivos para orçamentos e só são usados por escolha explícita. A compra de cinco créditos por R$ 9,90 depende da disponibilidade do checkout.',
    },
    {
      question: 'Uma falha na geração consome minha franquia?',
      answer:
        'A geração reserva uma unidade, e o consumo só é confirmado quando o PDF é concluído. Em uma falha definitiva ou expiração do processamento, a reserva é liberada. Tentativas de recuperação mantêm a mesma emissão e não geram consumo duplicado.',
    },
  ],
  '/docx-para-pdf': [
    {
      question: 'Como converter DOCX para PDF?',
      answer:
        'Selecione os documentos DOCX, entre na sua conta e envie para conversão. Aguarde o processamento e baixe os PDFs prontos.',
    },
    {
      question: 'Preciso instalar o Microsoft Word?',
      answer:
        'Não. Você envia os documentos e baixa os PDFs pelo navegador, sem instalar o Word. É necessário entrar na sua conta para processar.',
    },
    {
      question: 'O Feitoo aceita arquivos .doc?',
      answer:
        'Não. A ferramenta aceita somente arquivos DOCX válidos. DOC e DOCX são formatos diferentes; mudar a extensão não converte o documento.',
    },
    {
      question: 'Posso converter vários arquivos?',
      answer:
        'Sim. No Free, são até 3 documentos por processamento e 6 por dia. No Pro, até 20 por processamento e 100 por dia. Cada DOCX pode ter até 10 MB e o lote até 40 MB. Uma falha individual não impede o download dos outros PDFs.',
    },
    {
      question: 'O layout fica exatamente igual?',
      answer:
        'A conversão busca preservar textos, estilos comuns, tabelas, imagens, cabeçalhos, rodapés e quebras de página. Fontes não instaladas e recursos específicos do Word podem alterar a renderização. Confira o PDF antes de compartilhar.',
    },
    {
      question: 'Meus documentos ficam armazenados?',
      answer:
        'Documentos e PDFs ficam temporariamente em armazenamento privado, com acesso protegido pela sua conta. O prazo de retenção aparece na ferramenta e a expiração no resultado. Ao vencer, o acesso é bloqueado e a rotina de limpeza exclui os arquivos. Você também pode excluí-los ao terminar.',
    },
    {
      question: 'Posso baixar todos os PDFs juntos?',
      answer:
        'Sim. Quando o lote tem mais de um documento convertido com sucesso, você pode baixar todos os PDFs em um ZIP. Os PDFs também ficam disponíveis para download individual.',
    },
  ],
  '/analisar-xml': [
    {
      question: 'Como analisar vários XMLs de notas fiscais?',
      answer:
        'Selecione XMLs individuais de NF-e modelo 55, entre na sua conta e clique em Analisar XMLs. O backend processa o lote e apresenta indicadores, gráficos e tabelas. PDF, ZIP e NFC-e 65 não fazem parte desta versão.',
    },
    {
      question: 'Quais informações posso extrair dos XMLs?',
      answer:
        'Documentos, emitentes, destinatários, produtos, quantidades por unidade, valores e tributos destacados. Os dados são extraídos dos XMLs enviados; campos ausentes e falhas são informados, sem inventar valores.',
    },
    {
      question: 'Posso identificar os produtos mais comprados?',
      answer:
        'A tabela mostra os produtos e seus valores e quantidades nos documentos considerados. Isso não confirma compras: emitente não equivale necessariamente a fornecedor. Produtos de emitentes, NCM ou unidades diferentes ficam separados; descrições parecidas não são equiparadas.',
    },
    {
      question: 'Como visualizar valores por fornecedor?',
      answer:
        'Consulte a tabela de emitentes, ordene por valor ou quantidade de notas e use o filtro de emitente. O agrupamento utiliza CNPJ/CPF com formato e dígitos verificadores confiáveis; identificações não confiáveis são isoladas por nota.',
    },
    {
      question: 'O Feitoo consulta a SEFAZ?',
      answer:
        'Não. O status atual na SEFAZ não foi consultado e a assinatura digital não é verificada. O status da análise não representa autorização fiscal. Tributos destacados não significam recolhimento, crédito ou imposto devido.',
    },
    {
      question: 'Posso exportar os resultados para Excel?',
      answer:
        'Sim. O Excel tem Resumo, Documentos, Emitentes, Produtos, Tributos e Inconsistências. Exportar visão em Excel aplica os filtros atuais a todas as páginas; a pesquisa de produtos afeta somente os produtos. O download completo do lote fica disponível separadamente.',
    },
    {
      question: 'Como duplicados e conflitos afetam os resultados e o limite?',
      answer:
        'Cópias com SHA-256 idêntico entram uma vez nos indicadores. Mesma chave com conteúdo diferente exclui todos os participantes da agregação, preservando seus registros. Cada XML lido com sucesso consome uma unidade Free/Pro, inclusive cópias e conflitos identificados; falhas não consomem e retentativas não cobram novamente.',
    },
    common[3],
  ],
  '/organizar-xml': [
    {
      question: 'Como organizar vários arquivos XML?',
      answer:
        'Selecione seus XMLs de NF-e 55 ou NFC-e 65, escolha o critério, entre na conta e clique em Organizar XMLs. O resultado é um ZIP com as pastas e o relatório Excel opcional.',
    },
    {
      question: 'Como separar XML por fornecedor?',
      answer:
        'Escolha Por fornecedor. O Feitoo usa o emitente do XML e acrescenta seu CNPJ/CPF à pasta quando disponível para distinguir fornecedores com nomes iguais.',
    },
    {
      question: 'Como organizar notas fiscais por mês?',
      answer:
        'Escolha Por ano e mês ou Por ano/mês e fornecedor. A data de emissão do XML define as pastas, preservando o mês no fuso original. Sem data confiável, o arquivo é identificado na pasta Sem_Data ou na pasta de problemas.',
    },
    {
      question: 'O Feitoo altera meus XMLs?',
      answer:
        'Não. Os bytes dos XMLs permanecem intactos. Somente os nomes e caminhos no ZIP podem mudar. Colisões recebem um sufixo para evitar sobrescritas.',
    },
    {
      question: 'Posso organizar XMLs gratuitamente?',
      answer:
        'Sim, dentro dos limites Free exibidos na página. O plano Pro amplia os limites existentes. Cada arquivo fiscal organizado com sucesso consome uma unidade, inclusive cópias mantidas; arquivos com falha não consomem o limite.',
    },
    {
      question: 'Como identificar XMLs duplicados?',
      answer:
        'Ative a identificação de duplicados. Hashes iguais indicam conteúdo idêntico; chaves iguais com bytes diferentes geram um conflito. Você pode manter ou separar esses arquivos. Nenhum arquivo é descartado.',
    },
    {
      question: 'A situação fiscal dos documentos é verificada?',
      answer:
        'Não. Os dados são extraídos do XML; o status atual na SEFAZ não foi consultado, a assinatura não foi verificada e a organização não confirma autorização fiscal.',
    },
    common[3],
  ],
  '/xml-para-pdf': [
    {
      question: 'Como converter XML em DANFE PDF?',
      answer:
        'Selecione XMLs de NF-e modelo 55, entre na sua conta e clique em Gerar DANFE. Visualize cada PDF e baixe os documentos individualmente ou em ZIP.',
    },
    {
      question: 'Posso enviar XML sem protocolo?',
      answer:
        'Nesta versão, é necessário o XML processado completo, com protocolo de autorização consistente. Documentos sem protocolo, rejeitados e modelos diferentes de 55 não geram PDF.',
    },
    {
      question: 'A ferramenta consulta a situação atual na SEFAZ?',
      answer:
        'Não. O status atual na SEFAZ não foi consultado. O protocolo é conferido contra os dados do XML, sem verificar a assinatura digital ou eventos posteriores, como cancelamento. XML de homologação gera DANFE sem valor fiscal.',
    },
    {
      question: 'Arquivos inválidos ou repetidos consomem o limite?',
      answer:
        'Somente PDFs concluídos com sucesso consomem o limite Free ou Pro. NF-es repetidas no mesmo lote são identificadas e não consomem o limite novamente. Durante o processamento, o volume fica reservado.',
    },
    common[0],
    common[2],
    common[3],
  ],
  '/xml-para-excel': [
    ...common.map((faq, index) =>
      index === 0
        ? {
            ...faq,
            answer:
              'Sim. No XML para Excel e Produtos dos XMLs, o Free permite 3 XMLs por processamento e 6 por dia em cada ferramenta. Para lotes maiores, a compra avulsa custa R$ 4,90 para até 100 XMLs ou R$ 6,90 para até 250, sem assinatura. O Pro custa R$ 29,90/mês, com 250 XMLs por processamento e 500 por dia.',
          }
        : faq,
    ),
    {
      question: 'A planilha contém notas e itens?',
      answer:
        'Sim. O Excel tem uma aba Notas com o resumo de cada NF-e válida e uma aba Itens com os produtos de cada nota. Chaves e documentos são preservados como texto.',
    },
  ],

  '/produtos-dos-xmls': [
    ...common.map((faq, index) =>
      index === 0
        ? {
            ...faq,
            answer:
              'Sim. No XML para Excel e Produtos dos XMLs, o Free permite 3 XMLs por processamento e 6 por dia em cada ferramenta. Para lotes maiores, a compra avulsa custa R$ 4,90 para até 100 XMLs ou R$ 6,90 para até 250, sem assinatura. O Pro custa R$ 29,90/mês, com 250 XMLs por processamento e 500 por dia.',
          }
        : faq,
    ),
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
