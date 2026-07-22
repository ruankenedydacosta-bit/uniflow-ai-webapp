import { useMemo, useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import { useClients, useWorkspaceRole } from '../hooks';
import { formatCurrency, formatDate } from '../utils/formatters';
import { normalizeSearchText } from '../utils/searchText.js';
import ClientDeleteConfirmModal from './clientes/ClientDeleteConfirmModal.jsx';
import ClientFormModal from './clientes/ClientFormModal.jsx';
import { getClientErrorMessage } from './clientes/clientFormUtils.js';
import { getLifecycleStageLabel, getLifecycleStageVariant } from './clientes/clientUiUtils.js';
import styles from './ClientesPage.module.css';

const CLIENT_SORT_OPTIONS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'name', label: 'Nome A–Z' },
  { value: 'value', label: 'Maior valor estimado' },
];

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

function matchesClientSearch(client, normalizedQuery) {
  if (!normalizedQuery) return true;
  return [client.name, client.primary_contact_name, client.email, client.phone, client.document_number].some(
    (field) => normalizeSearchText(field).includes(normalizedQuery),
  );
}

function sortClients(clients, sortOrder) {
  const sorted = [...clients];

  if (sortOrder === 'name') {
    sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));
  } else if (sortOrder === 'value') {
    sorted.sort((a, b) => toSafeNumber(b.estimated_value) - toSafeNumber(a.estimated_value));
  } else {
    sorted.sort((a, b) => toSafeTimestamp(b.created_at) - toSafeTimestamp(a.created_at));
  }

  return sorted;
}

function ClientesPage() {
  const { access } = useAccess();
  const { user, workspace } = useSession();
  const isBusinessWorkspace = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS;
  const clientState = useClients({ workspaceId: workspace?.id });
  const { clients, activeClients, isLoading, error } = clientState;
  const workspaceRole = useWorkspaceRole({
    workspaceId: workspace?.id,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });
  const archivedClients = useMemo(
    () => clients.filter((client) => client.is_archived === true),
    [clients],
  );

  const [view, setView] = useState('active');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [pendingArchiveId, setPendingArchiveId] = useState(null);
  const [pendingDeleteClient, setPendingDeleteClient] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('recent');

  const isBusy = clientState.isMutating;
  const visibleClients = view === 'active' ? activeClients : archivedClients;

  // Mesmo padrao de CRMPage.jsx (canOpenCreate/getCreateButtonTitle) --
  // nao depende so da RLS para bloquear a UX: viewer nunca deve ver o
  // botao habilitado, mesmo que o clique acabasse sendo negado pelo banco.
  const canOpenCreate = workspaceRole.canUpdate === true && !workspaceRole.isLoading && !isBusy;

  function getCreateButtonTitle() {
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canUpdate !== true) return 'Você não possui permissão para criar clientes.';
    if (isBusy) return 'Aguarde a operação atual terminar.';
    return 'Criar um novo cliente.';
  }

  // Busca aplicada DEPOIS da separacao ativos/arquivados -- nunca mistura
  // os dois grupos. Ordenacao aplicada por cima do resultado da busca.
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const searchedClients = useMemo(
    () => visibleClients.filter((client) => matchesClientSearch(client, normalizedSearchQuery)),
    [visibleClients, normalizedSearchQuery],
  );
  const sortedClients = useMemo(
    () => sortClients(searchedClients, sortOrder),
    [searchedClients, sortOrder],
  );

  function handleOpenCreate() {
    if (!canOpenCreate) return;

    clientState.clearError();
    setActionError(null);
    setEditingClient(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(client) {
    // Segunda camada de defesa: nunca abre o formulário de edição sem
    // permissão real, mesmo que o botão "Editar" seja acionado por algum
    // caminho que não passe pelo atributo `disabled` (ex.: automação/teste).
    if (!workspaceRole.canUpdate || clientState.isMutating) return;

    clientState.clearError();
    setActionError(null);
    setEditingClient(client);
    setIsFormOpen(true);
  }

  function handleCloseForm() {
    setIsFormOpen(false);
    setEditingClient(null);
  }

  function handleChangeView(nextView) {
    setActionError(null);
    setPendingArchiveId(null);
    setView(nextView);
  }

  function handleRequestArchive(clientId) {
    setActionError(null);
    setPendingArchiveId(clientId);
  }

  function handleCancelArchive() {
    setPendingArchiveId(null);
  }

  async function handleConfirmArchive(clientId) {
    if (isBusy) return;
    setActionError(null);

    const result = await clientState.archiveClient(clientId);

    if (result && !result.error) {
      setPendingArchiveId(null);
      return;
    }

    setActionError(
      result?.error ?? {
        code: 'UNKNOWN_ARCHIVE_FAILURE',
        message: 'Não foi possível arquivar o cliente. Tente novamente.',
      },
    );
    // Mantém o card em estado de confirmação para o usuário tentar de novo
    // sem precisar clicar em "Arquivar" outra vez.
  }

  async function handleUnarchive(clientId) {
    if (isBusy) return;
    setActionError(null);

    const result = await clientState.unarchiveClient(clientId);

    if (!result || result.error) {
      setActionError(
        result?.error ?? {
          code: 'UNKNOWN_UNARCHIVE_FAILURE',
          message: 'Não foi possível restaurar o cliente. Tente novamente.',
        },
      );
    }
  }

  function handleRequestDelete(client) {
    setActionError(null);
    setPendingDeleteClient(client);
  }

  function handleCloseDelete() {
    setPendingDeleteClient(null);
  }

  const actionErrorMessage = actionError
    ? getClientErrorMessage(actionError, 'Não foi possível concluir a ação. Tente novamente.')
    : null;
  const roleErrorMessage = workspaceRole.error
    ? 'Não foi possível confirmar suas permissões neste espaço.'
    : null;

  if (!isBusinessWorkspace) {
    return (
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="clientes-title">
          <div className={styles.heroCopy}>
            <Badge variant="outline" dot>
              Empresarial
            </Badge>
            <h2 id="clientes-title">Clientes</h2>
            <p>Clientes está disponível no espaço empresarial.</p>
          </div>
        </section>

        <Card variant="outline" padding="lg" className={styles.lockedCard}>
          <h3>Troque para o espaço empresarial</h3>
          <p>Este módulo organiza relacionamento, cobranças e oportunidades da empresa sem misturar dados pessoais.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="clientes-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            Empresarial
          </Badge>
          <h2 id="clientes-title">Clientes</h2>
          <p>Acompanhe o relacionamento com os clientes deste espaço.</p>
        </div>

        <div className={styles.actions}>
          <Button disabled={!canOpenCreate} title={getCreateButtonTitle()} onClick={handleOpenCreate}>
            Novo cliente
          </Button>
          <Button variant="secondary" disabled title="Disponível em breve.">
            Perguntar à Uni
          </Button>
        </div>
      </section>

      <section className={styles.clientsSection} aria-labelledby="clientes-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="clientes-list-title">Relacionamentos em acompanhamento</h3>
            <p>Clientes deste workspace, com estágio, valor associado e último contato.</p>
          </div>
        </div>

        <div className="uf-flex uf-items-center uf-gap-sm">
          <Button
            variant={view === 'active' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleChangeView('active')}
          >
            Ativos
          </Button>
          <Button
            variant={view === 'archived' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleChangeView('archived')}
          >
            Arquivados
          </Button>
        </div>

        {actionErrorMessage ? (
          <Card padding="md" role="alert">{actionErrorMessage}</Card>
        ) : null}
        {roleErrorMessage ? (
          <Card padding="md" role="alert">{roleErrorMessage}</Card>
        ) : null}

        {!isLoading && !error && visibleClients.length > 0 ? (
          <div className={styles.toolbar}>
            <Input
              id="clientes-search"
              type="search"
              label="Buscar clientes"
              placeholder="Nome, contato, e-mail, telefone ou documento"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor="clientes-sort">
              <span className="uf-text-primary">Ordenar por</span>
              <select
                id="clientes-sort"
                className={styles.sortSelect}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                {CLIENT_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <span className={styles.resultCount}>
              {normalizedSearchQuery
                ? `${sortedClients.length} de ${visibleClients.length} clientes`
                : `${visibleClients.length} clientes`}
            </span>
          </div>
        ) : null}

        {isLoading ? (
          <Card padding="lg">Carregando clientes...</Card>
        ) : error ? (
          <Card padding="lg" role="alert">Não foi possível carregar os clientes agora.</Card>
        ) : !visibleClients.length ? (
          <Card padding="lg">
            {view === 'active' ? 'Nenhum cliente ativo cadastrado ainda.' : 'Nenhum cliente arquivado.'}
          </Card>
        ) : !sortedClients.length ? (
          <Card padding="lg">Nenhum cliente encontrado para esta busca.</Card>
        ) : (
          <div className={styles.clientGrid}>
            {sortedClients.map((client) => (
              <Card key={client.id} variant="default" padding="md" className={styles.clientCard}>
                <div className={styles.clientTop}>
                  <div>
                    <strong>{client.name}</strong>
                  </div>
                  <Badge variant={getLifecycleStageVariant(client.lifecycle_stage)} size="sm">
                    {getLifecycleStageLabel(client.lifecycle_stage)}
                  </Badge>
                </div>

                <div className={styles.clientMeta}>
                  <div>
                    <span>Valor associado</span>
                    <strong>{formatCurrency(client.estimated_value)}</strong>
                  </div>
                  <div>
                    <span>Último contato</span>
                    <strong>{client.last_contact_at ? formatDate(client.last_contact_at) : 'Sem registro'}</strong>
                  </div>
                </div>

                {client.next_action ? <p>{client.next_action}</p> : null}

                {view === 'active' ? (
                  <div className="uf-flex uf-items-center uf-gap-sm uf-flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBusy || workspaceRole.isLoading || !workspaceRole.canUpdate}
                      aria-label={`Editar ${client.name}`}
                      onClick={() => handleOpenEdit(client)}
                    >
                      Editar
                    </Button>

                    {pendingArchiveId === client.id ? (
                      <>
                        <span className="uf-text-caption">Arquivar {client.name}?</span>
                        <Button variant="ghost" size="sm" disabled={isBusy} onClick={handleCancelArchive}>
                          Cancelar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={isBusy}
                          disabled={!workspaceRole.canUpdate || workspaceRole.isLoading}
                          onClick={() => handleConfirmArchive(client.id)}
                        >
                          Confirmar arquivamento
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy || !workspaceRole.canUpdate || workspaceRole.isLoading}
                        aria-label={`Arquivar ${client.name}`}
                        onClick={() => handleRequestArchive(client.id)}
                      >
                        Arquivar
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="uf-flex uf-items-center uf-gap-sm uf-flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBusy || !workspaceRole.canUpdate || workspaceRole.isLoading}
                      aria-label={`Desarquivar ${client.name}`}
                      onClick={() => handleUnarchive(client.id)}
                    >
                      Desarquivar
                    </Button>

                    {!workspaceRole.isLoading && workspaceRole.canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        aria-label={`Excluir ${client.name}`}
                        onClick={() => handleRequestDelete(client)}
                      >
                        Excluir definitivamente
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {isFormOpen ? (
        <ClientFormModal
          key={editingClient?.id ?? 'new'}
          open={isFormOpen}
          onClose={handleCloseForm}
          client={editingClient}
          clientState={clientState}
        />
      ) : null}

      {pendingDeleteClient ? (
        <ClientDeleteConfirmModal
          key={pendingDeleteClient.id}
          client={pendingDeleteClient}
          clientState={clientState}
          onClose={handleCloseDelete}
        />
      ) : null}
    </div>
  );
}

export default ClientesPage;
