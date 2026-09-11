import { LEGAL_VERSIONS } from '@dontpanic/shared';
import type { LegalDocument } from './legal-document';
import { OPERATOR } from './company';

/**
 * Terms of use — a TEMPLATE, not a finished contract.
 *
 * ⚠ Everything marked `⚠ PREENCHER` has to be written for YOUR product before
 * this page is published, and the whole text has to be reviewed by a lawyer.
 * What is here is the skeleton a Brazilian SaaS contract needs, with the
 * product-specific parts deliberately left blank rather than filled with
 * plausible-looking wording that would be wrong for your business.
 *
 * Three things explain why this skeleton is not an English "terms of service"
 * run through a translator, and all three come from art. 51 of the Brazilian
 * Consumer Code, which lists clauses that are NULL AND VOID:
 *
 * - **item VII**: a clause imposing "compulsory arbitration" is void. The whole
 *   US model rests on mandatory arbitration with a class-action waiver; here it
 *   does not hold, and insisting on it only makes a judge look at the rest of
 *   the contract with suspicion.
 * - **item XIII**: a clause letting the supplier "unilaterally modify the
 *   content or quality of the contract" is void. Hence the amendment section
 *   gives prior notice and the right to leave at no cost, instead of the usual
 *   "we may change these terms at any time".
 * - **item I**: a clause exonerating or reducing the supplier's liability is
 *   void — BUT with the caveat that founds section 10: "in consumer relations
 *   between the supplier and a corporate consumer, compensation may be limited
 *   in justifiable situations".
 *
 * The limitation of liability here is therefore deliberately moderate and
 * justified. An overly aggressive cap is not more protection: it is a clause a
 * court strikes down whole, leaving liability unlimited — the opposite of what
 * was wanted.
 *
 * `version` comes from `LEGAL_VERSIONS` in `@dontpanic/shared`, the single
 * source shared with the acceptance record. Bump it there, never here.
 */
export const TERMS: LegalDocument = {
  title: 'Termos de Uso',
  version: LEGAL_VERSIONS.terms,
  // ⚠ PREENCHER: a data em que esta versão passa a valer.
  effectiveDate: '2026-01-01',
  summary: [
    // ⚠ PREENCHER: uma frase dizendo o que o seu produto faz e para quem.
    `⚠ PREENCHER: ${OPERATOR.product} é ⟨descreva o serviço em uma frase⟩, contratado por empresas. Você continua dono de todos os dados que colocar aqui.`,
    '⚠ PREENCHER: resuma os limites de cada plano (usuários, armazenamento, recursos próprios do produto).',
    'A responsabilidade da nossa parte é limitada, mas não em caso de dolo, culpa grave ou violação de dados — e essa limitação está destacada na seção 10.',
    'Podemos mudar estes termos, mas com 30 dias de aviso e com o seu direito de sair sem multa se não concordar.',
    'Você pode cancelar quando quiser e levar seus dados; nós só encerramos a conta por descumprimento, com aviso e prazo para corrigir.',
  ],
  sections: [
    {
      id: 'objeto',
      title: 'Quem somos e o que este contrato regula',
      clauses: [
        {
          number: '1.1',
          text: `${OPERATOR.product} é um software como serviço (SaaS) oferecido por ${OPERATOR.legalName}, inscrita no CNPJ sob o nº ${OPERATOR.taxId}, com sede em ${OPERATOR.address} ("nós", "Contratada"). ⚠ PREENCHER: descreva aqui o que a plataforma faz.`,
        },
        {
          number: '1.2',
          text: 'Estes Termos regulam o uso da plataforma pela empresa que cria uma conta ("você", "Contratante") e por todas as pessoas que você autorizar a acessá-la. Ao marcar a caixa de aceite no cadastro, você declara ter lido este documento e a Política de Privacidade, e concorda com ambos.',
        },
        {
          number: '1.3',
          text: 'Quem aceita declara ter poderes para obrigar a empresa que representa. Se você está criando a conta em nome de terceiro sem essa autorização, responde pessoalmente pelas obrigações assumidas aqui.',
        },
        {
          number: '1.4',
          text: 'Este é um contrato de adesão: as cláusulas foram redigidas por nós e você não as negocia individualmente. Por isso as cláusulas que limitam direitos estão destacadas ao longo do documento, como determina o art. 54, §4º do Código de Defesa do Consumidor.',
        },
      ],
    },
    {
      id: 'definicoes',
      title: 'Definições',
      clauses: [
        {
          number: '2.1',
          text: 'Para este contrato, entende-se por:',
          items: [
            `"Plataforma": o sistema ${OPERATOR.product}, incluindo aplicação web, API, banco de dados e documentação.`,
            '"Conta": o espaço isolado da sua empresa dentro da Plataforma, com seus usuários e seus dados.',
            '"Usuário": pessoa a quem você concede acesso à sua Conta.',
            '"Seus Dados": tudo o que você ou seus Usuários inserem, enviam ou geram na Plataforma. ⚠ PREENCHER: liste os tipos de registro do seu produto.',
            '"Plano": o conjunto de limites e funcionalidades que você contrata. ⚠ PREENCHER: nomeie os planos.',
          ],
        },
      ],
    },
    {
      id: 'conta',
      title: 'Conta, cadastro e credenciais',
      clauses: [
        {
          number: '3.1',
          text: 'Para usar a Plataforma é preciso criar uma Conta com informações verdadeiras, completas e atualizadas. Cadastro com dados falsos autoriza a suspensão imediata, nos termos da seção 7.',
        },
        {
          number: '3.2',
          text: 'A Conta é da sua empresa, não da pessoa que a criou. Você é responsável por manter atualizada a lista de quem tem acesso e por revogar o acesso de quem deixa de precisar dele.',
        },
        {
          number: '3.3',
          text: 'Cada Usuário deve ter credenciais próprias. Compartilhar login e senha entre pessoas é descumprimento contratual: além de contornar os limites do Plano, torna impossível saber quem fez o quê — e os registros de auditoria da Plataforma perdem valor justamente quando são mais necessários.',
        },
        {
          number: '3.4',
          text: 'Você é responsável pela guarda das credenciais e por tudo o que for feito com elas. Recomendamos fortemente ativar a verificação em duas etapas, que a Plataforma oferece sem custo adicional.',
        },
        {
          number: '3.5',
          text: `Se suspeitar de acesso não autorizado, avise-nos imediatamente em ${OPERATOR.supportEmail}. Até a comunicação, os acessos feitos com suas credenciais presumem-se seus.`,
        },
      ],
    },
    {
      id: 'planos',
      title: 'Planos, limites, teste e pagamento',
      clauses: [
        {
          number: '4.1',
          text: 'A Plataforma é oferecida em planos com limites diferentes. Os limites vigentes de cada plano estão publicados na página de preços e são aplicados pelo sistema. ⚠ PREENCHER: descreva quais limites existem (usuários, armazenamento, contadores próprios do produto).',
        },
        {
          number: '4.2',
          text: 'Novas contas começam em período de avaliação gratuito, com a duração informada no momento do cadastro. Terminado o período sem contratação, a Conta é suspensa: seus dados continuam guardados e voltam a ficar acessíveis quando você contratar um plano, observado o prazo da cláusula 8.4.',
        },
        {
          number: '4.3',
          text: '⚠ PREENCHER: se algum plano limitar sessões simultâneas, diga-o aqui, explicando que entrar em um novo dispositivo encerra a sessão anterior e que isso é a forma de fazer valer o limite de usuários contratado — não uma falha do sistema.',
        },
        {
          number: '4.4',
          text: '⚠ PREENCHER: forma de cobrança, periodicidade, meios de pagamento, reajuste (índice e periodicidade mínima de 12 meses) e consequências do atraso, com aviso prévio antes de qualquer suspensão por inadimplência.',
        },
      ],
    },
    {
      id: 'uso',
      title: 'Como a Plataforma pode e não pode ser usada',
      clauses: [
        {
          number: '5.1',
          text: 'Você se compromete a usar a Plataforma conforme a lei e este contrato, e a responder pelo que seus Usuários fizerem nela.',
        },
        {
          number: '5.2',
          text: 'É vedado, entre outras condutas ilícitas:',
          items: [
            'tentar obter acesso a dados de outra empresa, contornar os controles de isolamento ou testar vulnerabilidades sem autorização escrita nossa;',
            'usar a Plataforma para armazenar ou distribuir conteúdo ilícito, ou para enviar comunicação não solicitada em massa;',
            'revender, sublicenciar ou oferecer a Plataforma a terceiros como se fosse serviço próprio, salvo acordo escrito;',
            'executar carga automatizada que comprometa a estabilidade do serviço para os demais clientes.',
          ],
        },
        {
          number: '5.3',
          text:
            'Pesquisadores de segurança são bem-vindos: reporte a falha em ' +
            OPERATOR.supportEmail +
            ' antes de divulgá-la e não acesse dados de terceiros durante o teste.',
        },
      ],
    },
    {
      id: 'dados',
      title: 'Seus dados são seus',
      clauses: [
        {
          number: '6.1',
          text: 'Seus Dados continuam seus. Nós os tratamos como operadores, para executar este contrato — a Política de Privacidade detalha como.',
        },
        {
          number: '6.2',
          text: 'Você pode exportar Seus Dados a qualquer momento, em formato legível por máquina, enquanto a Conta estiver ativa.',
        },
        {
          number: '6.3',
          text: 'Não vendemos Seus Dados, não os usamos para publicidade e não os fornecemos a terceiros salvo por ordem judicial ou obrigação legal, caso em que avisaremos você sempre que a lei permitir.',
        },
      ],
    },
    {
      id: 'suspensao',
      title: 'Suspensão e encerramento',
      clauses: [
        {
          number: '7.1',
          text: 'Você pode cancelar a qualquer momento, sem multa, pela própria Plataforma ou por escrito. O cancelamento vale ao fim do ciclo já pago.',
        },
        {
          number: '7.2',
          text: 'Podemos suspender a Conta por descumprimento contratual, sempre com aviso prévio e prazo razoável para correção — exceto em caso de risco iminente à segurança da Plataforma ou de terceiros, ou de determinação legal, quando a suspensão pode ser imediata e o aviso vem logo em seguida, com o motivo.',
        },
        {
          number: '7.3',
          text: 'A suspensão bloqueia o acesso, mas não apaga Seus Dados. O prazo de retenção após o encerramento está na cláusula 8.4.',
        },
      ],
    },
    {
      id: 'disponibilidade',
      title: 'Disponibilidade, manutenção e retenção',
      clauses: [
        {
          number: '8.1',
          text: '⚠ PREENCHER: meta de disponibilidade (ex.: 99,5% mensal), como é medida e o que fica de fora do cálculo (manutenção programada, falha de terceiros, caso fortuito).',
        },
        {
          number: '8.2',
          text: 'Manutenções programadas são anunciadas com antecedência, preferencialmente fora do horário comercial.',
        },
        {
          number: '8.3',
          text: '⚠ PREENCHER: política de backup — frequência, retenção e objetivo de recuperação.',
        },
        {
          number: '8.4',
          text: '⚠ PREENCHER: por quantos dias após o encerramento Seus Dados ficam disponíveis para exportação e quando são apagados em definitivo.',
        },
      ],
    },
    {
      id: 'propriedade',
      title: 'Propriedade intelectual',
      clauses: [
        {
          number: '9.1',
          text: `O software, a marca, a documentação e o material de apoio são de ${OPERATOR.legalName}. Este contrato concede a você uma licença de uso, não transfere titularidade.`,
        },
        {
          number: '9.2',
          text: 'Sugestões e pedidos de melhoria que você nos enviar podem ser implementados sem que isso gere direito de propriedade ou contrapartida — o que for implementado passa a fazer parte da Plataforma para todos os clientes.',
        },
      ],
    },
    {
      id: 'responsabilidade',
      title: 'Limitação de responsabilidade',
      highlight: true,
      intro:
        'Esta seção limita direitos e por isso está destacada, como determina o art. 54, §4º do Código de Defesa do Consumidor. Leia com atenção.',
      clauses: [
        {
          number: '10.1',
          text: '⚠ PREENCHER (com revisão jurídica): o limite de indenização — por exemplo, o total efetivamente pago por você nos 12 meses anteriores ao fato. Um limite desproporcional é derrubado inteiro pelo tribunal, deixando a responsabilidade ilimitada.',
        },
        {
          number: '10.2',
          text: 'O limite da cláusula 10.1 NÃO se aplica a dolo, culpa grave, violação de dados pessoais causada por nós, nem a danos à integridade física ou moral — hipóteses em que respondemos nos termos da lei.',
        },
        {
          number: '10.3',
          text: 'Não respondemos por indisponibilidade causada por fatores fora do nosso controle razoável (falha de conectividade do seu lado, caso fortuito, força maior), nem por decisões de negócio que você tome com base nas informações da Plataforma.',
        },
        {
          number: '10.4',
          text: 'Você é responsável por manter cópia dos dados que considerar críticos. Nosso backup é uma camada de proteção, não um substituto para a sua própria guarda.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: 'Alterações destes Termos',
      clauses: [
        {
          number: '11.1',
          text: 'Podemos alterar estes Termos, com aviso por e-mail e na própria Plataforma com no mínimo 30 dias de antecedência. O art. 51, XIII do Código de Defesa do Consumidor torna nula a alteração unilateral sem isso.',
        },
        {
          number: '11.2',
          text: 'Se você não concordar com a nova versão, pode encerrar o contrato antes de ela entrar em vigor, sem multa e com direito à devolução proporcional do que já tiver pago.',
        },
        {
          number: '11.3',
          text: 'A versão de cada documento e a data do seu aceite ficam registradas: é essa a prova de qual texto você leu.',
        },
      ],
    },
    {
      id: 'foro',
      title: 'Lei aplicável e foro',
      clauses: [
        {
          number: '12.1',
          text: 'Este contrato é regido pela lei brasileira.',
        },
        {
          number: '12.2',
          text: '⚠ PREENCHER: o foro eleito. Note que não há cláusula de arbitragem obrigatória: o art. 51, VII do Código de Defesa do Consumidor a torna nula em contrato de adesão.',
        },
        {
          number: '12.3',
          text: `Dúvidas sobre este contrato: ${OPERATOR.supportEmail}.`,
        },
      ],
    },
  ],
};
