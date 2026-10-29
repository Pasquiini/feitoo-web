import { RetentionService } from '../../core/retention.service';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LAUNCH_CONFIG } from '../../core/launch-config';
@Component({
  selector: 'app-information',
  imports: [RouterLink],
  template: ` <article class="reading-page">
    @if (retention.unavailable()) {
      <p role="status">
        Não foi possível confirmar a configuração atual. Confira o prazo exibido na ferramenta antes
        de enviar arquivos.
      </p>
    }
    @if (page === 'seguranca') {
      <p class="eyebrow">Arquivos com cuidado</p>
      <h1>Segurança sem promessas vazias</h1>
      <p class="lead">Você envia seus arquivos para uma tarefa. Eles continuam privados.</p>
      <h2>Acesso privado</h2>
      <p>
        Uploads e resultados ficam em armazenamento privado, sem links públicos permanentes.
        Processar, baixar ou excluir exige autenticação e propriedade do lote. Uma conta não pode
        acessar os arquivos de outra.
      </p>
      <h2>Prazo e exclusão</h2>
      <p>
        O prazo configurado é de até {{ retention.minutes() }} minutos a partir da criação do lote,
        exibido na ferramenta. Ao vencer, o acesso é bloqueado. A remoção física acontece na rotina
        periódica de limpeza; seu funcionamento depende do scheduler em produção. Você também pode
        excluir os XMLs e o Excel depois do processamento.
      </p>
      <h2>Proteção no processamento</h2>
      <p>
        O backend valida tipo, tamanho e quantidade de uploads. A leitura de XML restringe entidades
        externas e estruturas hostis. Textos exportados são escritos como texto, protegendo contra
        fórmulas inseridas nos documentos.
      </p>
      <h2>Transmissão e medição</h2>
      <p>
        A publicação em produção deve utilizar HTTPS. Não afirmamos criptografia ponta a ponta ou
        certificações. Quando você permite analytics, não enviamos arquivos, nomes de arquivos,
        dados fiscais nem dados da conta nos eventos.
      </p>
      <a routerLink="/privacidade">Leia a política de privacidade</a>
    } @else if (page === 'privacidade') {
      <h1>Privacidade e cookies</h1>
      <p class="lead">O que usamos para resolver sua tarefa e o que permanece opcional.</p>
      <h2>Responsável e contato</h2>
      <p>
        {{
          config.responsible ||
            'PENDENTE ANTES DA PUBLICAÇÃO: identificar o responsável pelo tratamento.'
        }}
      </p>
      <p>
        {{
          config.contact ||
            'PENDENTE ANTES DA PUBLICAÇÃO: informar um contato para solicitações de privacidade.'
        }}
      </p>
      <h2>Sua conta</h2>
      <p>
        Usamos nome, e-mail e credenciais de autenticação para criar sua conta e controlar acesso.
        Senhas são armazenadas com hash. Ao utilizar Google, recebemos identificador da conta, nome,
        e-mail e indicação de verificação do e-mail para autenticação. O Google possui sua própria
        política de privacidade.
      </p>
      <h2>Arquivos e finalidade</h2>
      <p>
        XMLs e planilhas são usados para executar o processamento solicitado, com acesso restrito à
        sua conta. Os resumos fiscais são mantidos enquanto o lote existe. O prazo configurado dos
        arquivos é {{ retention.minutes() }} minutos a partir da criação do lote. O acesso vence no
        prazo informado e a limpeza periódica remove arquivos e registros do lote. A conta não é
        excluída automaticamente com o lote.
      </p>
      <h2>Exclusão e seus direitos</h2>
      <p>
        Você pode excluir os arquivos e o resultado na ferramenta. Para solicitar acesso, correção,
        exclusão da conta ou esclarecimentos, utilize o contato do responsável quando preenchido
        acima. O canal e o procedimento precisam estar operacionais antes da publicação. Eventuais
        obrigações de conservação devem ser avaliadas pelo responsável.
      </p>
      <h2>Logs técnicos</h2>
      <p>
        O sistema registra informações operacionais mínimas para diagnosticar falhas e proteger o
        serviço. Os logs de processamento evitam conteúdo fiscal, XML e tokens. Logs de
        infraestrutura podem incluir dados de conexão; sua retenção e acesso devem ser definidos na
        implantação.
      </p>
      <h2>Cookies necessários</h2>
      <p>
        A sessão, a proteção contra CSRF e o login Google usam mecanismos necessários ao
        funcionamento. Sua escolha de cookies opcionais é guardada no navegador por até 180 dias.
        Arquivos selecionados permanecem apenas em memória; não são guardados em localStorage ou
        IndexedDB.
      </p>
      <p>
        No Gerador de Orçamentos, o rascunho e o logotipo são salvos temporariamente no IndexedDB
        deste navegador. Na conta, o conteúdo do rascunho e o snapshot de geração são criptografados
        pela aplicação; logos e PDFs ficam em armazenamento privado. O rascunho expira em 24 horas
        após a última edição e o PDF, duas horas após concluir. Dados de compras e consumo são
        conservados separadamente dos arquivos. Você pode excluir os arquivos sem apagar o consumo.
      </p>
      <h2>Medição opcional</h2>
      <p>
        Se habilitado pelo responsável e aceito por você, o Google Analytics 4 mede uso das
        ferramentas, contagens e faixas de tamanho e duração. Não enviamos nomes, e-mails,
        documentos fiscais, nomes de arquivos ou identificadores dos lotes nos eventos. O GA4 pode
        tratar dados técnicos e cookies conforme suas políticas, inclusive fora do Brasil. Nenhum
        script de analytics é carregado antes da aceitação.
      </p>
      <p>
        Você pode recusar e alterar sua escolha em “Preferências de cookies” no rodapé. A recusa não
        impede o processamento. Antes do lançamento, o responsável deve revisar bases legais,
        operadores, transferências internacionais e prazos de conservação. Este texto inicial exige
        essa revisão.
      </p>
    } @else {
      <h1>Termos de uso</h1>
      <p class="lead">Condições simples para usar as ferramentas do Feitoo.</p>
      <h2>Responsável pelo serviço</h2>
      <p>
        {{
          config.responsible ||
            'PENDENTE ANTES DA PUBLICAÇÃO: identificar o responsável pelo serviço.'
        }}
      </p>
      <p>
        {{ config.contact || 'PENDENTE ANTES DA PUBLICAÇÃO: preencher contato do responsável.' }}
      </p>
      <h2>O que a ferramenta faz</h2>
      <p>
        XML para Excel organiza automaticamente dados disponíveis em XMLs de NF-e modelo 55. O
        resultado não constitui aconselhamento fiscal, contábil ou jurídico, nem valida a situação
        tributária ou a autenticidade da nota perante órgãos oficiais.
      </p>
      <h2>Seus arquivos e sua conta</h2>
      <p>
        Envie apenas arquivos que você tenha autorização para utilizar. Mantenha suas credenciais
        protegidas e respeite os limites técnicos informados. Não utilize o serviço para conteúdo
        malicioso ou acesso a dados de terceiros sem autorização.
      </p>
      <h2>Processamento e resultados</h2>
      <p>
        Arquivos inválidos podem ser recusados. Falhas parciais podem produzir uma planilha com
        apenas os documentos válidos. Confira os resultados antes de utilizá-los em decisões ou
        obrigações. O serviço pode sofrer indisponibilidade e o processamento não tem prazo
        garantido.
      </p>
      <h2>Disponibilidade e retenção</h2>
      <p>
        Arquivos e resultados são temporários, com prazo configurado de
        {{ retention.minutes() }} minutos a partir da criação do lote. Baixe o resultado antes do
        vencimento. O serviço não substitui seu armazenamento ou suas cópias de segurança.
      </p>
      <h2>Orçamentos, benefícios e créditos</h2>
      <p>
        O orçamento é um documento comercial sem valor fiscal. A conta Free permite uma geração
        bem-sucedida por data de reserva em São Paulo; uma geração que atravessa a meia-noite mantém
        a data original. Pro inclui até 100 gerações por período da assinatura, com prioridade sobre
        as demais modalidades. Créditos avulsos são exclusivos para orçamentos: cinco por R$ 9,90,
        sem expiração comercial, usados apenas por escolha explícita. O saldo é liberado após
        pagamento confirmado. Falhas definitivas não consomem e novos downloads não consomem
        novamente.
      </p>
      <p>
        Reembolso parcial ou integral bloqueia os créditos restantes do pacote afetado, preservando
        gerações já concluídas. Disputas bloqueiam o saldo durante a análise; uma disputa ganha
        restaura o saldo não utilizado se não houver reembolso. Para solicitar atendimento ou
        reembolso, use o contato do responsável. As condições comerciais não limitam direitos
        previstos na legislação aplicável.
      </p>
      <h2>Evolução e contato</h2>
      <p>
        As ferramentas e estes termos podem ser atualizados. Mudanças relevantes devem ser
        comunicadas pelo responsável. Estes termos iniciais precisam ser revisados e aprovados antes
        da publicação.
      </p>
      <a routerLink="/privacidade">Privacidade e tratamento de dados</a>
    }
  </article>`,
})
export class InformationPage {
  readonly page = inject(ActivatedRoute).snapshot.data['page'];
  readonly config = inject(LAUNCH_CONFIG);
  readonly retention = inject(RetentionService);
  constructor() {
    this.retention.load();
  }
}
