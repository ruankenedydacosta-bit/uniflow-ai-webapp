import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import IconBox from '../../components/ui/IconBox/index.js';
import Modal from '../../components/ui/Modal/Modal.jsx';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import { desconectar, iniciarConexao, obterConexao } from '../../services/googleCalendarService.js';
import { cx } from '../../utils/cx.js';
import {
  avisoDoRetorno,
  GOOGLE_AGENDA_RETURN_PARAM,
  MENSAGEM_ERRO_AO_CARREGAR,
  MENSAGEM_ERRO_AO_DESCONECTAR,
  mensagemDeErroAoConectar,
  mensagemDoEstadoDaConexao,
  nomeDaAgendaDoEspaco,
  urlDeAutorizacaoValida,
} from './googleAgendaPresentation.js';
import { PhGoogleLogoIcon, PhXIcon } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
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
 * Épico #98, issue #99: conectar a conta Google à agenda. Rota fora do menu
 * até a #102 pôr a entrada em Preferências. O callback do OAuth volta para
 * cá com ?google_agenda=conectado|negado|escopo_insuficiente|erro.
 */
function SimplifiedGoogleAgendaPage() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const [aviso, setAviso] = useState(() => avisoDoRetorno(searchParams.get(GOOGLE_AGENDA_RETURN_PARAM)));
  const [conexao, setConexao] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState(null);

  // O resultado do retorno vira aviso uma vez só; a URL fica limpa.
  useEffect(() => {
    if (!searchParams.has(GOOGLE_AGENDA_RETURN_PARAM)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(GOOGLE_AGENDA_RETURN_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const carregarConexao = useCallback(() => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    obterConexao({ workspaceId }).then(({ data, error }) => {
      setConexao(data ?? null);
      if (error) setAviso({ tone: 'alert', message: MENSAGEM_ERRO_AO_CARREGAR });
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
    const { data, error } = await iniciarConexao({ workspaceId });
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
    setAviso({ tone: 'success', message: 'Google Agenda desconectado.' });
  }

  const estadoDaConexao = mensagemDoEstadoDaConexao(conexao);
  const nomeDaAgenda = nomeDaAgendaDoEspaco(workspace?.name);

  return (
    <div className={styles.page} data-simplified-google-agenda>
      <SimplifiedSubpageHeader
        title="Google Agenda"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
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
                {isLoading
                  ? 'Carregando…'
                  : conexao
                    ? (conexao.account_email || 'Conta Google')
                    : `Ao conectar, a agenda “${nomeDaAgenda}” é criada na sua conta Google.`}
              </span>
            </span>
            {conexao && !estadoDaConexao ? <span className={cx(groups.pill, groups.pillGreen)}>Conectada</span> : null}
          </div>
        </div>

        {estadoDaConexao ? <p className={styles.errorBanner} role="alert">{estadoDaConexao}</p> : null}

        {!isLoading ? (
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

      <Modal
        open={showDisconnectConfirm}
        onClose={() => { if (!isDisconnecting) { setShowDisconnectConfirm(false); setDisconnectError(null); } }}
        title="Desconectar o Google Agenda?"
        description="Os compromissos continuam no UniFlow. A agenda UniFlow e os eventos continuam na sua conta Google."
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowDisconnectConfirm(false); setDisconnectError(null); }}
              disabled={isDisconnecting}
            >
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmDesconectar} loading={isDisconnecting}>
              Desconectar
            </Button>
          </>
        )}
      >
        {disconnectError ? <p className={styles.errorBanner} role="alert">{disconnectError}</p> : null}
      </Modal>
    </div>
  );
}

export default SimplifiedGoogleAgendaPage;
