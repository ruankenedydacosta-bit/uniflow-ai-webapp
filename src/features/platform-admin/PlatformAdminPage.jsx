import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Input from '../../components/ui/Input/Input.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import Segmented from '../../components/ui/Segmented/Segmented.jsx';
import { SUBSCRIPTION_TIERS } from '../../services/billingTypes.js';
import {
  grantManualPlan,
  listPlatformUsers,
  revokeManualPlan,
  setUserBlocked,
  setUserPlan,
} from '../../services/platformAdminService.js';
import { cx } from '../../utils/cx.js';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { PhXIcon } from '../simplified-app/SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';
import { formatDate } from '../simplified-app/subscriptionPresentation.js';
import groups from '../simplified-app/simplifiedGroups.module.css';
import {
  filterPlatformUsers,
  keepsManualPlanPeriod,
  MANUAL_PLAN_MONTH_OPTIONS,
  PLATFORM_USERS_LIST_LIMIT,
  resolvePlatformAdminErrorMessage,
  resolveUserPlanSummary,
} from './platformAdminPresentation.js';
import { useIsPlatformAdmin } from './useIsPlatformAdmin.js';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import styles from './platformAdmin.module.css';

const TIER_OPTIONS = SUBSCRIPTION_TIERS.map((tier) => ({ value: tier.id, label: tier.name }));
const MONTH_OPTIONS = MANUAL_PLAN_MONTH_OPTIONS.map((months) => ({
  value: months,
  label: months === 1 ? '1 mês' : `${months} meses`,
}));

const NO_PLAN_VALUE = '';

function resolveOriginLabel(user, summary) {
  if (summary.isManual) return 'manual';
  return user.subscription_billed ? 'pela cobrança' : 'sem cobrança';
}

// Painel da equipe da UniFlow: lista todos os usuários, troca o plano direto
// na linha e, no modal, concede, renova ou encerra um plano manual e bloqueia
// o acesso. Quem não é admin vê só o aviso de acesso negado; o bloqueio de
// verdade está nas funções admin_* do banco (migrations 056 e 058).
function PlatformAdminPage() {
  const navigate = useNavegar();
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
  const [rowError, setRowError] = useState(null);
  const [savingUserIds, setSavingUserIds] = useState(() => new Set());
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isConfirmingBlock, setIsConfirmingBlock] = useState(false);

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
    setIsConfirmingBlock(false);
  }

  function closeUser() {
    if (isSaving) return;
    setSelectedUser(null);
    setActionError(null);
    setIsConfirmingBlock(false);
  }

  function nameOf(user) {
    return user.full_name || user.email;
  }

  function markSaving(userId, isRowSaving) {
    setSavingUserIds((current) => {
      const next = new Set(current);
      if (isRowSaving) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  // Troca pela lista: plano manual mantém a data de fim; sem plano manual,
  // ganha 1 mês. "Sem plano" pede confirmação antes de encerrar.
  async function handleRowPlanChange(user, value) {
    if (value === NO_PLAN_VALUE) {
      setRevokeTarget(user);
      return;
    }
    markSaving(user.user_id, true);
    setRowError(null);
    setNotice(null);
    const keepsPeriod = keepsManualPlanPeriod(user, new Date());
    const result = await setUserPlan({ userId: user.user_id, tierId: value });
    markSaving(user.user_id, false);
    if (result.error) {
      setRowError(`${nameOf(user)}: ${resolvePlatformAdminErrorMessage(result.error)}`);
      return;
    }
    const tierName = TIER_OPTIONS.find((option) => option.value === value)?.label;
    setNotice(keepsPeriod
      ? `${nameOf(user)} agora tem o plano ${tierName}, com a mesma data de fim.`
      : `${nameOf(user)} agora tem o plano ${tierName} por 1 mês.`);
    loadUsers();
  }

  async function handleConfirmRevoke() {
    const user = revokeTarget;
    setIsRevoking(true);
    setRowError(null);
    setNotice(null);
    const result = await revokeManualPlan({ userId: user.user_id });
    setIsRevoking(false);
    setRevokeTarget(null);
    if (result.error) {
      setRowError(`${nameOf(user)}: ${resolvePlatformAdminErrorMessage(result.error)}`);
      return;
    }
    setNotice(`O plano manual de ${nameOf(user)} foi encerrado. O acesso termina agora.`);
    loadUsers();
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
    const who = nameOf(selectedUser);
    const tierName = TIER_OPTIONS.find((option) => option.value === tierId)?.label;
    const period = MONTH_OPTIONS.find((option) => option.value === months)?.label;
    runAction(
      () => grantManualPlan({ userId: selectedUser.user_id, tierId, months, note }),
      `${who} agora tem o plano ${tierName} por ${period}.`,
    );
  }

  function handleRevoke() {
    const who = nameOf(selectedUser);
    runAction(
      () => revokeManualPlan({ userId: selectedUser.user_id, note }),
      `O plano manual de ${who} foi encerrado. O acesso termina agora.`,
    );
  }

  function handleToggleBlock() {
    const who = nameOf(selectedUser);
    const blocked = !selectedUser.is_blocked;
    runAction(
      () => setUserBlocked({ userId: selectedUser.user_id, blocked, note }),
      blocked
        ? `${who} foi bloqueado. O login está recusado e as sessões abertas foram encerradas.`
        : `${who} foi desbloqueado e já pode entrar de novo.`,
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

          {rowError ? (
            <div className={cx(styles.banner, styles.bannerError)} role="alert">
              <span>{rowError}</span>
              <button type="button" className={styles.dismiss} onClick={() => setRowError(null)} aria-label="Fechar aviso">
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
                    const isRowSaving = savingUserIds.has(user.user_id);
                    const details = [
                      user.full_name ? user.email : null,
                      user.is_platform_admin ? 'Admin' : null,
                      summary.tierName && !summary.isManual
                        ? (user.subscription_billed ? 'Pela cobrança' : 'Sem cobrança')
                        : null,
                      summary.tierName && summary.tone !== 'ok' ? summary.label : null,
                    ].filter(Boolean);
                    return (
                      <div key={user.user_id} className={styles.userRow}>
                        <span className={groups.rowText}>
                          <span className={groups.rowTitle}>{nameOf(user)}</span>
                          {details.length > 0 ? (
                            <span className={groups.rowSubtitle}>{details.join(' · ')}</span>
                          ) : null}
                          {user.is_blocked ? (
                            <span className={cx(groups.pill, styles.pillBlocked)}>Bloqueado</span>
                          ) : null}
                        </span>
                        <select
                          className={styles.planSelect}
                          aria-label={`Plano de ${nameOf(user)}`}
                          title={summary.canGrant ? undefined : 'Assinatura paga pela Asaas. Altere o plano pela cobrança.'}
                          value={summary.tierName ? user.tier_id : NO_PLAN_VALUE}
                          onChange={(event) => handleRowPlanChange(user, event.target.value)}
                          disabled={!summary.canGrant || isRowSaving}
                        >
                          <option value={NO_PLAN_VALUE} disabled={!summary.canRevoke}>Sem plano</option>
                          {TIER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openUser(user)}>
                          Ver
                        </Button>
                      </div>
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
                    ? `${selectedSummary.tierName} · ${selectedSummary.label} · ${resolveOriginLabel(selectedUser, selectedSummary)}`
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
                <p className={styles.hint}>
                  Os minutos de voz do período inteiro ficam liberados de uma vez. Renovar começa um período novo com a cota cheia.
                </p>
              </>
            ) : (
              <p className={styles.hint}>
                Essa pessoa tem uma assinatura paga ou aguardando pagamento. Altere o plano dela pela cobrança, não por aqui.
              </p>
            )}

            <Input
              label="Motivo (opcional)"
              placeholder="Ex.: parceiro, cortesia, teste, abuso"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              fullWidth
            />

            {selectedUser.is_platform_admin && !selectedUser.is_blocked ? null : (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Acesso</span>
                {selectedUser.is_blocked ? (
                  <>
                    <p className={styles.hint}>Conta bloqueada. O login é recusado até você desbloquear.</p>
                    <Button type="button" variant="secondary" onClick={handleToggleBlock} disabled={isSaving}>
                      Desbloquear conta
                    </Button>
                  </>
                ) : isConfirmingBlock ? (
                  <>
                    <p className={styles.hint}>
                      Bloquear recusa o login e encerra as sessões abertas. Quem está com o app aberto sai em até 1 hora. O plano não muda.
                    </p>
                    <div className={styles.inlineActions}>
                      <Button type="button" variant="secondary" onClick={() => setIsConfirmingBlock(false)} disabled={isSaving}>
                        Cancelar
                      </Button>
                      <Button type="button" variant="danger" onClick={handleToggleBlock} disabled={isSaving}>
                        Confirmar bloqueio
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setIsConfirmingBlock(true)} disabled={isSaving}>
                    Bloquear conta
                  </Button>
                )}
              </div>
            )}

            {actionError ? <p className={cx(styles.banner, styles.bannerError)} role="alert">{actionError}</p> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => (isRevoking ? null : setRevokeTarget(null))}
        title="Encerrar plano manual?"
        description={revokeTarget ? nameOf(revokeTarget) : undefined}
        size="sm"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>
              Manter plano
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmRevoke} loading={isRevoking}>
              Encerrar plano
            </Button>
          </>
        )}
      >
        <p className={styles.hint}>O acesso pago e os minutos de voz terminam agora.</p>
      </Modal>
    </div>
  );
}

export default PlatformAdminPage;
