// Textos e regras de tela do Google Agenda (/app/conta/google-agenda).
// Lógica pura, testada em simplifiedGoogleAgenda.test.js.

export const GOOGLE_AGENDA_RETURN_PARAM = 'google_agenda';
export const GOOGLE_AGENDA_PENDING_PARAM = 'pendente';
export const RETORNO_A_CONFIRMAR = 'confirmar';

// Retorno do callback que pede confirmação: devolve o id da pendência.
export function pendenciaDoRetorno(searchParams) {
  if (searchParams?.get(GOOGLE_AGENDA_RETURN_PARAM) !== RETORNO_A_CONFIRMAR) return null;
  const pendente = searchParams.get(GOOGLE_AGENDA_PENDING_PARAM);
  return typeof pendente === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(pendente) ? pendente : null;
}

export const AVISO_LINK_DE_OUTRA_PESSOA = Object.freeze({
  tone: 'alert',
  message: 'Este link de conexão foi aberto por outra conta do UniFlow. Nada foi conectado. Para conectar a sua conta Google, toque em Conectar ao Google Agenda.',
});

export const AVISO_SEM_SESSAO = Object.freeze({
  tone: 'alert',
  message: 'Entre na conta do UniFlow que pediu a conexão e tente conectar de novo. Nada foi conectado.',
});

const AVISOS_DA_CONFIRMACAO = Object.freeze({
  CONFIRMATION_FORBIDDEN: AVISO_LINK_DE_OUTRA_PESSOA,
  CONFIRMATION_EXPIRED: Object.freeze({
    tone: 'alert',
    message: 'O link de conexão venceu. Toque em Conectar ao Google Agenda para tentar de novo.',
  }),
  CONFIRMATION_INVALID: Object.freeze({
    tone: 'alert',
    message: 'Este link de conexão já foi usado ou venceu. Nada mais foi conectado.',
  }),
  SCOPE_INSUFFICIENT: Object.freeze({
    tone: 'alert',
    message: 'O Google Agenda não foi conectado porque faltaram permissões. Tente de novo e marque todas as permissões pedidas.',
  }),
});

export function avisoDaConfirmacao(error) {
  if (!error) return AVISOS_DE_RETORNO_CONECTADO;
  return AVISOS_DA_CONFIRMACAO[error.code]
    ?? Object.freeze({ tone: 'alert', message: 'Não foi possível concluir a conexão com o Google Agenda. Tente de novo em alguns minutos.' });
}

const AVISOS_DE_RETORNO_CONECTADO = Object.freeze({ tone: 'success', message: 'Google Agenda conectado.' });

const AVISOS_DE_RETORNO = Object.freeze({
  conectado: AVISOS_DE_RETORNO_CONECTADO,
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
