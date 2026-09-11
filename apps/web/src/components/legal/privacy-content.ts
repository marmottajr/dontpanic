import { LEGAL_VERSIONS } from '@dontpanic/shared';
import type { LegalDocument } from './legal-document';
import { OPERATOR } from './company';

/**
 * Privacy policy — a TEMPLATE, not a finished document.
 *
 * ⚠ Everything marked `⚠ PREENCHER` describes a fact about YOUR deployment that
 * no boilerplate can know: which sub-processors you use, where the servers are,
 * how long you keep each kind of record. Those are the parts the LGPD actually
 * requires to be accurate (art. 9), and inventing them here would produce a
 * document that is wrong in exactly the places that matter.
 *
 * The structure follows LGPD art. 9: what is collected, for what purpose, on
 * what legal basis, with whom it is shared, for how long it is kept, and how the
 * data subject exercises the rights in art. 18.
 *
 * `version` comes from `LEGAL_VERSIONS` in `@dontpanic/shared`, shared with the
 * acceptance record. Bump it there, never here.
 */
export const PRIVACY: LegalDocument = {
  title: 'Política de Privacidade',
  version: LEGAL_VERSIONS.privacy,
  // ⚠ PREENCHER: a data em que esta versão passa a valer.
  effectiveDate: '2026-01-01',
  summary: [
    'Coletamos o mínimo necessário para o serviço funcionar: quem usa a conta, o que faz nela e os dados que você mesmo cadastra.',
    'Os dados que você cadastra são seus. Em relação a eles somos operadores; você é o controlador.',
    'Não vendemos dados pessoais e não os usamos para publicidade.',
    'Você pode pedir acesso, correção, portabilidade ou eliminação a qualquer momento — a seção 7 diz como.',
    '⚠ PREENCHER: diga onde os dados ficam hospedados e quais subcontratados você usa (seção 5).',
  ],
  sections: [
    {
      id: 'quem',
      title: 'Quem trata os seus dados',
      clauses: [
        {
          number: '1.1',
          text: `O responsável por esta Plataforma é ${OPERATOR.legalName}, CNPJ ${OPERATOR.taxId}, com sede em ${OPERATOR.address}.`,
        },
        {
          number: '1.2',
          text: `O encarregado pelo tratamento de dados pessoais (LGPD, art. 41) é ${OPERATOR.dpoName}, que você contacta em ${OPERATOR.dpoEmail}. Assuntos de privacidade em geral: ${OPERATOR.privacyEmail}.`,
        },
        {
          number: '1.3',
          text: 'Esta política aplica-se ao tratamento de dados pessoais realizado na Plataforma e não se confunde com a política de privacidade da empresa cliente perante os próprios clientes dela.',
        },
      ],
    },
    {
      id: 'papeis',
      title: 'Dois papéis diferentes',
      intro:
        'Distinguir os papéis não é formalidade: é o que define quem responde perante o titular e quem responde perante a autoridade.',
      clauses: [
        {
          number: '2.1',
          text: 'Quanto aos dados dos usuários da conta (nome, e-mail, registros de acesso), somos controladores: decidimos por que e como tratá-los.',
        },
        {
          number: '2.2',
          text: 'Quanto aos dados que você cadastra dentro da Plataforma, somos operadores: tratamos por conta e ordem da sua empresa, que é a controladora. Você decide o que cadastrar, por quanto tempo e com que finalidade.',
        },
        {
          number: '2.3',
          text: 'Como operadores, seguimos as suas instruções, não usamos esses dados para finalidade própria e avisamos você sem demora se ocorrer um incidente de segurança que os envolva.',
        },
      ],
    },
    {
      id: 'coleta',
      title: 'O que coletamos',
      clauses: [
        {
          number: '3.1',
          text: 'Dados de cadastro da empresa e dos usuários: razão social, CNPJ, endereço, telefone, nome, e-mail e senha (guardada apenas como hash Argon2, nunca em texto).',
        },
        {
          number: '3.2',
          text: 'Dados de uso e segurança: endereço IP, data e hora de acesso, agente do navegador, sessões ativas, tentativas de login e ações relevantes registradas na auditoria.',
        },
        {
          number: '3.3',
          text: '⚠ PREENCHER: os dados específicos do seu produto que a empresa cliente cadastra, e se algum deles pode ser dado pessoal sensível (art. 5º, II da LGPD) — o que muda a base legal aplicável.',
        },
        {
          number: '3.4',
          text: 'Não usamos cookies de publicidade nem rastreamento de terceiros. Os cookies da Plataforma são estritamente necessários: sessão, proteção contra CSRF e preferência de idioma e tema.',
        },
      ],
    },
    {
      id: 'finalidade',
      title: 'Para que usamos e com que base legal',
      clauses: [
        {
          number: '4.1',
          text: 'Executar o contrato (art. 7º, V da LGPD): criar e manter a conta, autenticar usuários, prestar suporte e cobrar pelo serviço.',
        },
        {
          number: '4.2',
          text: 'Cumprir obrigação legal (art. 7º, II): guardar registros de acesso pelo prazo do art. 15 do Marco Civil da Internet e emitir documentos fiscais.',
        },
        {
          number: '4.3',
          text: 'Legítimo interesse (art. 7º, IX): prevenir fraude e abuso, manter a segurança da Plataforma e medir uso agregado para melhorar o produto — sempre com dados minimizados e sem decisão automatizada que afete você.',
        },
        {
          number: '4.4',
          text: 'Não tratamos dados pessoais para publicidade comportamental, nem os vendemos, em nenhuma hipótese.',
        },
      ],
    },
    {
      id: 'compartilhamento',
      title: 'Com quem compartilhamos',
      clauses: [
        {
          number: '5.1',
          text: '⚠ PREENCHER: liste cada subcontratado (hospedagem, envio de e-mail, armazenamento de arquivos, processamento de pagamento, observabilidade), dizendo o que cada um trata e em que país.',
        },
        {
          number: '5.2',
          text: '⚠ PREENCHER: se houver transferência internacional de dados, indique o país e a salvaguarda adotada (LGPD, art. 33).',
        },
        {
          number: '5.3',
          text: 'Podemos fornecer dados mediante ordem judicial ou requisição legal. Sempre que a lei permitir, avisamos você antes.',
        },
        {
          number: '5.4',
          text: 'Em caso de reorganização societária, os dados podem ser transferidos ao sucessor, que fica vinculado a esta política.',
        },
      ],
    },
    {
      id: 'seguranca',
      title: 'Como protegemos',
      clauses: [
        {
          number: '6.1',
          text: 'Os dados de cada empresa ficam isolados no banco por Row Level Security, imposto pelo próprio PostgreSQL: o isolamento não depende de a aplicação lembrar de filtrar.',
        },
        {
          number: '6.2',
          text: 'Tráfego cifrado em trânsito, senhas com Argon2, verificação em duas etapas disponível para todos os usuários, sessões com rotação de token e detecção de reuso.',
        },
        {
          number: '6.3',
          text: '⚠ PREENCHER: cifragem em repouso, política de acesso da equipe aos dados de clientes e periodicidade de revisão.',
        },
        {
          number: '6.4',
          text: 'Nenhuma medida elimina o risco por completo. Havendo incidente de segurança com risco relevante, comunicamos você e a ANPD nos termos do art. 48 da LGPD.',
        },
      ],
    },
    {
      id: 'direitos',
      title: 'Seus direitos',
      clauses: [
        {
          number: '7.1',
          text: 'A LGPD (art. 18) garante ao titular: confirmação da existência de tratamento, acesso, correção, anonimização ou eliminação de dados desnecessários, portabilidade, informação sobre compartilhamento, e revogação do consentimento quando esta for a base legal.',
        },
        {
          number: '7.2',
          text: `Para exercer qualquer desses direitos, escreva para ${OPERATOR.privacyEmail}. Respondemos em até 15 dias.`,
        },
        {
          number: '7.3',
          text: 'Se você é cliente final de uma empresa que usa a Plataforma, o seu pedido deve ser dirigido a ela, que é a controladora desses dados. Recebendo um pedido assim, encaminhamos à empresa e avisamos você.',
        },
        {
          number: '7.4',
          text: 'Você também pode peticionar diretamente à Autoridade Nacional de Proteção de Dados.',
        },
      ],
    },
    {
      id: 'retencao',
      title: 'Por quanto tempo guardamos',
      highlight: true,
      intro:
        'Esta seção define quando os seus dados deixam de existir e por isso está destacada: é o ponto em que um prazo mal lido vira perda irreversível.',
      clauses: [
        {
          number: '8.1',
          text: '⚠ PREENCHER: prazo de retenção dos dados da conta após o encerramento, e a janela em que ainda é possível exportá-los.',
        },
        {
          number: '8.2',
          text: 'Registros de acesso são mantidos por 6 meses, conforme o art. 15 do Marco Civil da Internet.',
        },
        {
          number: '8.3',
          text: 'Documentos fiscais são mantidos pelo prazo exigido pela legislação tributária.',
        },
        {
          number: '8.4',
          text: 'Findos os prazos, os dados são eliminados ou anonimizados de forma irreversível, inclusive nos backups, respeitado o ciclo de rotação destes.',
        },
      ],
    },
    {
      id: 'alteracoes-privacidade',
      title: 'Alterações desta política',
      clauses: [
        {
          number: '9.1',
          text: 'Avisamos sobre mudanças relevantes por e-mail e na própria Plataforma, com antecedência mínima de 30 dias.',
        },
        {
          number: '9.2',
          text: 'A versão em vigor e a data do seu aceite ficam registradas, para que se saiba sempre qual texto valia em cada momento.',
        },
      ],
    },
  ],
};
