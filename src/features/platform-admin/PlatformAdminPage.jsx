import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button/Button.jsx';
import Input from '../../components/ui/Input/Input.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import Segmented from '../../components/ui/Segmented/Segmented.jsx';
import { SUBSCRIPTION_TIERS } from '../../services/billingTypes.js';
import {
  grantManualPlan,
  listPlatformUsers,
  revokeManualPlan,
} from '../../services/platformAdminService.js';
import { cx } from '../../utils/cx.js';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { PhCaretRightIcon, PhXIcon } from '../simplified-app/SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';
import { formatDate } from '../simplified-app/subscriptionPresentation.js';
import groups from '../simplified-app/simplifiedGroups.module.css';
import {
  filterPlatformUsers,
  MANUAL_PLAN_MONTH_OPTIONS,
  PLATFORM_USERS_LIST_LIMIT,
  resolvePlatformAdminErrorMessage,
  resolveUserPlanSummary,
} from './platformAdminPresentation.js';
import { useIsPlatformAdmin } from './useIsPlatformAdmin.js';
import styles from './platformAdmin.module.css';

const TIER_OPTIONS = SUBSCRIPTION_TIERS.map((tier) => ({ value: tier.id, label: tier.name }));
const PILL_TONES = Object.freeze({ ok: groups.pillGreen, warn: null, neutral: groups.pillMuted });
const MONTH_OPTIONS = MANUAL_PLAN_MONTH_OPTIONS.map((months) => ({
  value: months,
  label: months === 1 ? '1 mês' : `${months} meses`,
}));

// Painel da equipe da UniFlow: lista todos os usuários e concede, renova ou
// encerra um plano manual. Quem não é admin vê só o aviso de acesso negado;
// o bloqueio de verdade está nas funções admin_* do banco (migration 055).
function PlatformAdminPage() {
  const navigate = useNavigate();
  const accessStatus = useIsPlatformAdmin();
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [tierId, setTierId] = useState(TIER_OPTIONS[1].value);
  const [months, setMonths] = useState(MONTH_OPTIONS[0].value);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    const result = await listPlatformUsers();
    setUsers(result.data ?? []);
    setLoadError(result.error ?? null);
    setIsLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (accessStatus !== 'granted') return undefined;
    // Mesmo deferimento via setTimeout(0) das telas de assinatura: evita
    // setState síncrono no corpo do efeito.
    const timeoutId = window.setTimeout(loadUsers, 0);
    return () => window.clearTimeout(timeoutId);
  }, [accessStatus, loadUsers]);

  const visibleUsers = useMemo(() => filterPlatformUsers(users, searchTerm), [users, searchTerm]);
  const selectedSummary = selectedUser ? resolveUserPlanSummary(selectedUser) : null;

  function openUser(user) {
    const summary = resolveUserPlanSummary(user);
    setSelectedUser(user);
    setTierId(summary.isManual && user.tier_id ? user.tier_id : TIER_OPTIONS[1].value);
    setMonths(MONTH_OPTIONS[0].value);
    setNote('');
    setActionError(null);
  }

  function closeUser() {
    if (isSaving) return;
    setSelectedUser(null);
    setActionError(null);
  }

  async function runAction(action, successMessage) {
    setIsSaving(true);
    setActionError(null);
    const result = await action();
    setIsSaving(false);
    if (result.error) {
      setActionError(resolvePlatformAdminErrorMessage(result.error));
      return;
    }
    setSelectedUser(null);
    setNotice(successMessage);
    loadUsers();
  }

  function handleGrant() {
    const who = selectedUser.full_name || selectedUser.email;
    const tierName = TIER_OPTIONS.find((option) => option.value === tierId)?.label;
    const period = MONTH_OPTIONS.find((option) => option.value === months)?.label;
    runAction(
      () => grantManualPlan({ userId: selectedUser.user_id, tierId, months, note }),
      `${who} agora tem o plano ${tierName} por ${period}.`,
    );
  }

  function handleRevoke() {
    const who = selectedUser.full_name || selectedUser.email;
    runAction(
      () => revokeManualPlan({ userId: selectedUser.user_id, note }),
      `O plano manual de ${who} foi encerrado. O acesso termina agora.`,
    );
  }

  return (
    <div className={styles.page} data-platform-admin>
      <SimplifiedSubpageHeader
        title="Administração"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
      />

      {accessStatus === 'loading' ? (
        <p className={styles.state}>Verificando acesso...</p>
      ) : accessStatus === 'denied' ? (
        <p className={styles.state}>Sua conta não tem acesso à administração.</p>
      ) : (
        <>
          {notice ? (
            <div className={cx(styles.banner, styles.bannerOk)} role="status">
              <span>{notice}</span>
              <button type="button" className={styles.dismiss} onClick={() => setNotice(null)} aria-label="Fechar aviso">
                <PhXIcon />
              </button>
            </div>
          ) : null}

          <Input
            type="search"
            label="Buscar usuário"
            placeholder="Nome ou e-mail"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            fullWidth
          />

          {isLoadingUsers && users.length === 0 ? (
            <p className={styles.state}>Carregando usuários...</p>
          ) : loadError ? (
            <div className={cx(styles.banner, styles.bannerError)} role="alert">
              <span>{resolvePlatformAdminErrorMessage(loadError)}</span>
              <button type="button" className={styles.dismiss} onClick={loadUsers}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <section className={groups.group} aria-label="Usuários">
              <h2 className={groups.groupLabel}>
                {searchTerm ? `${visibleUsers.length} de ${users.length} usuários` : `${users.length} usuários`}
              </h2>
              {users.length >= PLATFORM_USERS_LIST_LIMIT ? (
                <p className={styles.hint}>
                  A lista mostra só os {PLATFORM_USERS_LIST_LIMIT} cadastros mais recentes. Quem se cadastrou antes não aparece na busca.
                </p>
              ) : null}
              {visibleUsers.length === 0 ? (
                <p className={styles.state}>Nenhum usuário encontrado. Confira o nome ou o e-mail.</p>
              ) : (
                <div className={groups.list}>
                  {visibleUsers.map((user) => {
                    const summary = resolveUserPlanSummary(user);
                    return (
                      <button
                        key={user.user_id}
                        type="button"
                        className={groups.row}
                        onClick={() => openUser(user)}
                      >
                        <span className={groups.rowText}>
                          <span className={groups.rowTitle}>{user.full_name || user.email}</span>
                          <span className={groups.rowSubtitle}>
                            {user.full_name ? user.email : null}
                            {user.is_platform_admin ? `${user.full_name ? ' · ' : ''}Admin` : null}
                          </span>
                        </span>
                        <span className={cx(groups.pill, PILL_TONES[summary.tone])}>
                          {summary.tierName ? `${summary.tierName}${summary.isManual ? ' · manual' : ''}` : summary.label}
                        </span>
                        <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={Boolean(selectedUser)}
        onClose={closeUser}
        title={selectedUser?.full_name || selectedUser?.email || ''}
        description={selectedUser?.full_name ? selectedUser.email : undefined}
        footer={selectedSummary?.canGrant ? (
          <>
            {selectedSummary.canRevoke ? (
              <Button type="button" variant="danger" onClick={handleRevoke} disabled={isSaving}>
                Encerrar plano
              </Button>
            ) : null}
            <Button type="button" variant="primary" onClick={handleGrant} loading={isSaving}>
              {selectedSummary.isManual ? 'Renovar plano' : 'Conceder plano'}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={closeUser}>Fechar</Button>
        )}
      >
        {selectedUser ? (
          <div className={styles.details}>
            <dl className={styles.facts}>
              <div>
                <dt>Plano atual</dt>
                <dd>
                  {selectedSummary.tierName
                    ? `${selectedSummary.tierName} · ${selectedSummary.label}${selectedSummary.isManual ? ' · manual' : ' · pela cobrança'}`
                    : selectedSummary.lastStatusLabel
                      ? `Sem plano (último: ${selectedSummary.lastStatusLabel})`
                      : 'Sem plano'}
                </dd>
              </div>
              {selectedSummary.tierName && selectedUser.current_period_ends_at ? (
                <div>
                  <dt>Válido até</dt>
                  <dd>{formatDate(selectedUser.current_period_ends_at)}</dd>
                </div>
              ) : null}
              {selectedSummary.isManual && selectedUser.grant_note ? (
                <div>
                  <dt>Motivo</dt>
                  <dd>{selectedUser.grant_note}</dd>
                </div>
              ) : null}
              <div>
                <dt>Cadastro</dt>
                <dd>{formatDate(selectedUser.created_at)}</dd>
              </div>
              <div>
                <dt>Último acesso</dt>
                <dd>{selectedUser.last_sign_in_at ? formatDate(selectedUser.last_sign_in_at) : 'Nunca entrou'}</dd>
              </div>
            </dl>

            {selectedSummary.canGrant ? (
              <>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Plano</span>
                  <Segmented label="Plano" options={TIER_OPTIONS} value={tierId} onChange={setTierId} />
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Período a partir de hoje</span>
                  <Segmented label="Período" options={MONTH_OPTIONS} value={months} onChange={setMonths} />
                </div>
                <Input
                  label="Motivo (opcional)"
                  placeholder="Ex.: parceiro, cortesia, teste"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={200}
                  fullWidth
                />
                <p className={styles.hint}>
                  Os minutos de voz do período inteiro ficam liberados de uma vez. Renovar começa um período novo com a cota cheia.
                </p>
              </>
            ) : (
              <p className={styles.hint}>
                Essa pessoa tem uma assinatura paga ou aguardando pagamento. Altere o plano dela pela cobrança, não por aqui.
              </p>
            )}

            {actionError ? <p className={cx(styles.banner, styles.bannerError)} role="alert">{actionError}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default PlatformAdminPage;
