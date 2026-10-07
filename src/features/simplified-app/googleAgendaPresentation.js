// Textos e regras de tela do Google Agenda (/app/conta/google-agenda).
// Lógica pura, testada em simplifiedGoogleAgenda.test.js.

export const GOOGLE_AGENDA_RETURN_PARAM = 'google_agenda';

const AVISOS_DE_RETORNO = Object.freeze({
  conectado: Object.freeze({ tone: 'success', message: 'Google Agenda conectado.' }),
  negado: Object.freeze({
    tone: 'alert',
    message: 'Você não permitiu o acesso ao Google Agenda. Para conectar, tente de novo e permita o acesso.',
  }),
  escopo_insuficiente: Object.freeze({
    tone: 'alert',
    message: 'O Google Agenda não foi conectado porque faltaram permissões. Tente de novo e marque todas as permissões pedidas.',
  }),
  erro: Object.freeze({
    tone: 'alert',
    message: 'Não foi possível conectar ao Google Agenda. Tente de novo em alguns minutos.',
  }),
});

// Valor de ?google_agenda= devolvido pelo callback. Valor desconhecido não
// mostra aviso.
export function avisoDoRetorno(valor) {
  return Object.hasOwn(AVISOS_DE_RETORNO, valor ?? '') ? AVISOS_DE_RETORNO[valor] : null;
}

const MENSAGENS_DE_ERRO_DA_CONEXAO = Object.freeze({
  token_revogado: 'O Google não autoriza mais o acesso a esta conta. Conecte de novo para continuar.',
  escopo_insuficiente: 'Faltam permissões do Google. Conecte de novo e marque todas as permissões pedidas.',
  destino_ausente: 'A agenda de destino não existe mais no Google. Conecte de novo para continuar.',
});

export function mensagemDoEstadoDaConexao(conexao) {
  if (!conexao || conexao.status !== 'error') return null;
  return MENSAGENS_DE_ERRO_DA_CONEXAO[conexao.last_error_code]
    ?? 'A conexão com o Google Agenda parou de funcionar. Conecte de novo para continuar.';
}

export function mensagemDeErroAoConectar(error) {
  if (error?.code === 'NOT_ALLOWED') return 'O Google Agenda ainda não está disponível para a sua conta.';
  return 'Não foi possível abrir o Google agora. Tente de novo.';
}

export const MENSAGEM_ERRO_AO_DESCONECTAR = 'Não foi possível desconectar agora. Tente de novo.';
export const MENSAGEM_ERRO_AO_CARREGAR = 'Não foi possível carregar a conexão com o Google Agenda. Tente de novo.';

// Só segue para a tela de consentimento do próprio Google.
export function urlDeAutorizacaoValida(valor) {
  if (typeof valor !== 'string') return false;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

// Mesmo nome que nomeDoCalendarioDoEspaco (supabase/functions/_shared/
// googleCalendar/oauth.js) grava no Google, inclusive o corte em 80.
export function nomeDaAgendaDoEspaco(nomeDoEspaco) {
  const nome = typeof nomeDoEspaco === 'string' ? nomeDoEspaco.trim() : '';
  return `UniFlow · ${(nome || 'Meu espaço').slice(0, 80)}`;
}
