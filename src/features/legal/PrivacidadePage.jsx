// Política de Privacidade pública, em /privacidade.
//
// Esta página também é pré-renderizada no build (scripts/prerender-legal.mjs),
// então roda em SSR: nada de window, document, contexto de sessão ou hook do
// router aqui. Links são <a> comuns.
import {
  CONTATO_PRIVACIDADE,
  PRIVACIDADE_ATUALIZADA_EM,
  PROVEDORES,
} from './politicaDePrivacidade.js';
import styles from './legalPage.module.css';

const GOOGLE_USER_DATA_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy';
const GOOGLE_PERMISSIONS = 'https://myaccount.google.com/permissions';
const ANPD = 'https://www.gov.br/anpd';

function PrivacidadePage() {
  const { email, whatsapp, whatsappUrl } = CONTATO_PRIVACIDADE;

  return (
    <main className={styles.page}>
      <article className={styles.content}>
        <a className={styles.backLink} href="/">Voltar para o UniFlow AI</a>

        <header className={styles.header}>
          <h1>Política de Privacidade</h1>
          <p className={styles.updated}>Última atualização: {PRIVACIDADE_ATUALIZADA_EM}</p>
        </header>

        <section>
          <p>
            Esta política explica quais dados pessoais o aplicativo UniFlow AI coleta, para que usa,
            com quem compartilha e como você pode exercer seus direitos. Ela segue a Lei Geral de
            Proteção de Dados (Lei nº 13.709/2018, LGPD).
          </p>
          <p>
            A política vale para o aplicativo UniFlow AI, inclusive a assistente Uni. O site de
            apresentação da UniFlow AI tem política própria.
          </p>
        </section>

        <section>
          <h2>1. Quem trata seus dados</h2>
          <p>
            A UniFlow AI é a controladora dos dados pessoais tratados no aplicativo. Para falar sobre
            privacidade ou exercer seus direitos, escreva para{' '}
            <a href={`mailto:${email}`}>{email}</a> ou chame no WhatsApp{' '}
            <a href={whatsappUrl} rel="noopener noreferrer">{whatsapp}</a>.
          </p>
        </section>

        <section>
          <h2>2. Dados que coletamos</h2>

          <h3>Dados da conta</h3>
          <ul>
            <li>Nome, e-mail e senha. A senha é guardada de forma protegida e ninguém da equipe consegue lê-la.</li>
            <li>Se você entrar com o Google: nome, e-mail e foto de perfil da sua conta Google.</li>
            <li>Dados que você informar no perfil, como nome preferido, pronúncia do nome, telefone, data de nascimento e foto.</li>
            <li>Respostas da apresentação inicial e suas preferências de uso, como tema e voz.</li>
          </ul>

          <h3>Dados financeiros que você registra</h3>
          <ul>
            <li>Contas, saldos, ajustes de saldo e limites de crédito.</li>
            <li>Entradas e saídas, com descrição, valor, data, categoria, forma de pagamento e observações.</li>
            <li>Metas, aportes e planos financeiros.</li>
          </ul>
          <p>
            A UniFlow AI não se conecta ao seu banco. Os dados financeiros são os que você digita ou
            pede para a Uni registrar.
          </p>

          <h3>Conversas com a Uni</h3>
          <ul>
            <li>O texto das mensagens que você troca com a Uni, inclusive as que nascem da sua voz.</li>
            <li>Arquivos de áudio com a voz da Uni, guardados para reaproveitar respostas repetidas.</li>
          </ul>
          <p>
            O áudio da sua voz não é guardado. Ele é usado só para transcrever o que você disse.
          </p>

          <h3>Agenda e lembretes</h3>
          <ul>
            <li>Compromissos, com título, descrição, local e horário.</li>
            <li>Se você ativar as notificações, os dados técnicos do seu navegador para entregar os lembretes.</li>
          </ul>

          <h3>Pagamento da assinatura</h3>
          <ul>
            <li>Nome, CPF ou CNPJ, e-mail e celular.</li>
            <li>Plano, situação da assinatura e histórico de pagamentos.</li>
          </ul>
          <p>
            Os dados do cartão são processados pela Asaas. A UniFlow AI não guarda o número do cartão.
          </p>

          <h3>Suporte</h3>
          <ul>
            <li>Assunto e descrição dos pedidos de ajuda que você abrir no app.</li>
          </ul>

          <h3>Dados técnicos</h3>
          <ul>
            <li>Endereço IP, tipo de navegador e de aparelho, registrados pelos serviços que operam o app.</li>
            <li>Registros de erro sem o seu nome, e-mail ou valores.</li>
            <li>Contagem de uso da Uni, para aplicar os limites do seu plano.</li>
            <li>Estatísticas de navegação, só se você permitir o Google Analytics.</li>
          </ul>
        </section>

        <section>
          <h2>3. Para que usamos os dados</h2>
          <ul>
            <li>
              <strong>Prestar o serviço que você contratou:</strong> criar sua conta, guardar seus
              registros, responder pela Uni, enviar lembretes e cobrar a assinatura. Base legal:
              execução de contrato (art. 7º, V, da LGPD).
            </li>
            <li>
              <strong>Manter o app seguro e funcionando:</strong> prevenir fraude e abuso, aplicar os
              limites do plano e corrigir falhas. Base legal: legítimo interesse (art. 7º, IX).
            </li>
            <li>
              <strong>Cumprir obrigações legais:</strong> guardar registros de pagamento e atender
              autoridades. Base legal: cumprimento de obrigação legal (art. 7º, II).
            </li>
            <li>
              <strong>Medir o uso do app com o Google Analytics:</strong> só com a sua permissão. Base
              legal: consentimento (art. 7º, I).
            </li>
          </ul>
          <p>
            A UniFlow AI não vende seus dados e não usa seus dados para publicidade.
          </p>
        </section>

        <section>
          <h2>4. A Uni e a inteligência artificial</h2>
          <p>
            A Uni usa modelos de inteligência artificial da OpenAI. Para responder, o app envia à
            OpenAI:
          </p>
          <ul>
            <li>o que você escreveu ou falou;</li>
            <li>as últimas mensagens da conversa;</li>
            <li>os nomes das suas contas e categorias;</li>
            <li>um resumo dos seus números do mês, como total de entradas e saídas e a categoria com mais gastos.</li>
          </ul>
          <p>
            Não escreva nem fale senhas, números de cartão ou documentos na conversa com a Uni.
          </p>
          <p>
            Quando você fala com a Uni, o áudio vai para a OpenAI para ser transcrito. Na conversa por
            voz contínua, o áudio do microfone vai do seu navegador direto para a OpenAI enquanto a
            conversa estiver aberta, junto com seu nome preferido (ou o primeiro nome do cadastro) e a
            pronúncia do nome, se você a informou. O app só usa
            o microfone depois que você permite e toca para falar.
          </p>
          <p>
            A UniFlow AI não usa seus dados para treinar modelos de inteligência artificial. Pelos
            termos da API da OpenAI, os dados enviados pela API também não são usados para treinar os
            modelos da OpenAI. A OpenAI pode guardá-los por um período limitado para monitorar abuso.
          </p>
          <p>
            A Uni pode errar. Confira os valores antes de confirmar um registro.
          </p>
        </section>

        <section>
          <h2>5. Login com Google e Google Agenda</h2>
          <p>
            Se você entrar com o Google, o app pede só os escopos <strong>openid</strong>,{' '}
            <strong>userinfo.email</strong> e <strong>userinfo.profile</strong>. Com eles, o app recebe
            seu nome, seu e-mail e sua foto de perfil.
          </p>
          <ul>
            <li><strong>Como usamos:</strong> para criar sua conta, identificar você no login e mostrar seu nome e foto no app.</li>
            <li><strong>Onde ficam:</strong> no banco de dados do app, no Supabase, junto com o restante da sua conta.</li>
            <li><strong>Com quem compartilhamos:</strong> com ninguém além dos provedores que operam o app, listados na seção 6.</li>
          </ul>
          <p>
            O app não pede acesso a contatos, Gmail ou Google Drive. O acesso ao Google Agenda só é
            pedido se você conectar a agenda, como explicado abaixo.
          </p>

          <h3>Google Agenda</h3>
          <p>
            Se você conectar o Google Agenda, o app pede os escopos{' '}
            <strong>calendar.app.created</strong>, <strong>calendar.calendarlist.readonly</strong> e{' '}
            <strong>calendar.events.owned</strong>. Com eles, o app:
          </p>
          <ul>
            <li>cria na sua conta a agenda “UniFlow”, com o nome do seu espaço;</li>
            <li>lê a lista das suas agendas, com nome, fuso horário e permissão, e o e-mail da conta;</li>
            <li>grava seus compromissos do UniFlow na agenda que você escolher;</li>
            <li>lê os eventos das agendas próprias que você escolher, para mostrá-los na agenda do app.</li>
          </ul>
          <ul>
            <li><strong>Onde ficam:</strong> no Supabase. A chave de acesso ao Google fica criptografada e nunca chega ao aparelho.</li>
            <li><strong>Com quem compartilhamos:</strong> com ninguém além dos provedores que operam o app, listados na seção 6.</li>
            <li><strong>Como desconectar:</strong> na tela do Google Agenda no app, toque em <strong>Desconectar</strong>. O app apaga a conexão e revoga o acesso no Google quando a mesma conta Google não está conectada em outro espaço. A agenda UniFlow e os eventos continuam na sua conta Google. Você também pode remover o acesso em myaccount.google.com/permissions.</li>
          </ul>
          <p>
            O uso de dados recebidos das APIs do Google segue a{' '}
            <a href={GOOGLE_USER_DATA_POLICY} rel="noopener noreferrer">
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado. Esses dados não são usados para publicidade,
            não são vendidos e não são usados para treinar modelos de inteligência artificial.
          </p>
          <p>
            Para revogar o acesso, remova o UniFlow AI em{' '}
            <a href={GOOGLE_PERMISSIONS} rel="noopener noreferrer">myaccount.google.com/permissions</a>.
            Para apagar os dados que já recebemos, peça a exclusão da conta, como explicado na seção 10.
          </p>
        </section>

        <section>
          <h2>6. Com quem compartilhamos</h2>
          <p>
            Compartilhamos dados só com os provedores abaixo, cada um com a parte necessária para a
            sua função:
          </p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Provedor</th>
                  <th scope="col">O que recebe</th>
                  <th scope="col">Para quê</th>
                </tr>
              </thead>
              <tbody>
                {PROVEDORES.map((provedor) => (
                  <tr key={provedor.nome}>
                    <td>{provedor.nome}</td>
                    <td>{provedor.recebe}</td>
                    <td>{provedor.finalidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Também podemos compartilhar dados quando a lei exigir, por ordem judicial ou pedido de
            autoridade competente, e para defender direitos da UniFlow AI em processo.
          </p>
        </section>

        <section>
          <h2>7. Transferência para fora do Brasil</h2>
          <p>
            Alguns provedores da seção 6 guardam ou processam dados fora do Brasil, principalmente nos
            Estados Unidos. Essas transferências seguem o art. 33 da LGPD e os contratos e garantias
            oferecidos por cada provedor.
          </p>
        </section>

        <section>
          <h2>8. Dados guardados no seu aparelho</h2>
          <p>
            O app guarda no navegador do seu aparelho os dados necessários para funcionar:
          </p>
          <ul>
            <li>a sessão de login;</li>
            <li>tema, preferências de voz e etapas da apresentação já concluídas;</li>
            <li>o histórico recente da conversa com a Uni;</li>
            <li>uma cópia dos números da tela inicial, apagada quando você sai da conta;</li>
            <li>sua escolha sobre o Google Analytics.</li>
          </ul>
          <p>
            O app não cria cookies próprios. O Google Analytics cria cookies só se você permitir. Para
            mudar a escolha, toque em <strong>Mais</strong> e depois em{' '}
            <strong>Privacidade e Analytics</strong>.
          </p>
          <p>
            O histórico da conversa continua no aparelho depois que você sai da conta. Em aparelho
            compartilhado, apague os dados do site nas configurações do navegador.
          </p>
        </section>

        <section>
          <h2>9. Por quanto tempo guardamos</h2>
          <ul>
            <li>Dados da conta, registros financeiros, agenda e conversas: enquanto sua conta existir.</li>
            <li>Contagem diária de uso da Uni: até 62 dias.</li>
            <li>
              Dados de pagamento e cobrança: pelo prazo exigido pela legislação fiscal e de defesa do
              consumidor, mesmo depois da exclusão da conta.
            </li>
          </ul>
          <p>
            Quando a conta for excluída, apagamos os demais dados, exceto os que a lei obriga a guardar.
          </p>
        </section>

        <section>
          <h2>10. Seus direitos</h2>
          <p>Pela LGPD, você pode pedir:</p>
          <ul>
            <li>confirmação de que tratamos seus dados e acesso a eles;</li>
            <li>correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
            <li>portabilidade dos dados para outro fornecedor;</li>
            <li>eliminação dos dados tratados com o seu consentimento;</li>
            <li>informação sobre com quem compartilhamos seus dados;</li>
            <li>informação sobre a possibilidade de não consentir e o que acontece nesse caso;</li>
            <li>revogação do consentimento;</li>
            <li>revisão de decisões tomadas só com base em tratamento automatizado.</li>
          </ul>
          <p>
            Para fazer qualquer pedido, inclusive a exclusão da conta, escreva para{' '}
            <a href={`mailto:${email}`}>{email}</a> a partir do e-mail da sua conta. Podemos pedir
            uma confirmação para ter certeza de que é você.
          </p>
          <p>
            Se não ficar satisfeito com a resposta, você pode reclamar na{' '}
            <a href={ANPD} rel="noopener noreferrer">Autoridade Nacional de Proteção de Dados (ANPD)</a>.
          </p>
        </section>

        <section>
          <h2>11. Segurança</h2>
          <p>
            Os dados trafegam com criptografia (HTTPS). No banco, cada pessoa só acessa os dados da
            própria conta. As chaves de acesso aos provedores ficam no servidor, fora do app.
          </p>
          <p>
            Nenhum serviço na internet é totalmente imune a falhas. Se houver um incidente que possa
            causar risco ou dano relevante, avisaremos você e a ANPD, como manda a LGPD.
          </p>
        </section>

        <section>
          <h2>12. Menores de idade</h2>
          <p>
            O UniFlow AI é destinado a maiores de 18 anos. Se você souber que um menor criou uma conta,
            escreva para <a href={`mailto:${email}`}>{email}</a>.
          </p>
        </section>

        <section>
          <h2>13. Mudanças nesta política</h2>
          <p>
            Quando esta política mudar, a data no início da página será atualizada. Se a mudança for
            relevante, avisaremos você no app antes de ela valer.
          </p>
        </section>
      </article>
    </main>
  );
}

export default PrivacidadePage;
