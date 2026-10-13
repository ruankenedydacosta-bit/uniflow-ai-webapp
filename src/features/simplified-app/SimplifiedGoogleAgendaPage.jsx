import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import ChoiceRow from '../../components/ui/ChoiceRow/index.js';
import IconBox from '../../components/ui/IconBox/index.js';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import {
  confirmarConexao,
  desconectar,
  iniciarConexao,
  listarCalendarios,
  obterConexao,
  salvarPreferencias,
  sincronizarAgora,
} from '../../services/googleCalendarService.js';
import { cx } from '../../utils/cx.js';
import {
  agendaPropria,
  AVISO_SEM_SESSAO,
  avisoDaConfirmacao,
  avisoDaLeituraSalva,
  avisoDaSincronizacao,
  avisoDoDestinoSalvo,
  avisoInicialDoRetorno,
  comLeitura,
  descricaoDaAgenda,
  descricaoDaLeitura,
  GOOGLE_AGENDA_PENDING_PARAM,
  GOOGLE_AGENDA_RETURN_PARAM,
  MENSAGEM_ERRO_AO_CARREGAR,
  MENSAGEM_ERRO_AO_CARREGAR_AGENDAS,
  MENSAGEM_ERRO_AO_DESCONECTAR,
  mensagemDeErroAoConectar,
  mensagemDeErroAoSalvar,
  mensagemDoEstadoDaConexao,
  nomeDaAgenda,
  nomeDaAgendaDoEspaco,
  opcoesDeDestino,
  ordenarAgendas,
  pendenciaDoRetorno,
  textoDoUltimoSync,
  urlDeAutorizacaoValida,
} from './googleAgendaPresentation.js';
import { PhGoogleLogoIcon, PhXIcon } from './SimplifiedIcons.jsx';
import SimplifiedConfirmModal from './SimplifiedConfirmModal.jsx';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import { useNavegar } from './movimentoDeTelaContext.js';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedGoogleAgenda.module.css';

// Aviso inline com "X" para dispensar. Não há lib de toast em main.
function AvisoDispensavel({ aviso, onDismiss }) {
  const isAlert = aviso.tone === 'alert';
  return (
    <div className={cx(styles.notice, isAlert ? styles.noticeAlert : styles.noticeSuccess)} role={isAlert ? 'alert' : 'status'}>
      <p className={styles.noticeMessage}>{aviso.message}</p>
      <button type="button" className={styles.dismissButton} onClick={onDismiss} aria-label="Dispensar aviso">
        <PhXIcon />
      </button>
    </div>
  );
}

/**
 * Épico #98, issue #99: conectar a conta Google à agenda. Abre pelo topo da
 * Agenda (SIMPLIFIED_ROUTES.AGENDA_GOOGLE, `origem="agenda"`) e por
 * Configurações → Preferências. Voltar e o retorno do OAuth respeitam a
 * origem. O callback do OAuth volta para
 * cá com ?google_agenda=confirmar&pendente=<id> ou
 * ?google_agenda=negado|escopo_insuficiente|erro.
 *
 * "confirmar": a tela chama google-calendar-confirm com a sessão aberta. A
 * função só ativa a conexão se esta é a pessoa que iniciou o fluxo; se o
 * link foi aberto por outra conta, nada é conectado e a tela avisa.
 *
 * #102: agenda de destino, agendas lidas e "Sincronizar agora". As escolhas
 * são gravadas na hora por UPDATE direto (salvarPreferencias); a RLS e os
 * triggers da 055 só deixam escolher agenda própria (access_role 'owner').
 */
const ORIGENS = Object.freeze({
  agenda: Object.freeze({
    caminho: SIMPLIFIED_ROUTES.AGENDA,
    rotulo: 'Voltar para a Agenda',
    retornoDoOAuth: SIMPLIFIED_ROUTES.AGENDA_GOOGLE,
  }),
  configuracoes: Object.freeze({
    caminho: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.THEME].path,
    rotulo: 'Voltar para Configurações',
    retornoDoOAuth: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR].path,
  }),
});

function SimplifiedGoogleAgendaPage({ origem = 'configuracoes' }) {
  const voltar = ORIGENS[origem] ?? ORIGENS.configuracoes;
  const navigate = useNavegar();
  const { user, workspace, isLoading: isSessionLoading } = useSession();
  const workspaceId = workspace?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  // Lido uma vez: o parâmetro sai da URL logo em seguida.
  const [pendente] = useState(() => pendenciaDoRetorno(searchParams));
  const [aviso, setAviso] = useState(() => avisoInicialDoRetorno(searchParams));
  const [isConfirming, setIsConfirming] = useState(() => Boolean(pendente));
  const confirmacaoIniciadaRef = useRef(false);
  const [conexao, setConexao] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState(null);
  const [agendas, setAgendas] = useState([]);
  // 'carregando' | 'ok' | 'erro'. Só a leitura que deu certo pode dizer que
  // a conta não tem agendas.
  const [estadoDasAgendas, setEstadoDasAgendas] = useState('carregando');
  // Uma gravação por vez: 'destino' ou o id da agenda cuja leitura muda.
  const [salvando, setSalvando] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Gravação e sincronização não correm juntas: a releitura depois de
  // sincronizar desfaria uma marcação ainda não confirmada pelo banco.
  const ocupado = Boolean(salvando) || isSyncing;

  // O resultado do retorno vira aviso uma vez só; a URL fica limpa.
  useEffect(() => {
    if (!searchParams.has(GOOGLE_AGENDA_RETURN_PARAM) && !searchParams.has(GOOGLE_AGENDA_PENDING_PARAM)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(GOOGLE_AGENDA_RETURN_PARAM);
    next.delete(GOOGLE_AGENDA_PENDING_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Só a resposta do pedido mais recente vale. Cobre a troca de espaço com a
  // tela aberta e a leitura feita depois da confirmação, que não pode ser
  // sobrescrita pela leitura inicial, mais lenta.
  const ultimoPedidoRef = useRef(0);

  // Espaço aberto agora. Gravação e sincronização que terminam depois de
  // trocar de espaço não mostram aviso nem releem: a leitura do espaço novo
  // já foi disparada pela troca.
  const workspaceIdRef = useRef(workspaceId);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  // `silencioso` relê sem voltar ao "Carregando…" (depois de sincronizar).
  const carregarConexao = useCallback(({ silencioso = false } = {}) => {
    const pedido = ultimoPedidoRef.current + 1;
    ultimoPedidoRef.current = pedido;
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }
    if (!silencioso) {
      setIsLoading(true);
      setEstadoDasAgendas('carregando');
    }
    obterConexao({ workspaceId }).then(async ({ data, error }) => {
      if (ultimoPedidoRef.current !== pedido) return;
      let lidas = [];
      let erroDasAgendas = null;
      if (data?.id) {
        const resposta = await listarCalendarios({ connectionId: data.id });
        if (ultimoPedidoRef.current !== pedido) return;
        lidas = resposta.data ?? [];
        erroDasAgendas = resposta.error;
      }
      // Na releitura depois de sincronizar, uma falha mantém o que já está
      // na tela em vez de mostrar "Nenhuma conta conectada" e o aviso da
      // sincronização continua visível.
      if (silencioso && (error || erroDasAgendas)) return;
      setConexao(data ?? null);
      setAgendas(erroDasAgendas ? [] : lidas);
      setEstadoDasAgendas(error || erroDasAgendas ? 'erro' : 'ok');
      if (error) setAviso({ tone: 'alert', message: MENSAGEM_ERRO_AO_CARREGAR });
      else if (erroDasAgendas) setAviso({ tone: 'alert', message: MENSAGEM_ERRO_AO_CARREGAR_AGENDAS });
      setIsLoading(false);
    });
  }, [workspaceId]);

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (isActive) carregarConexao();
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [carregarConexao]);

  // Volta do Google: confirma uma vez só, com a sessão aberta neste navegador.
  // Espera a sessão carregar; sem sessão depois disso, avisa e não conecta.
  useEffect(() => {
    if (!pendente || confirmacaoIniciadaRef.current || isSessionLoading) return;
    confirmacaoIniciadaRef.current = true;
    if (!user?.id) {
      window.setTimeout(() => {
        setAviso(AVISO_SEM_SESSAO);
        setIsConfirming(false);
      }, 0);
      return;
    }
    const espacoDoPedido = workspaceIdRef.current;
    confirmarConexao({ pendente }).then(({ error }) => {
      setAviso(avisoDaConfirmacao(error));
      setIsConfirming(false);
      if (workspaceIdRef.current === espacoDoPedido) carregarConexao();
    });
  }, [pendente, isSessionLoading, user?.id, carregarConexao]);

  // Voltar do Google pelo botão do navegador restaura a página do cache com
  // o botão ainda carregando.
  useEffect(() => {
    function handlePageShow(event) {
      if (event.persisted) setIsConnecting(false);
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  async function handleConectar() {
    if (!workspaceId || isConnecting) return;
    setIsConnecting(true);
    setAviso(null);
    const { data, error } = await iniciarConexao({ workspaceId, returnPath: voltar.retornoDoOAuth });
    if (error || !urlDeAutorizacaoValida(data?.authorization_url)) {
      setAviso({ tone: 'alert', message: mensagemDeErroAoConectar(error) });
      setIsConnecting(false);
      return;
    }
    window.location.assign(data.authorization_url);
  }

  async function handleConfirmDesconectar() {
    if (!workspaceId || isDisconnecting) return;
    setIsDisconnecting(true);
    setDisconnectError(null);
    const { error } = await desconectar({ workspaceId });
    setIsDisconnecting(false);
    if (error) {
      setDisconnectError(MENSAGEM_ERRO_AO_DESCONECTAR);
      return;
    }
    setShowDisconnectConfirm(false);
    setConexao(null);
    setAgendas([]);
    setAviso({ tone: 'success', message: 'Google Agenda desconectado.' });
  }

  async function handleEscolherDestino(agenda) {
    if (!conexao || ocupado || agenda.external_calendar_id === conexao.destination_calendar_id) return;
    const connectionId = conexao.id;
    const espacoDoPedido = workspaceId;
    setSalvando('destino');
    setAviso(null);
    const { data, error } = await salvarPreferencias({
      connectionId,
      destinationCalendarId: agenda.external_calendar_id,
    });
    setSalvando(null);
    if (workspaceIdRef.current !== espacoDoPedido) return;
    if (error) {
      setAviso({ tone: 'alert', message: mensagemDeErroAoSalvar(error) });
      return;
    }
    setConexao((atual) => (atual?.id === connectionId
      ? { ...atual, destination_calendar_id: data.destination_calendar_id }
      : atual));
    setAviso(avisoDoDestinoSalvo(nomeDaAgenda(agenda)));
  }

  // Marca na hora e desfaz se o banco recusar.
  async function handleLeitura(agenda, lido) {
    if (!conexao || ocupado || !agendaPropria(agenda)) return;
    const connectionId = conexao.id;
    const espacoDoPedido = workspaceId;
    setSalvando(agenda.id);
    setAviso(null);
    setAgendas((atuais) => comLeitura(atuais, agenda.id, lido));
    const { error } = await salvarPreferencias({ connectionId, calendarioId: agenda.id, lido });
    setSalvando(null);
    if (workspaceIdRef.current !== espacoDoPedido) return;
    if (error) {
      setAgendas((atuais) => comLeitura(atuais, agenda.id, !lido));
      setAviso({ tone: 'alert', message: mensagemDeErroAoSalvar(error) });
      return;
    }
    setAviso(avisoDaLeituraSalva(nomeDaAgenda(agenda), lido));
  }

  async function handleSincronizar() {
    if (!workspaceId || ocupado) return;
    const espacoDoPedido = workspaceId;
    setIsSyncing(true);
    setAviso(null);
    const resposta = await sincronizarAgora({ workspaceId });
    setIsSyncing(false);
    if (workspaceIdRef.current !== espacoDoPedido) return;
    setAviso(avisoDaSincronizacao(resposta));
    // Relê a hora do último sync e o estado da conexão (RECONNECT_REQUIRED
    // deixa a conexão em erro e mostra o botão de conectar de novo).
    carregarConexao({ silencioso: true });
  }

  const estadoDaConexao = mensagemDoEstadoDaConexao(conexao);
  const nomeDaAgendaNova = nomeDaAgendaDoEspaco(workspace?.name);
  const destinos = opcoesDeDestino(agendas);
  const agendasOrdenadas = ordenarAgendas(agendas);
  const mostrarPreferencias = Boolean(conexao) && !isConfirming;
  const textoSemAgendas = {
    carregando: 'Carregando…',
    erro: 'Não foi possível carregar as agendas. Volte a esta tela para tentar de novo.',
  };

  return (
    <div className={styles.page} data-simplified-google-agenda>
      <SimplifiedSubpageHeader
        title="Google Agenda"
        onBack={() => navigate(voltar.caminho)}
        backLabel={voltar.rotulo}
      />

      {aviso ? <AvisoDispensavel aviso={aviso} onDismiss={() => setAviso(null)} /> : null}

      <section className={groups.group} aria-label="Conta Google">
        <h2 className={groups.groupLabel}>Conta Google</h2>
        <div className={groups.list}>
          <div className={cx(groups.row, styles.staticRow)}>
            <IconBox><PhGoogleLogoIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>
                {conexao ? 'Conta conectada' : 'Nenhuma conta conectada'}
              </span>
              <span className={cx(groups.rowSubtitle, styles.wrap)}>
                {isConfirming
                  ? 'Concluindo a conexão…'
                  : isLoading
                  ? 'Carregando…'
                  : conexao
                    ? (conexao.account_email || 'Conta Google')
                    : `Ao conectar, a agenda “${nomeDaAgendaNova}” é criada na sua conta Google.`}
              </span>
            </span>
            {conexao && !estadoDaConexao ? <span className={cx(groups.pill, groups.pillGreen)}>Conectada</span> : null}
          </div>
        </div>

        {estadoDaConexao ? <p className={styles.errorBanner} role="alert">{estadoDaConexao}</p> : null}

        {!isLoading && !isConfirming ? (
          <div className={styles.actions}>
            {!conexao || estadoDaConexao ? (
              <Button type="button" onClick={handleConectar} loading={isConnecting} disabled={!workspaceId}>
                {conexao ? 'Conectar de novo' : 'Conectar ao Google Agenda'}
              </Button>
            ) : null}
            {conexao ? (
              <OutlineButton variant="secondary" onClick={() => setShowDisconnectConfirm(true)}>
                Desconectar
              </OutlineButton>
            ) : null}
          </div>
        ) : null}
      </section>

      {mostrarPreferencias && !estadoDaConexao ? (
        <section className={groups.group} aria-label="Sincronização">
          <h2 className={groups.groupLabel}>Sincronização</h2>
          <div className={cx(groups.row, groups.rowPlain, styles.staticRow)}>
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>Última sincronização</span>
              <span className={groups.rowSubtitle}>{textoDoUltimoSync(conexao.last_synced_at)}</span>
            </span>
            <OutlineButton variant="secondary" onClick={handleSincronizar} loading={isSyncing} disabled={Boolean(salvando)}>
              Sincronizar agora
            </OutlineButton>
          </div>
        </section>
      ) : null}

      {mostrarPreferencias ? (
        <section className={groups.group} aria-labelledby="google-agenda-destino">
          <h2 id="google-agenda-destino" className={groups.groupLabel}>Agenda de destino</h2>
          <p className={styles.hint}>
            Os compromissos novos do UniFlow vão para a agenda escolhida. Ao trocar de agenda, os que já estão no Google continuam onde estão.
          </p>
          {destinos.length > 0 ? (
            <div className={styles.choices} role="group" aria-labelledby="google-agenda-destino">
              {destinos.map((agenda) => (
                <ChoiceRow
                  key={agenda.id}
                  title={nomeDaAgenda(agenda)}
                  description={descricaoDaAgenda(agenda)}
                  checked={agenda.external_calendar_id === conexao.destination_calendar_id}
                  disabled={ocupado}
                  onClick={() => handleEscolherDestino(agenda)}
                />
              ))}
            </div>
          ) : (
            <p className={styles.hint}>{textoSemAgendas[estadoDasAgendas] ?? 'Nenhuma agenda sua foi encontrada na conta Google.'}</p>
          )}
        </section>
      ) : null}

      {mostrarPreferencias ? (
        <section className={groups.group} aria-labelledby="google-agenda-lidas">
          <h2 id="google-agenda-lidas" className={groups.groupLabel}>Agendas lidas</h2>
          <p className={styles.hint}>
            Os eventos das agendas marcadas aparecem na agenda do UniFlow. Ao desmarcar uma agenda, os eventos já trazidos continuam no UniFlow.
          </p>
          {agendasOrdenadas.length > 0 ? (
            <div className={groups.list}>
              {agendasOrdenadas.map((agenda) => {
                const podeLer = agendaPropria(agenda);
                const descricao = descricaoDaLeitura(agenda, { conexaoComErro: Boolean(estadoDaConexao) });
                return (
                  <label
                    key={agenda.id}
                    className={cx(groups.row, groups.rowPlain, styles.checkRow)}
                    data-disabled={podeLer ? undefined : 'true'}
                  >
                    <span className={groups.rowText}>
                      <span className={groups.rowTitle}>{nomeDaAgenda(agenda)}</span>
                      {descricao ? <span className={cx(groups.rowSubtitle, styles.wrap)}>{descricao}</span> : null}
                    </span>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={Boolean(agenda.is_read)}
                      disabled={!podeLer || ocupado}
                      onChange={(event) => handleLeitura(agenda, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          ) : (
            <p className={styles.hint}>{textoSemAgendas[estadoDasAgendas] ?? 'Nenhuma agenda foi encontrada na conta Google.'}</p>
          )}
        </section>
      ) : null}

      <SimplifiedConfirmModal
        open={showDisconnectConfirm}
        onClose={() => { if (!isDisconnecting) { setShowDisconnectConfirm(false); setDisconnectError(null); } }}
        icon={<PhGoogleLogoIcon />}
        title="Desconectar o Google Agenda?"
        description="Os compromissos continuam no UniFlow. A agenda UniFlow e os eventos continuam na sua conta Google."
        confirmLabel="Desconectar"
        onConfirm={handleConfirmDesconectar}
        loading={isDisconnecting}
        error={disconnectError}
      />
    </div>
  );
}

export default SimplifiedGoogleAgendaPage;
