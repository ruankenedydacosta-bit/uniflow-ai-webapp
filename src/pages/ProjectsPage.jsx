import { useMemo, useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useClients, useWorkspaceRole } from '../hooks';
import { useProjects } from '../hooks/useProjects.js';
import { formatCurrency } from '../utils/formatters';
import ProjectDeleteConfirmModal from './projetos/ProjectDeleteConfirmModal.jsx';
import ProjectFormModal from './projetos/ProjectFormModal.jsx';
import {
  PROJECT_PRIORITY_BADGE_VARIANTS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_BADGE_VARIANTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_OPTIONS,
  formatProjectDate,
} from './projetos/projectFormUtils.js';
import styles from './ProjectsPage.module.css';

const STATUS_FILTERS = [{ value: 'all', label: 'Todos' }, ...PROJECT_STATUS_OPTIONS];
const PRIORITY_FILTERS = [{ value: 'all', label: 'Todas' }, ...PROJECT_PRIORITY_OPTIONS];

function normalizeSearchTerm(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function ProjectsPage() {
  const { access } = useAccess();
  const { user, workspace } = useSession();
  const isBusinessWorkspace = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS;
  const workspaceId = workspace?.id;

  const projectsState = useProjects({ workspaceId });
  const clientsState = useClients({ workspaceId });
  const workspaceRole = useWorkspaceRole({
    workspaceId,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deletingProject, setDeletingProject] = useState(null);

  const clientsById = useMemo(
    () => new Map(clientsState.clients.map((client) => [client.id, client])),
    [clientsState.clients],
  );

  const filteredProjects = useMemo(() => {
    const term = normalizeSearchTerm(search);

    return projectsState.projects.filter((project) => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && project.priority !== priorityFilter) return false;

      if (!term) return true;

      const clientName = project.client_id ? clientsById.get(project.client_id)?.name ?? '' : '';
      const haystack = normalizeSearchTerm(`${project.name} ${clientName}`);
      return haystack.includes(term);
    });
  }, [projectsState.projects, statusFilter, priorityFilter, search, clientsById]);

  const isLoading = projectsState.isLoading || clientsState.isLoading;
  const projectsErrorMessage = projectsState.error ? 'Não foi possível carregar os projetos.' : null;
  const clientsErrorMessage = clientsState.error
    ? 'Não foi possível carregar os clientes vinculados.'
    : null;
  const hasError = Boolean(projectsErrorMessage || clientsErrorMessage);
  const hasNoProjectsAtAll = !isLoading && !hasError && projectsState.projects.length === 0;
  const hasNoFilterResults =
    !isLoading && !hasError && !hasNoProjectsAtAll && filteredProjects.length === 0;
  const isAnyProjectMutating = projectsState.isMutating;

  async function handleRetry() {
    await Promise.all([projectsState.refresh(), clientsState.refresh()]);
  }

  // Regra unica de criacao/edicao: owner/admin/member, mesmo conjunto de
  // papeis da policy projects_insert_active_contributor/
  // projects_update_active_contributor (migration 20260723_018_projects.sql).
  // Nao depende so da RLS: bloqueia a UX antes do clique chegar ao banco,
  // mesmo padrao ja usado em Financeiro/Agenda/Categorias.
  const canManage =
    isBusinessWorkspace &&
    Boolean(workspaceId) &&
    workspaceRole.canUpdate === true &&
    !workspaceRole.isLoading &&
    !isAnyProjectMutating;

  // Exclusao: RLS libera somente owner/admin (projects_delete_owner_or_admin,
  // sem excecao de criador -- diferente de categories/clients).
  const canDelete =
    isBusinessWorkspace &&
    Boolean(workspaceId) &&
    workspaceRole.canDelete === true &&
    !workspaceRole.isLoading &&
    !isAnyProjectMutating;

  function getManageTitle() {
    if (!isBusinessWorkspace) return 'Projetos está disponível no espaço empresarial.';
    if (!workspaceId) return 'Selecione um espaço de trabalho.';
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canUpdate !== true) return 'Você não possui permissão para gerenciar projetos.';
    if (isAnyProjectMutating) return 'Aguarde a operação atual terminar.';
    return 'Gerenciar projetos deste espaço.';
  }

  function getDeleteTitle() {
    if (!isBusinessWorkspace) return 'Projetos está disponível no espaço empresarial.';
    if (!workspaceId) return 'Selecione um espaço de trabalho.';
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canDelete !== true) return 'Você não possui permissão para excluir projetos.';
    if (isAnyProjectMutating) return 'Aguarde a operação atual terminar.';
    return 'Excluir este projeto.';
  }

  function handleCreate() {
    if (!canManage) return;
    setDeletingProject(null);
    setEditingProject(null);
    setIsFormOpen(true);
  }

  function handleEdit(project) {
    if (!canManage) return;
    setDeletingProject(null);
    setEditingProject(project);
    setIsFormOpen(true);
  }

  function handleCloseForm() {
    if (isAnyProjectMutating) return;
    setIsFormOpen(false);
    setEditingProject(null);
    projectsState.clearError();
  }

  async function handleSave(payload) {
    if (!canManage) return { data: null, error: null };

    const result = editingProject
      ? await projectsState.saveProject(payload, editingProject.id)
      : await projectsState.saveProject(payload);

    if (result && !result.error) {
      setIsFormOpen(false);
      setEditingProject(null);
    }

    return result;
  }

  function handleDeleteRequest(project) {
    if (!canDelete) return;
    setIsFormOpen(false);
    setEditingProject(null);
    setDeletingProject(project);
  }

  function handleCloseDelete() {
    if (isAnyProjectMutating) return;
    setDeletingProject(null);
    projectsState.clearError();
  }

  async function handleDeleteConfirm() {
    if (!canDelete || !deletingProject) return;

    const result = await projectsState.removeProject(deletingProject.id);

    if (result && !result.error) {
      setDeletingProject(null);
    }

    return result;
  }

  if (!isBusinessWorkspace) {
    return (
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="projetos-title">
          <div className={styles.heroCopy}>
            <Badge variant="outline" dot>
              Empresarial
            </Badge>
            <h2 id="projetos-title">Projetos</h2>
            <p>Projetos está disponível no espaço empresarial.</p>
          </div>
        </section>

        <Card variant="outline" padding="lg" className={styles.lockedCard}>
          <h3>Troque para o espaço empresarial</h3>
          <p>Este módulo conecta clientes, entregas, prazos, marcos e impacto financeiro sem misturar dados pessoais.</p>
        </Card>
      </div>
    );
  }

  let content;

  if (isLoading) {
    content = (
      <div className={styles.projectGrid} aria-hidden="true">
        {[0, 1].map((index) => (
          <Card key={index} variant="default" padding="md" className={styles.skeletonCard} />
        ))}
      </div>
    );
  } else if (hasError) {
    content = (
      <Card padding="lg" role="alert" className={styles.errorCard}>
        {projectsErrorMessage ? <p>{projectsErrorMessage}</p> : null}
        {clientsErrorMessage ? <p>{clientsErrorMessage}</p> : null}
        <Button variant="secondary" size="sm" onClick={handleRetry}>
          Tentar novamente
        </Button>
      </Card>
    );
  } else if (hasNoProjectsAtAll) {
    content = (
      <Card padding="lg" className={styles.emptyCard}>
        <p>Nenhum projeto cadastrado neste espaço ainda.</p>
        <Button disabled={!canManage} title={getManageTitle()} onClick={handleCreate}>
          Criar primeiro projeto
        </Button>
      </Card>
    );
  } else if (hasNoFilterResults) {
    content = (
      <Card padding="lg" role="status" className={styles.emptyCard}>
        <p>Nenhum projeto encontrado para os filtros selecionados.</p>
      </Card>
    );
  } else {
    content = (
      <div className={styles.projectGrid}>
        {filteredProjects.map((project) => {
          const client = project.client_id ? clientsById.get(project.client_id) : null;

          return (
            <Card key={project.id} variant="default" padding="md" className={styles.projectCard}>
              <div className={styles.projectTop}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{client ? client.name : 'Sem cliente vinculado'}</span>
                </div>
                <Badge variant={PROJECT_STATUS_BADGE_VARIANTS[project.status] ?? 'default'} size="sm">
                  {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                </Badge>
              </div>

              {project.description ? <p className={styles.projectDescription}>{project.description}</p> : null}

              <div
                className={styles.progressBlock}
                aria-label={`Progresso de ${project.progress}% em ${project.name}`}
              >
                <div className={styles.progressMeta}>
                  <span>Progresso</span>
                  <strong>{project.progress}%</strong>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                  <span style={{ width: `${project.progress}%` }} />
                </div>
              </div>

              <div className={styles.projectMeta}>
                <div>
                  <span>Início</span>
                  <strong>{project.starts_at ? formatProjectDate(project.starts_at) : '—'}</strong>
                </div>
                <div>
                  <span>Prazo</span>
                  <strong>{project.due_at ? formatProjectDate(project.due_at) : '—'}</strong>
                </div>
                <div>
                  <span>Impacto</span>
                  <strong>
                    {project.financial_impact !== null && project.financial_impact !== undefined
                      ? formatCurrency(project.financial_impact)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>Prioridade</span>
                  <Badge variant={PROJECT_PRIORITY_BADGE_VARIANTS[project.priority] ?? 'default'} size="sm">
                    {PROJECT_PRIORITY_LABELS[project.priority] ?? project.priority}
                  </Badge>
                </div>
              </div>

              {project.next_milestone ? (
                <div className={styles.projectFooter}>
                  <p>{project.next_milestone}</p>
                </div>
              ) : null}

              <div className={styles.projectActions}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canManage}
                  title={getManageTitle()}
                  aria-label={`Editar ${project.name}`}
                  onClick={() => handleEdit(project)}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!canDelete}
                  title={getDeleteTitle()}
                  aria-label={`Excluir ${project.name}`}
                  onClick={() => handleDeleteRequest(project)}
                >
                  Excluir
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="projetos-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            Espaço empresarial
          </Badge>
          <h2 id="projetos-title">Projetos</h2>
          <p>Acompanhe entregas, prazos e próximos marcos conectados aos clientes.</p>
        </div>

        <div className={styles.actions}>
          <Button disabled={!canManage} title={getManageTitle()} onClick={handleCreate}>
            Novo projeto
          </Button>
          <Button variant="secondary" disabled title="Disponível em breve.">
            Perguntar à Uni
          </Button>
        </div>
      </section>

      <section className={styles.projectsSection} aria-labelledby="projetos-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="projetos-list-title">Projetos em rota</h3>
            <p>Entregas conectadas a clientes, marcos e impacto financeiro.</p>
          </div>
        </div>

        {!isLoading && !hasError ? (
          <div className={styles.filters}>
            <label className={styles.searchField} htmlFor="projects-search">
              <span className="uf-text-primary">Buscar</span>
              <input
                id="projects-search"
                type="text"
                className={styles.filterSelect}
                placeholder="Nome do projeto ou cliente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className={styles.filterField} htmlFor="projects-status-filter">
              <span className="uf-text-primary">Status</span>
              <select
                id="projects-status-filter"
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.filterField} htmlFor="projects-priority-filter">
              <span className="uf-text-primary">Prioridade</span>
              <select
                id="projects-priority-filter"
                className={styles.filterSelect}
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                {PRIORITY_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <span className={styles.resultCount}>
              {filteredProjects.length} {filteredProjects.length === 1 ? 'projeto' : 'projetos'}
            </span>
          </div>
        ) : null}

        {content}
      </section>

      {isFormOpen ? (
        <ProjectFormModal
          key={editingProject ? `edit-project-${editingProject.id}` : `create-project-${workspaceId}`}
          isOpen
          project={editingProject}
          clients={clientsState.activeClients}
          isSubmitting={projectsState.isMutating}
          error={projectsState.error}
          onClose={handleCloseForm}
          onSubmit={handleSave}
        />
      ) : null}

      {deletingProject ? (
        <ProjectDeleteConfirmModal
          key={`delete-project-${deletingProject.id}`}
          isOpen
          project={deletingProject}
          isDeleting={projectsState.isMutating}
          error={projectsState.error}
          onClose={handleCloseDelete}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </div>
  );
}

export default ProjectsPage;
