import { useMemo, useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import { useClients, useCrmPipeline, useWorkspaceRole } from '../hooks';
import { formatCurrency, formatDate } from '../utils/formatters';
import { normalizeSearchText } from '../utils/searchText.js';
import { calculateCrmMetrics, formatConversionRate } from './crm/crmMetrics.js';
import OpportunityFormModal from './crm/OpportunityFormModal.jsx';
import OpportunityOutcomeConfirmModal from './crm/OpportunityOutcomeConfirmModal.jsx';
import { getOpportunityMoveErrorMessage } from './crm/opportunityFormUtils.js';
import styles from './CRMPage.module.css';

const OUTCOME_LABELS = {
  won: 'Ganha',
  lost: 'Perdida',
  cancelled: 'Cancelada',
};

const OUTCOME_BADGE_VARIANTS = {
  won: 'success',
  lost: 'danger',
  cancelled: 'outline',
};

const OUTCOME_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'won', label: 'Ganhas' },
  { value: 'lost', label: 'Perdidas' },
  { value: 'cancelled', label: 'Canceladas' },
];

const CLOSED_SORT_OPTIONS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'value-desc', label: 'Maior valor' },
  { value: 'value-asc', label: 'Menor valor' },
  { value: 'title', label: 'Título A–Z' },
];

function sumEstimatedValue(opportunities) {
  return opportunities.reduce((total, opportunity) => {
    const value = Number(opportunity.estimated_value);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function toSafeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toSafeTimestamp(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getOutcomeLabel(outcome) {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

function matchesOpportunitySearch(opportunity, normalizedQuery, clientsById) {
  if (!normalizedQuery) return true;
  const clientName = clientsById.get(opportunity.client_id)?.name;
  return [opportunity.title, clientName].some((field) =>
    normalizeSearchText(field).includes(normalizedQuery),
  );
}

function sortClosedOpportunities(opportunities, sortOrder) {
  const sorted = [...opportunities];

  if (sortOrder === 'value-desc') {
    sorted.sort((a, b) => toSafeNumber(b.estimated_value) - toSafeNumber(a.estimated_value));
  } else if (sortOrder === 'value-asc') {
    sorted.sort((a, b) => toSafeNumber(a.estimated_value) - toSafeNumber(b.estimated_value));
  } else if (sortOrder === 'title') {
    sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'pt-BR'));
  } else {
    sorted.sort((a, b) => toSafeTimestamp(b.updated_at) - toSafeTimestamp(a.updated_at));
  }

  return sorted;
}

/**
 * Nao existe campo dedicado de "data de encerramento" no schema
 * (crm_opportunities so tem created_at/updated_at/stage_entered_at) --
 * usamos updated_at, rotulado como "Atualizado em" (nao "Encerrado em"),
 * pois qualquer mutacao na linha atualiza esse campo, nao so o
 * encerramento. Valida antes de formatar para nunca quebrar a pagina com
 * uma data invalida.
 */
function formatUpdatedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDate(value);
}

function CRMPage() {
  const { access } = useAccess();
  const { user, workspace } = useSession();
  const isBusinessWorkspace = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS;
  const workspaceId = workspace?.id;

  // Instancia unica: includeClosedOpportunities:true traz abertas e
  // encerradas juntas em pipeline.opportunities. Nunca criar uma segunda
  // instancia de useCrmPipeline para o mesmo workspace -- duplicaria
  // isMutating/mutationRef (mutacoes deixariam de se bloquear mutuamente) e
  // a query de listOpportunities (a versao com includeClosed:true ja e um
  // superconjunto da versao sem). Abertas/encerradas sao derivadas
  // localmente logo abaixo.
  const pipeline = useCrmPipeline({
    workspaceId,
    includeArchivedStages: false,
    includeClosedOpportunities: true,
  });
  const clientsState = useClients({ workspaceId });
  const workspaceRole = useWorkspaceRole({
    workspaceId,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [outcomeOpportunity, setOutcomeOpportunity] = useState(null);
  const [moveError, setMoveError] = useState(null);
  const [view, setView] = useState('open');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [opportunitySearch, setOpportunitySearch] = useState('');
  const [closedSortOrder, setClosedSortOrder] = useState('recent');

  const openOpportunities = useMemo(
    () => pipeline.opportunities.filter((opportunity) => opportunity.outcome === 'open'),
    [pipeline.opportunities],
  );
  const closedOpportunities = useMemo(
    () => pipeline.opportunities.filter((opportunity) => opportunity.outcome !== 'open'),
    [pipeline.opportunities],
  );
  // Indicadores gerenciais: derivados exclusivamente de pipeline.opportunities
  // (ja carregado), sem nova consulta -- reagem sozinhos a criacao/
  // movimentacao/edicao/encerramento porque esses fluxos ja atualizam esse
  // array local (nenhum refresh/reload envolvido). Nao sao afetados pela
  // busca local (busca filtra a lista exibida, nao os indicadores).
  const metrics = useMemo(
    () => calculateCrmMetrics(pipeline.opportunities),
    [pipeline.opportunities],
  );

  const clientsById = useMemo(
    () => new Map(clientsState.clients.map((client) => [client.id, client])),
    [clientsState.clients],
  );
  const stagesById = useMemo(
    () => new Map(pipeline.stages.map((stage) => [stage.id, stage])),
    [pipeline.stages],
  );

  // Mesmo estado de busca serve as duas visoes (Pipeline aberto/Encerradas)
  // -- nao reseta ao trocar de aba, mesmo padrao ja usado por outcomeFilter.
  const normalizedOpportunitySearch = normalizeSearchText(opportunitySearch);

  // Busca aplicada ANTES do agrupamento por etapa -- as colunas continuam
  // todas presentes (Map ja inicializado com todas as etapas), so o
  // conteudo de cada uma reflete a busca.
  const searchedOpenOpportunities = useMemo(
    () =>
      openOpportunities.filter((opportunity) =>
        matchesOpportunitySearch(opportunity, normalizedOpportunitySearch, clientsById),
      ),
    [openOpportunities, normalizedOpportunitySearch, clientsById],
  );

  const opportunitiesByStageId = useMemo(() => {
    const grouped = new Map();
    for (const stage of pipeline.stages) {
      grouped.set(stage.id, []);
    }
    for (const opportunity of searchedOpenOpportunities) {
      const stageOpportunities = grouped.get(opportunity.stage_id);
      if (stageOpportunities) {
        stageOpportunities.push(opportunity);
      }
    }
    return grouped;
  }, [pipeline.stages, searchedOpenOpportunities]);

  // Oportunidades ABERTAS cujo stage_id nao corresponde a nenhuma etapa
  // carregada (ex.: etapa arquivada depois da oportunidade ter sido
  // criada) sao omitidas do quadro -- nunca viram uma coluna "Sem etapa"
  // ficticia. Calculado sobre openOpportunities (nao a versao com busca),
  // pois e um diagnostico de integridade de dados, independente do que o
  // usuario esta buscando no momento. Encerradas nao entram nessa conta:
  // elas nao sao agrupadas por etapa (vao para a visao "Encerradas", nunca
  // omitidas por orfandade -- ver closedOpportunities/stagesById).
  // Contagem interna, so para diagnostico -- nunca renderizada.
  // eslint-disable-next-line no-unused-vars
  const orphanOpportunityCount = openOpportunities.filter(
    (opportunity) => !stagesById.has(opportunity.stage_id),
  ).length;

  // Encerradas: filtro de outcome + busca combinados localmente, seguidos
  // de ordenacao -- nenhuma nova consulta.
  const filteredClosedOpportunities = useMemo(() => {
    const byOutcome =
      outcomeFilter === 'all'
        ? closedOpportunities
        : closedOpportunities.filter((opportunity) => opportunity.outcome === outcomeFilter);
    return byOutcome.filter((opportunity) =>
      matchesOpportunitySearch(opportunity, normalizedOpportunitySearch, clientsById),
    );
  }, [closedOpportunities, outcomeFilter, normalizedOpportunitySearch, clientsById]);

  const sortedClosedOpportunities = useMemo(
    () => sortClosedOpportunities(filteredClosedOpportunities, closedSortOrder),
    [filteredClosedOpportunities, closedSortOrder],
  );

  async function handleRetry() {
    await Promise.all([pipeline.refresh(), clientsState.refresh()]);
  }

  const canOpenCreate =
    Boolean(workspaceId) &&
    pipeline.isConfigured &&
    workspaceRole.canUpdate === true &&
    !workspaceRole.isLoading &&
    !pipeline.isMutating;

  // Mesma regra para mover, editar e encerrar -- as tres acoes exigem
  // owner/admin/member, papel ja carregado e nenhuma mutacao em andamento.
  const canManageOpportunity =
    workspaceRole.canUpdate === true &&
    !workspaceRole.isLoading &&
    !pipeline.isMutating;

  async function handleMoveOpportunity(opportunity, nextStageId) {
    if (!workspaceId) return;
    if (workspaceRole.isLoading) return;
    if (workspaceRole.canUpdate !== true) return;
    if (pipeline.isMutating) return;
    if (!opportunity?.id) return;
    if (nextStageId === opportunity.stage_id) return;

    const stageExists = pipeline.stages.some((stage) => stage.id === nextStageId);
    if (!stageExists) return;

    const opportunityExists = pipeline.opportunities.some((item) => item.id === opportunity.id);
    if (!opportunityExists) return;

    setMoveError(null);
    const result = await pipeline.moveOpportunityStage(opportunity.id, nextStageId);

    if (!result || result.error) {
      setMoveError(
        getOpportunityMoveErrorMessage(
          result?.error,
          'Não foi possível mover a oportunidade. Tente novamente.',
        ),
      );
    }
  }

  function handleOpenCreate() {
    if (!workspaceId) return;
    if (!pipeline.isConfigured) return;
    if (workspaceRole.isLoading) return;
    if (workspaceRole.canUpdate !== true) return;
    if (pipeline.isMutating) return;

    // Somente um modal por vez -- abrir a criacao fecha qualquer
    // edicao/encerramento pendente.
    setEditingOpportunity(null);
    setOutcomeOpportunity(null);
    setIsCreateOpen(true);
  }

  function handleOpenEdit(opportunity) {
    if (!canManageOpportunity) return;
    if (!opportunity?.id) return;
    if (opportunity.outcome !== 'open') return;

    setIsCreateOpen(false);
    setOutcomeOpportunity(null);
    setEditingOpportunity(opportunity);
  }

  function handleOpenOutcomeConfirm(opportunity) {
    if (!canManageOpportunity) return;
    if (!opportunity?.id) return;
    if (opportunity.outcome !== 'open') return;

    setIsCreateOpen(false);
    setEditingOpportunity(null);
    setOutcomeOpportunity(opportunity);
  }

  function getCreateButtonTitle() {
    if (!workspaceId) return 'Selecione um espaço de trabalho.';
    if (!pipeline.isConfigured) return 'A conexão de dados não está configurada.';
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canUpdate !== true) return 'Você não possui permissão para criar oportunidades.';
    if (pipeline.isMutating) return 'Aguarde a operação atual terminar.';
    return 'Criar uma nova oportunidade.';
  }

  if (!isBusinessWorkspace) {
    return (
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="crm-title">
          <div className={styles.heroCopy}>
            <Badge variant="outline" dot>
              Empresarial
            </Badge>
            <h2 id="crm-title">CRM</h2>
            <p>CRM está disponível no espaço empresarial.</p>
          </div>
        </section>

        <Card variant="outline" padding="lg" className={styles.lockedCard}>
          <h3>Troque para o espaço empresarial</h3>
          <p>Este módulo conecta clientes, oportunidades, follow-ups e entradas potenciais da empresa.</p>
        </Card>
      </div>
    );
  }

  const isLoading = pipeline.isLoading || clientsState.isLoading;
  const pipelineErrorMessage = pipeline.error ? 'Não foi possível carregar o pipeline.' : null;
  const clientsErrorMessage = clientsState.error
    ? 'Não foi possível carregar os clientes do pipeline.'
    : null;
  const hasError = Boolean(pipelineErrorMessage || clientsErrorMessage);
  // Nunca mostra numeros parciais/incorretos como definitivos: sem
  // workspace, sem configuracao, carregando ou com erro, os indicadores
  // simplesmente nao renderizam (sem placeholder novo).
  const canShowMetrics = Boolean(workspaceId) && pipeline.isConfigured && !isLoading && !hasError;
  // Mesma condicao usada para os indicadores: busca/ordenacao/contador so
  // fazem sentido quando ha dados reais carregados.
  const canShowToolbar = canShowMetrics;
  const opportunityResultCount =
    view === 'open'
      ? normalizedOpportunitySearch
        ? `${searchedOpenOpportunities.length} de ${openOpportunities.length} oportunidades abertas`
        : `${openOpportunities.length} oportunidades abertas`
      : normalizedOpportunitySearch || outcomeFilter !== 'all'
        ? `${sortedClosedOpportunities.length} de ${closedOpportunities.length} oportunidades encerradas`
        : `${closedOpportunities.length} oportunidades encerradas`;

  let content;

  if (!workspaceId) {
    content = <Card padding="lg">Selecione um espaço de trabalho para visualizar o pipeline.</Card>;
  } else if (!pipeline.isConfigured) {
    content = (
      <Card padding="lg">
        O pipeline está indisponível porque a conexão de dados ainda não está configurada.
      </Card>
    );
  } else if (isLoading) {
    content = <Card padding="lg">Carregando pipeline...</Card>;
  } else if (hasError) {
    content = (
      <Card padding="lg" role="alert" className={styles.errorCard}>
        {pipelineErrorMessage ? <p>{pipelineErrorMessage}</p> : null}
        {clientsErrorMessage ? <p>{clientsErrorMessage}</p> : null}
        <Button variant="secondary" size="sm" onClick={handleRetry}>
          Tentar novamente
        </Button>
      </Card>
    );
  } else if (view === 'open') {
    content =
      pipeline.stages.length === 0 ? (
        <Card padding="lg">O pipeline ainda não possui etapas configuradas.</Card>
      ) : (
        <div className={styles.pipeline} aria-label="Pipeline de oportunidades">
          {pipeline.stages.map((stage) => {
            const stageOpportunities = opportunitiesByStageId.get(stage.id) ?? [];

            return (
              <Card key={stage.id} variant="default" padding="md" className={styles.stageCard}>
                <div className={styles.stageHeader}>
                  <strong>{stage.name}</strong>
                  <Badge variant="glass" size="sm">
                    {stageOpportunities.length}
                  </Badge>
                </div>
                <span className={styles.stageSummary}>
                  {formatCurrency(sumEstimatedValue(stageOpportunities))}
                </span>

                <div className={styles.opportunityList}>
                  {stageOpportunities.length === 0 ? (
                    <p className={styles.stageEmpty}>
                      {normalizedOpportunitySearch
                        ? 'Nenhuma oportunidade para esta busca.'
                        : 'Nenhuma oportunidade'}
                    </p>
                  ) : (
                    stageOpportunities.map((opportunity) => {
                      const clientName =
                        clientsById.get(opportunity.client_id)?.name ?? 'Cliente indisponível';

                      return (
                        <div key={opportunity.id} className={styles.opportunityCard}>
                          <strong>{opportunity.title}</strong>
                          <span className={styles.opportunityClient}>{clientName}</span>
                          <span className={styles.value}>
                            {formatCurrency(opportunity.estimated_value)}
                          </span>
                          <select
                            className={styles.stageSelect}
                            value={opportunity.stage_id}
                            aria-label={`Mover oportunidade ${opportunity.title} para outra etapa`}
                            disabled={!canManageOpportunity}
                            onChange={(event) =>
                              handleMoveOpportunity(opportunity, event.target.value)
                            }
                          >
                            {pipeline.stages.map((availableStage) => (
                              <option key={availableStage.id} value={availableStage.id}>
                                {availableStage.name}
                              </option>
                            ))}
                          </select>
                          <div className={styles.opportunityActions}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canManageOpportunity}
                              onClick={() => handleOpenEdit(opportunity)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canManageOpportunity}
                              onClick={() => handleOpenOutcomeConfirm(opportunity)}
                            >
                              Encerrar
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      );
  } else {
    // view === 'closed': somente leitura -- sem select de etapa, sem
    // Editar/Encerrar, sem reabertura. Oportunidades orfas (cliente/etapa
    // nao encontrados) NUNCA sao omitidas aqui, diferente do Kanban aberto
    // -- so trocam para os fallbacks abaixo.
    content = (
      <div className={styles.closedView}>
        <div className={styles.outcomeFilters}>
          {OUTCOME_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={outcomeFilter === filter.value ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setOutcomeFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
          <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor="crm-closed-sort">
            <span className="uf-text-primary">Ordenar por</span>
            <select
              id="crm-closed-sort"
              className={styles.sortSelect}
              value={closedSortOrder}
              onChange={(event) => setClosedSortOrder(event.target.value)}
            >
              {CLOSED_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {closedOpportunities.length === 0 ? (
          <Card padding="lg">Nenhuma oportunidade encerrada encontrada.</Card>
        ) : sortedClosedOpportunities.length === 0 ? (
          <Card padding="lg">
            {normalizedOpportunitySearch
              ? 'Nenhuma oportunidade encontrada para esta busca.'
              : 'Nenhuma oportunidade encontrada para este resultado.'}
          </Card>
        ) : (
          <div className={styles.closedList}>
            {sortedClosedOpportunities.map((opportunity) => {
              const clientName =
                clientsById.get(opportunity.client_id)?.name ?? 'Cliente indisponível';
              const stageName = stagesById.get(opportunity.stage_id)?.name ?? 'Etapa indisponível';

              return (
                <Card key={opportunity.id} variant="default" padding="md" className={styles.closedCard}>
                  <div className={styles.closedCardTop}>
                    <strong>{opportunity.title}</strong>
                    <Badge variant={OUTCOME_BADGE_VARIANTS[opportunity.outcome] ?? 'default'} size="sm">
                      {getOutcomeLabel(opportunity.outcome)}
                    </Badge>
                  </div>
                  <div className={styles.closedCardMeta}>
                    <span>{clientName}</span>
                    <span>{stageName}</span>
                    <span>{formatCurrency(opportunity.estimated_value)}</span>
                    <span>Atualizado em {formatUpdatedAt(opportunity.updated_at)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="crm-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            Empresarial
          </Badge>
          <h2 id="crm-title">Pipeline comercial</h2>
          <p>Acompanhe as oportunidades abertas em cada etapa da negociação.</p>
        </div>

        <div className={styles.actions}>
          <Button disabled={!canOpenCreate} title={getCreateButtonTitle()} onClick={handleOpenCreate}>
            Nova oportunidade
          </Button>
          <Button variant="secondary" disabled title="Disponível em breve.">
            Perguntar à Uni
          </Button>
        </div>
      </section>

      {canShowMetrics ? (
        <section className={styles.metricsSection} aria-label="Indicadores gerenciais do CRM">
          <div className={styles.metricsGrid}>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Oportunidades abertas</span>
              <strong className={styles.metricValue}>{metrics.openCount}</strong>
            </Card>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Valor em negociação</span>
              <strong className={styles.metricValue}>{formatCurrency(metrics.openValue)}</strong>
            </Card>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Oportunidades ganhas</span>
              <strong className={styles.metricValue}>{metrics.wonCount}</strong>
            </Card>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Taxa de conversão</span>
              <strong className={styles.metricValue}>{formatConversionRate(metrics.conversionRate)}</strong>
            </Card>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Ticket médio ganho</span>
              <strong className={styles.metricValue}>{formatCurrency(metrics.averageWonTicket)}</strong>
            </Card>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Valor ganho</span>
              <strong className={styles.metricValue}>{formatCurrency(metrics.wonValue)}</strong>
            </Card>
            <Card padding="sm" className={styles.metricCard}>
              <span className={styles.metricLabel}>Valor perdido</span>
              <strong className={styles.metricValue}>{formatCurrency(metrics.lostValue)}</strong>
            </Card>
          </div>
        </section>
      ) : null}

      <section className={styles.pipelineSection} aria-labelledby="crm-pipeline-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="crm-pipeline-title">Pipeline</h3>
            <p>Etapas e oportunidades reais deste workspace.</p>
          </div>
        </div>

        <div className="uf-flex uf-items-center uf-gap-sm">
          <Button
            variant={view === 'open' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('open')}
          >
            Pipeline aberto
          </Button>
          <Button
            variant={view === 'closed' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('closed')}
          >
            Encerradas
          </Button>
        </div>

        {canShowToolbar ? (
          <div className={styles.toolbar}>
            <Input
              id="crm-opportunity-search"
              type="search"
              label="Buscar oportunidades"
              placeholder="Título ou cliente"
              value={opportunitySearch}
              onChange={(event) => setOpportunitySearch(event.target.value)}
            />
            <span className={styles.resultCount}>{opportunityResultCount}</span>
          </div>
        ) : null}

        {moveError ? (
          <p className={styles.moveError} role="alert">
            {moveError}
          </p>
        ) : null}

        {content}
      </section>

      {isCreateOpen ? (
        <OpportunityFormModal
          key={`create-opportunity-${workspaceId}`}
          open
          pipeline={pipeline}
          clientsState={clientsState}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}

      {editingOpportunity ? (
        <OpportunityFormModal
          key={`edit-opportunity-${editingOpportunity.id}`}
          open
          mode="edit"
          opportunity={editingOpportunity}
          pipeline={pipeline}
          clientsState={clientsState}
          onClose={() => setEditingOpportunity(null)}
        />
      ) : null}

      {outcomeOpportunity ? (
        <OpportunityOutcomeConfirmModal
          key={`outcome-opportunity-${outcomeOpportunity.id}`}
          opportunity={outcomeOpportunity}
          pipeline={pipeline}
          onClose={() => setOutcomeOpportunity(null)}
        />
      ) : null}
    </div>
  );
}

export default CRMPage;
