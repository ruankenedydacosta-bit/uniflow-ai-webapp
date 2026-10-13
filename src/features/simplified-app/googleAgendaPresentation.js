// Textos e regras de tela do Google Agenda (/app/conta/google-agenda).
// Lógica pura, testada em simplifiedGoogleAgenda.test.js.

export const GOOGLE_AGENDA_RETURN_PARAM = 'google_agenda';
export const GOOGLE_AGENDA_PENDING_PARAM = 'pendente';
export const RETORNO_A_CONFIRMAR = 'confirmar';
export const PADRAO_ID_DE_PENDENCIA = /^[A-Za-z0-9_-]{32,128}$/;

// Retorno do callback que pede confirmação: devolve o id da pendência.
// Mesmo parâmetro e mesmo formato de PARAMETRO_PENDENTE e
// PADRAO_ID_DE_PENDENCIA (supabase/functions/_shared/googleCalendar/
// confirmacao.js); simplifiedGoogleAgenda.test.js compara os dois.
export function pendenciaDoRetorno(searchParams) {
  if (searchParams?.get(GOOGLE_AGENDA_RETURN_PARAM) !== RETORNO_A_CONFIRMAR) return null;
  const pendente = searchParams.get(GOOGLE_AGENDA_PENDING_PARAM);
  return typeof pendente === 'string' && PADRAO_ID_DE_PENDENCIA.test(pendente) ? pendente : null;
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

// Aviso ao abrir a tela: o do retorno do callback ou, quando o retorno pede
// confirmação mas o id veio cortado ou inválido, o de link já usado.
export function avisoInicialDoRetorno(searchParams) {
  const valor = searchParams?.get(GOOGLE_AGENDA_RETURN_PARAM);
  if (valor === RETORNO_A_CONFIRMAR) {
    return pendenciaDoRetorno(searchParams) ? null : avisoDaConfirmacao({ code: 'CONFIRMATION_INVALID' });
  }
  return avisoDoRetorno(valor);
}

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

// ---------- #102: agendas, destino e sincronização ----------

// Só agenda própria pode ser destino ou ser lida. Os triggers da 055
// recusam o resto; a tela desabilita antes.
export function agendaPropria(calendario) {
  return calendario?.access_role === 'owner';
}

// Agenda do UniFlow primeiro, depois a principal, depois as outras por nome.
export function ordenarAgendas(calendarios) {
  const lista = Array.isArray(calendarios) ? calendarios.filter(Boolean) : [];
  const peso = (calendario) => (calendario.is_app_created ? 0 : calendario.is_primary ? 1 : 2);
  return [...lista].sort((a, b) => (
    peso(a) - peso(b)
    || String(a.summary ?? '').localeCompare(String(b.summary ?? ''), 'pt-BR', { sensitivity: 'base' })
  ));
}

export function opcoesDeDestino(calendarios) {
  return ordenarAgendas(calendarios).filter(agendaPropria);
}

export function nomeDaAgenda(calendario) {
  const nome = typeof calendario?.summary === 'string' ? calendario.summary.trim() : '';
  return nome || 'Agenda sem nome';
}

// Apoio da opção de destino.
export function descricaoDaAgenda(calendario) {
  if (calendario?.is_app_created) return 'Criada pelo UniFlow para este espaço';
  if (calendario?.is_primary) return 'Agenda principal da conta';
  return null;
}

// Apoio da linha de leitura: explica a caixa desabilitada e a leitura que
// falhou. Com a conexão em erro, "Sincronizar agora" some da tela e o aviso
// de reconectar já explica a falha.
export function descricaoDaLeitura(calendario, { conexaoComErro = false } = {}) {
  if (!agendaPropria(calendario)) return 'Compartilhada com você. Só agendas suas podem ser lidas.';
  if (calendario.is_read && calendario.last_sync_error && !conexaoComErro) {
    return 'A última leitura falhou. Toque em Sincronizar agora.';
  }
  return descricaoDaAgenda(calendario);
}

// Troca is_read de uma agenda na lista, sem mexer nas outras.
export function comLeitura(calendarios, calendarioId, lido) {
  return (Array.isArray(calendarios) ? calendarios : []).map((calendario) => (
    calendario.id === calendarioId ? { ...calendario, is_read: lido } : calendario
  ));
}

function partesDaData(data, timeZone) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data);
  return Object.fromEntries(partes.map(({ type, value }) => [type, value]));
}

// "Hoje às 14:32", "Ontem às 09:05" ou "12/10/2026 às 18:00".
export function textoDoUltimoSync(valor, { agora = new Date(), timeZone } = {}) {
  const data = valor ? new Date(valor) : null;
  if (!data || Number.isNaN(data.getTime())) return 'Ainda não sincronizado';
  const quando = partesDaData(data, timeZone);
  const hoje = partesDaData(agora, timeZone);
  const ontem = partesDaData(new Date(agora.getTime() - 24 * 60 * 60 * 1000), timeZone);
  const mesmoDia = (a, b) => a.day === b.day && a.month === b.month && a.year === b.year;
  const hora = `${quando.hour}:${quando.minute}`;
  if (mesmoDia(quando, hoje)) return `Hoje às ${hora}`;
  if (mesmoDia(quando, ontem)) return `Ontem às ${hora}`;
  return `${quando.day}/${quando.month}/${quando.year} às ${hora}`;
}

function contagem(total, singular, plural) {
  return `${total} ${total === 1 ? singular : plural}`;
}

// Aviso do "Sincronizar agora". Os códigos vêm de google-calendar-sync-now
// (#101). Enquanto a função não existir, a resposta cai no aviso genérico.
export function avisoDaSincronizacao({ data, error } = {}) {
  if (error) {
    if (error.code === 'NOT_CONNECTED') {
      return { tone: 'alert', message: 'O Google Agenda não está conectado neste espaço. Conecte a sua conta para sincronizar.' };
    }
    if (error.code === 'RECONNECT_REQUIRED') {
      return { tone: 'alert', message: 'O Google não autoriza mais o acesso a esta conta. Toque em Conectar de novo para continuar.' };
    }
    if (error.code === 'GOOGLE_UNAVAILABLE') {
      return { tone: 'alert', message: 'O Google não respondeu. Tente sincronizar de novo em alguns minutos.' };
    }
    return { tone: 'alert', message: 'Não foi possível sincronizar agora. Tente de novo mais tarde.' };
  }

  const calendarios = Array.isArray(data?.calendarios) ? data.calendarios : [];
  const comErro = calendarios.filter((calendario) => calendario?.status === 'erro').length;
  if (comErro > 0) {
    return {
      tone: 'alert',
      message: `${contagem(comErro, 'agenda não foi sincronizada', 'agendas não foram sincronizadas')}. Tente de novo em alguns minutos.`,
    };
  }
  if (calendarios.length > 0 && calendarios.every((calendario) => calendario?.status === 'skipped')) {
    return { tone: 'success', message: 'A agenda acabou de ser sincronizada. Para sincronizar de novo, aguarde 30 segundos.' };
  }

  const somar = (campo) => calendarios.reduce((total, calendario) => total + (Number(calendario?.[campo]) || 0), 0);
  const partes = [
    [somar('inseridos'), 'evento novo', 'eventos novos'],
    [somar('atualizados'), 'evento alterado', 'eventos alterados'],
    [somar('cancelados'), 'evento cancelado', 'eventos cancelados'],
  ].filter(([total]) => total > 0).map(([total, singular, plural]) => contagem(total, singular, plural));
  if (partes.length === 0) return { tone: 'success', message: 'Agenda sincronizada. Não há mudanças no Google.' };
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
  return { tone: 'success', message: `Agenda sincronizada. ${lista[0].toUpperCase()}${lista.slice(1)}.` };
}

export function avisoDoDestinoSalvo(nome) {
  return {
    tone: 'success',
    message: `Os próximos compromissos vão para a agenda “${nome}”. Os que já estão no Google continuam onde estão.`,
  };
}

export function avisoDaLeituraSalva(nome, lido) {
  return lido
    ? { tone: 'success', message: `Os eventos da agenda “${nome}” vão aparecer no UniFlow.` }
    : { tone: 'success', message: `A agenda “${nome}” não é mais lida. Os eventos já trazidos continuam no UniFlow.` };
}

export function mensagemDeErroAoSalvar(error) {
  if (error?.code === 'DESTINATION_NOT_ALLOWED' || error?.code === 'READ_NOT_ALLOWED') {
    return 'Só agendas suas podem ser usadas. Escolha outra agenda.';
  }
  return 'Não foi possível salvar a escolha. Tente de novo.';
}

export const MENSAGEM_ERRO_AO_CARREGAR_AGENDAS = 'Não foi possível carregar as agendas do Google. Tente de novo.';

// Linha do Google Agenda no topo da Agenda. `estado`: 'carregando' | 'ok' |
// 'erro' (a leitura da conexão falhou). Conexão pendente ainda não conta
// como conectada.
export function resumoDaConexaoNaAgenda(entrada) {
  const { conexao, estado, agora, timeZone } = entrada ?? {};
  if (estado === 'carregando') return { detalhe: 'Carregando…', tom: 'neutro' };
  if (estado === 'erro') return { detalhe: 'Toque para ver a conexão', tom: 'neutro' };
  if (conexao?.status === 'error') return { detalhe: 'Conecte de novo para sincronizar', tom: 'alerta' };
  if (conexao?.status === 'active') {
    return { detalhe: `Conectada · ${textoDoUltimoSync(conexao.last_synced_at, { agora, timeZone })}`, tom: 'ok' };
  }
  return { detalhe: 'Conecte para trazer seus eventos', tom: 'convite' };
}
