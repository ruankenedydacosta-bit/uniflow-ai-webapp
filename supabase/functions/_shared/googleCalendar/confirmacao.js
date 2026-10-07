// Confirmação da conexão com o Google Agenda (#99).
//
// O callback do OAuth deixa a conexão com status 'pending' e manda o
// navegador de volta ao app com ?google_agenda=confirmar&pendente=<id>. O id
// é de uso único e vale 10 minutos; o banco guarda só o hash. A função
// google-calendar-confirm só ativa a conexão se quem confirma é a pessoa que
// iniciou o fluxo. Lógica pura, testada com node --test.

export const VALIDADE_DA_PENDENCIA_MS = 10 * 60 * 1000;
export const PARAMETRO_PENDENTE = 'pendente';

export const SITUACOES_DA_CONFIRMACAO = Object.freeze({
  OK: 'ok',
  // Nenhuma pendência com este id: nunca existiu ou já foi usada.
  INEXISTENTE: 'inexistente',
  VENCIDA: 'vencida',
  OUTRA_PESSOA: 'outra_pessoa',
});

const ID_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function idDePendenciaValido(valor) {
  return typeof valor === 'string' && ID_RE.test(valor);
}

// `linha`: a conexão achada pelo hash do id (ou null).
export function classificarConfirmacao({ linha, userId, agora = Date.now() }) {
  if (!linha || linha.status !== 'pending') return SITUACOES_DA_CONFIRMACAO.INEXISTENTE;
  if (linha.user_id !== userId) return SITUACOES_DA_CONFIRMACAO.OUTRA_PESSOA;
  const vence = Date.parse(linha.confirmation_expires_at ?? '');
  if (!Number.isFinite(vence) || vence <= agora) return SITUACOES_DA_CONFIRMACAO.VENCIDA;
  return SITUACOES_DA_CONFIRMACAO.OK;
}

// Código de erro da resposta da google-calendar-confirm para cada situação.
export const ERRO_DA_CONFIRMACAO = Object.freeze({
  [SITUACOES_DA_CONFIRMACAO.INEXISTENTE]: { status: 410, code: 'CONFIRMATION_INVALID', message: 'Link de conexão vencido ou já usado.' },
  [SITUACOES_DA_CONFIRMACAO.VENCIDA]: { status: 410, code: 'CONFIRMATION_EXPIRED', message: 'Link de conexão vencido.' },
  [SITUACOES_DA_CONFIRMACAO.OUTRA_PESSOA]: { status: 403, code: 'CONFIRMATION_FORBIDDEN', message: 'Este link de conexão é de outra pessoa.' },
});
