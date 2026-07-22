import { useMemo, useState } from 'react';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useClients, useWorkspaceRole } from '../hooks';
import { useAgenda } from '../hooks/useAgenda.js';
import { formatDate } from '../utils/formatters';
import AgendaDeleteConfirmModal from './agenda/AgendaDeleteConfirmModal.jsx';
import AgendaFormModal from './agenda/AgendaFormModal.jsx';
import { AGENDA_ITEM_TYPE_LABELS as ITEM_TYPE_LABELS } from './agenda/agendaFormUtils.js';
import AgendaStatusConfirmModal from './agenda/AgendaStatusConfirmModal.jsx';
import styles from './AgendaPage.module.css';

const STATUS_LABELS = {
  scheduled: 'Agendado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const STATUS_BADGE_VARIANTS = {
  scheduled: 'secondary',
  completed: 'success',
  cancelled: 'outline',
};

const PERIOD_FILTERS = [
  { value: 'today', label: 'Hoje' },
  { value: 'next7', label: 'Próximos 7 dias' },
  { value: 'all', label: 'Todos' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'cancelled', label: 'Cancelados' },
];

const ITEM_TYPE_FILTERS = [
  { value: 'all', label: 'Todos' },
  ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const PERIOD_SUBTITLES = {
  today: 'Acompanhe seus compromissos de hoje.',
  next7: 'Acompanhe seus compromissos dos próximos 7 dias.',
  all: 'Acompanhe todos os seus compromissos.',
};

const DEFAULT_PERIOD_FILTER = 'next7';
const DEFAULT_STATUS_FILTER = 'scheduled';
const DEFAULT_ITEM_TYPE_FILTER = 'all';

function getItemTypeLabel(itemType) {
  return ITEM_TYPE_LABELS[itemType] ?? itemType;
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

/** Chave local YYYY-MM-DD -- nunca UTC, sempre a partir dos campos locais do Date. */
function toLocalDateKey(value) {
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Limites do periodo selecionado em horario local do navegador, a partir
 * de uma data de referencia congelada (ver todayReference no componente --
 * evita drift e recalculo desnecessario a cada render). 'today': inicio a
 * fim do dia de referencia. 'next7': inicio do dia de referencia ate o fim
 * do setimo dia (referencia = 1o dia, +6 = 7o dia). 'all' nunca chama esta
 * funcao -- ver item 7 do diagnostico (sem limite enviado ao service).
 */
function computeRangeForPeriod(period, referenceDate) {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(start);
  end.setDate(end.getDate() + (period === 'today' ? 1 : 7));
  end.setMilliseconds(end.getMilliseconds() - 1);

  return { startsFrom: start.toISOString(), startsTo: end.toISOString() };
}

/** Agrupa itens (ja ordenados por starts_at pelo hook) por dia local -- a ordem de insercao no Map preserva a ordem cronologica dos grupos. */
function groupAgendaItemsByDay(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = toLocalDateKey(item.starts_at);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  }
  return grouped;
}

function formatDayLabel(dateKey) {
  const todayKey = toLocalDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = toLocalDateKey(tomorrowDate);

  if (dateKey === todayKey) return 'Hoje';
  if (dateKey === tomorrowKey) return 'Amanhã';

  const [year, month, day] = dateKey.split('-').map(Number);
  return formatDate(new Date(year, month - 1, day));
}

function formatTimeLabel(value) {
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAgendaItemTime(item) {
  if (item.is_all_day) return 'Dia inteiro';
  const startLabel = formatTimeLabel(item.starts_at);
  if (!item.ends_at) return startLabel;
  return `${startLabel}–${formatTimeLabel(item.ends_at)}`;
}

function AgendaPage() {
  const { user, workspace } = useSession();
  const workspaceId = workspace?.id;
  const workspaceLabel = workspace?.workspace_type === WORKSPACE_TYPES.BUSINESS ? 'Empresarial' : 'Pessoal';

  const [periodFilter, setPeriodFilter] = useState(DEFAULT_PERIOD_FILTER);
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [itemTypeFilter, setItemTypeFilter] = useState(DEFAULT_ITEM_TYPE_FILTER);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);

  // Data de referencia congelada uma unica vez por montagem -- evita drift
  // e recalculo do intervalo a cada render. Trocar o filtro de periodo
  // reusa a mesma referencia, so muda o calculo do intervalo.
  const todayReference = useMemo(() => new Date(), []);
  const range = useMemo(
    () => (periodFilter === 'all' ? null : computeRangeForPeriod(periodFilter, todayReference)),
    [periodFilter, todayReference],
  );

  const agenda = useAgenda({
    workspaceId,
    startsFrom: range?.startsFrom,
    startsTo: range?.startsTo,
    status: statusFilter === 'all' ? undefined : statusFilter,
    itemType: itemTypeFilter === 'all' ? undefined : itemTypeFilter,
  });
  const clientsState = useClients({ workspaceId });
  const workspaceRole = useWorkspaceRole({
    workspaceId,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const clientsById = useMemo(
    () => new Map(clientsState.clients.map((client) => [client.id, client])),
    [clientsState.clients],
  );

  const groupedByDay = useMemo(() => groupAgendaItemsByDay(agenda.items), [agenda.items]);

  const isLoading = agenda.isLoading || clientsState.isLoading;
  const agendaErrorMessage = agenda.error ? 'Não foi possível carregar a agenda.' : null;
  const clientsErrorMessage = clientsState.error
    ? 'Não foi possível carregar os clientes vinculados.'
    : null;
  const hasError = Boolean(agendaErrorMessage || clientsErrorMessage);
  const canShowToolbar = !isLoading && !hasError;
  const isDefaultFilters =
    periodFilter === DEFAULT_PERIOD_FILTER &&
    statusFilter === DEFAULT_STATUS_FILTER &&
    itemTypeFilter === DEFAULT_ITEM_TYPE_FILTER;

  async function handleRetry() {
    await Promise.all([agenda.refresh(), clientsState.refresh()]);
  }

  const canOpenCreate =
    Boolean(workspaceId) &&
    agenda.isConfigured &&
    workspaceRole.canUpdate === true &&
    !workspaceRole.isLoading &&
    !agenda.isMutating;

  function getCreateButtonTitle() {
    if (!workspaceId) return 'Selecione um espaço de trabalho.';
    if (!agenda.isConfigured) return 'A conexão de dados não está configurada.';
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canUpdate !== true) return 'Você não possui permissão para criar compromissos.';
    if (agenda.isMutating) return 'Aguarde a operação atual terminar.';
    return 'Criar um novo compromisso.';
  }

  function handleOpenCreate() {
    if (!canOpenCreate) return;
    // Somente um modal por vez -- abrir a criacao fecha qualquer edicao,
    // troca de status ou exclusao pendente. Mesmo padrao de CRMPage.jsx.
    setEditingItem(null);
    setStatusChangeTarget(null);
    setDeletingItem(null);
    setIsCreateOpen(true);
  }

  function handleCloseCreate() {
    setIsCreateOpen(false);
  }

  // canEditAgendaItem nao considera o status do item (completed/cancelled
  // continuam editaveis quando a role permite) -- decisao explicita desta
  // subfase, status permanece fora do formulario.
  const canEditAgendaItem =
    workspaceRole.canUpdate === true && !workspaceRole.isLoading && !agenda.isMutating;

  function handleOpenEdit(item) {
    if (!canEditAgendaItem) return;
    setIsCreateOpen(false);
    setStatusChangeTarget(null);
    setDeletingItem(null);
    setEditingItem(item);
  }

  function handleCloseEdit() {
    if (agenda.isMutating) return;
    setEditingItem(null);
  }

  // Permissao separada de canEditAgendaItem -- mesma matriz de papeis
  // (owner/admin/member), mas mantida como constante propria a pedido
  // explicito, para nao acoplar a acao de status a edicao de campos.
  const canChangeAgendaStatus =
    workspaceRole.canUpdate === true && !workspaceRole.isLoading && !agenda.isMutating;

  function handleRequestStatusChange(item, targetStatus) {
    if (!canChangeAgendaStatus) return;
    if (targetStatus !== 'completed' && targetStatus !== 'cancelled') return;
    setIsCreateOpen(false);
    setEditingItem(null);
    setDeletingItem(null);
    setStatusChangeTarget({ item, targetStatus });
  }

  function handleCloseStatusChange() {
    if (agenda.isMutating) return;
    setStatusChangeTarget(null);
  }

  // Permissao dedicada: workspaceRole.canDelete (owner/admin), NAO
  // canUpdate (owner/admin/member) -- corresponde exatamente a policy real
  // agenda_items_delete_owner_or_admin da migration 017. member/viewer nao
  // podem excluir, mesmo podendo editar/mudar status.
  const canDeleteAgendaItem =
    workspaceRole.canDelete === true && !workspaceRole.isLoading && !agenda.isMutating;

  function handleRequestDelete(item) {
    if (!canDeleteAgendaItem) return;
    setIsCreateOpen(false);
    setEditingItem(null);
    setStatusChangeTarget(null);
    setDeletingItem(item);
  }

  function handleCloseDelete() {
    if (agenda.isMutating) return;
    setDeletingItem(null);
  }

  let content;

  if (isLoading) {
    content = <Card padding="lg">Carregando agenda...</Card>;
  } else if (hasError) {
    content = (
      <Card padding="lg" role="alert" className={styles.errorCard}>
        {agendaErrorMessage ? <p>{agendaErrorMessage}</p> : null}
        {clientsErrorMessage ? <p>{clientsErrorMessage}</p> : null}
        <Button variant="secondary" size="sm" onClick={handleRetry}>
          Tentar novamente
        </Button>
      </Card>
    );
  } else if (agenda.items.length === 0) {
    content = (
      <Card padding="lg">
        {isDefaultFilters
          ? 'Nenhum compromisso agendado para os próximos 7 dias.'
          : 'Nenhum compromisso encontrado para os filtros selecionados.'}
      </Card>
    );
  } else {
    content = (
      <div className={styles.dayGroups}>
        {[...groupedByDay.entries()].map(([dateKey, dayItems]) => (
          <div key={dateKey} className={styles.dayGroup}>
            <h3 className={styles.dayGroupHeading}>{formatDayLabel(dateKey)}</h3>

            <div className={styles.dayGroupList}>
              {dayItems.map((item) => {
                const client = item.client_id ? clientsById.get(item.client_id) : null;

                return (
                  <Card key={item.id} variant="default" padding="md" className={styles.agendaItemCard}>
                    <div className={styles.agendaItemTop}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{getItemTypeLabel(item.item_type)}</span>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'default'} size="sm">
                        {getStatusLabel(item.status)}
                      </Badge>
                    </div>

                    <div className={styles.agendaItemMeta}>
                      <span>{formatAgendaItemTime(item)}</span>
                      {client ? <span>{client.name}</span> : null}
                      {item.location ? <span>{item.location}</span> : null}
                    </div>

                    <div className={styles.agendaItemActions}>
                      {item.status === 'scheduled' ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canChangeAgendaStatus}
                            aria-label={`Concluir ${item.title}`}
                            onClick={() => handleRequestStatusChange(item, 'completed')}
                          >
                            Concluir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canChangeAgendaStatus}
                            aria-label={`Cancelar ${item.title}`}
                            onClick={() => handleRequestStatusChange(item, 'cancelled')}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canEditAgendaItem}
                        aria-label={`Editar ${item.title}`}
                        onClick={() => handleOpenEdit(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={!canDeleteAgendaItem}
                        aria-label={`Excluir ${item.title}`}
                        onClick={() => handleRequestDelete(item)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="agenda-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {workspaceLabel}
          </Badge>
          <h2 id="agenda-title">Agenda</h2>
          <p>{PERIOD_SUBTITLES[periodFilter]}</p>
        </div>

        <div className={styles.actions}>
          <Button disabled={!canOpenCreate} title={getCreateButtonTitle()} onClick={handleOpenCreate}>
            Novo compromisso
          </Button>
          <Button variant="secondary" disabled title="Disponível em breve.">
            Perguntar à Uni
          </Button>
        </div>
      </section>

      <section className={styles.agendaSection} aria-labelledby="agenda-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="agenda-list-title">Próximos compromissos</h3>
            <p>Itens agendados deste workspace, agrupados por dia.</p>
          </div>
        </div>

        {canShowToolbar ? (
          <div className={styles.filters}>
            <div className={styles.filterGroup} role="group" aria-label="Filtrar por período">
              {PERIOD_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  variant={periodFilter === filter.value ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={periodFilter === filter.value}
                  onClick={() => setPeriodFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <div className={styles.filterGroup} role="group" aria-label="Filtrar por status">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  variant={statusFilter === filter.value ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor="agenda-type-filter">
              <span className="uf-text-primary">Tipo</span>
              <select
                id="agenda-type-filter"
                className={styles.filterSelect}
                value={itemTypeFilter}
                onChange={(event) => setItemTypeFilter(event.target.value)}
              >
                {ITEM_TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <span className={styles.resultCount}>
              {agenda.items.length} {agenda.items.length === 1 ? 'compromisso' : 'compromissos'}
            </span>
          </div>
        ) : null}

        {content}
      </section>

      {isCreateOpen ? (
        <AgendaFormModal
          key={`create-agenda-item-${workspaceId}`}
          open
          mode="create"
          agenda={agenda}
          clientsState={clientsState}
          onClose={handleCloseCreate}
        />
      ) : null}

      {editingItem ? (
        <AgendaFormModal
          key={`edit-agenda-item-${editingItem.id}`}
          open
          mode="edit"
          item={editingItem}
          agenda={agenda}
          clientsState={clientsState}
          onClose={handleCloseEdit}
        />
      ) : null}

      {statusChangeTarget ? (
        <AgendaStatusConfirmModal
          key={`agenda-status-${statusChangeTarget.item.id}-${statusChangeTarget.targetStatus}`}
          item={statusChangeTarget.item}
          targetStatus={statusChangeTarget.targetStatus}
          agenda={agenda}
          onClose={handleCloseStatusChange}
        />
      ) : null}

      {deletingItem ? (
        <AgendaDeleteConfirmModal
          key={`delete-agenda-item-${deletingItem.id}`}
          item={deletingItem}
          agenda={agenda}
          onClose={handleCloseDelete}
        />
      ) : null}
    </div>
  );
}

export default AgendaPage;
