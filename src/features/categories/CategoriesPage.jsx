import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import { useCategories, useWorkspaceRole } from '../../hooks';
import { financialCrudMock } from '../../pages/financeiro/financialCrud.mock';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import {
  CATEGORY_TYPES,
  buildUniNavigationState,
  canManageCategory,
  filterCategoriesBySearch,
  getCategoryErrorMessage,
  getUniButtonLabel,
  shouldShowSearch,
  splitCategoriesByType,
} from './categoryUtils.js';
import {
  CategoryIcon,
  ClearIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
} from './categoryIcons.jsx';
import CategoryCreateModal from './components/CategoryCreateModal.jsx';
import CategoryDeleteConfirmModal from './components/CategoryDeleteConfirmModal.jsx';
import styles from './CategoriesPage.module.css';

const TYPE_TABS = [
  { type: CATEGORY_TYPES.EXPENSE, label: 'Saídas' },
  { type: CATEGORY_TYPES.INCOME, label: 'Entradas' },
];

export default function CategoriesPage() {
  const navigate = useNavigate();
  const { access } = useAccess();
  const { user, workspace } = useSession();

  const financialFallback = access.currentWorkspace === 'personal'
    ? financialCrudMock.personal
    : financialCrudMock.business;

  const categoryState = useCategories({
    workspaceId: workspace?.id,
    fallbackCategories: financialFallback.categories,
    context: access.currentWorkspace,
  });

  const workspaceRole = useWorkspaceRole({
    workspaceId: workspace?.id,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });
  // Mesma regra de criacao usada em FinanceiroPage.jsx (owner/admin/member,
  // conjunto de papeis da policy categories_insert_active_contributor) --
  // bloqueia a UX antes do clique chegar ao banco, nao depende so da RLS.
  const canManage =
    workspaceRole.canUpdate === true && !workspaceRole.isLoading && !categoryState.isMutating;

  function getManageCategoriesTitle() {
    if (!workspace?.id) return 'Selecione um espaço de trabalho.';
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canUpdate !== true) {
      return 'Você não tem permissão para criar categorias neste workspace.';
    }
    if (categoryState.isMutating) return 'Aguarde a operação atual terminar.';
    return 'Criar uma nova categoria.';
  }

  const isBusiness = access.currentWorkspace === 'business';
  const pageSubtitle = isBusiness
    ? 'Organize as entradas e saídas da sua empresa.'
    : 'Organize os gastos e entradas do seu dia a dia.';
  const emptyStateTitle = isBusiness
    ? 'Ainda não há categorias da empresa aqui.'
    : 'Ainda não há categorias aqui.';

  const [activeType, setActiveType] = useState(CATEGORY_TYPES.EXPENSE);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Cópia da categoria no momento do clique: a lista muda de referência a
  // cada mutação e o formulário não pode resetar no meio da edição.
  const [editingCategory, setEditingCategory] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);

  const buckets = useMemo(
    () => splitCategoriesByType(categoryState.categories),
    [categoryState.categories],
  );
  const typeList = useMemo(() => buckets[activeType] ?? [], [buckets, activeType]);
  const showSearch = shouldShowSearch(typeList.length);
  const visibleCategories = useMemo(
    () => (showSearch ? filterCategoriesBySearch(typeList, search) : typeList),
    [typeList, search, showSearch],
  );

  const selectedCategory = typeList.find((category) => category.id === selectedId) ?? null;
  // A barra só vale para o bloco à vista: busca que esconde o bloco ou
  // grade em carregamento tiram Editar/Excluir da tela.
  const isSelectedVisible = visibleCategories.some((category) => category.id === selectedId);
  const canManageSelected =
    !workspaceRole.isLoading
    && !categoryState.isLoading
    && isSelectedVisible
    && canManageCategory(selectedCategory, {
      canUpdate: workspaceRole.canUpdate,
      canDelete: workspaceRole.canDelete,
      userId: user?.id,
    });

  function handleChangeType(type) {
    if (type === activeType) return;
    setActiveType(type);
    setSearch('');
    setSelectedId(null);
  }

  function handleSelect(category) {
    setSelectedId((current) => (current === category.id ? null : category.id));
  }

  function handleOpenUni() {
    const suggested = selectedCategory?.name ?? null;
    navigate('/uni-ai', { state: buildUniNavigationState(activeType, suggested) });
  }

  function handleOpenCreate() {
    if (!canManage) return;
    setCreateOpen(true);
  }

  function handleOpenEdit() {
    if (!canManageSelected || categoryState.isMutating) return;
    categoryState.clearError?.();
    setEditingCategory({ ...selectedCategory });
  }

  function handleOpenDelete() {
    if (!canManageSelected || categoryState.isMutating) return;
    categoryState.clearError?.();
    setDeletingCategory({ ...selectedCategory });
  }

  function handleCloseForm() {
    categoryState.clearError?.();
    setCreateOpen(false);
    setEditingCategory(null);
  }

  async function handleEdit(values) {
    if (!editingCategory) return;
    const result = await categoryState.saveCategory(values, editingCategory.id);
    if (!result.error) {
      notifyFinancialDataChanged('categorias');
      setEditingCategory(null);
    }
  }

  async function handleDelete() {
    if (!deletingCategory) return;
    const result = await categoryState.removeCategory(deletingCategory.id);
    if (!result.error) {
      notifyFinancialDataChanged('categorias');
      setDeletingCategory(null);
      setSelectedId(null);
    }
  }

  async function handleCreate(values) {
    if (!canManage) return;
    const result = await categoryState.saveCategory(values);
    if (!result.error) {
      await categoryState.refresh?.();
      notifyFinancialDataChanged('categorias');
      setCreateOpen(false);
      if (values.category_type !== activeType) {
        setActiveType(values.category_type);
      }
    }
  }

  const isLoading = categoryState.isLoading;
  const hasError = Boolean(categoryState.error) && !categoryState.isDemoMode && typeList.length === 0;
  const isEmpty = !isLoading && !hasError && typeList.length === 0;
  const noResults = !isLoading && !hasError && !isEmpty && visibleCategories.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Categorias</h1>
        <p className={styles.subtitle}>{pageSubtitle}</p>
      </header>

      {/* 2. Seletor Despesas / Receitas */}
      <div className={styles.segmented} role="tablist" aria-label="Tipo de categoria">
        {TYPE_TABS.map((tab) => {
          const isActive = tab.type === activeType;
          return (
            <button
              key={tab.type}
              type="button"
              role="tab"
              id={`tab-${tab.type}`}
              aria-selected={isActive}
              aria-controls="category-grid-panel"
              className={isActive ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
              onClick={() => handleChangeType(tab.type)}
            >
              <span className={styles.segmentIcon}>
                <CategoryIcon category={{ category_type: tab.type }} />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Uni — ação rápida */}
      <div className={styles.uniCard}>
        <button type="button" className={styles.uniButton} onClick={handleOpenUni}>
          <span className={styles.uniIcon}>
            <SparkIcon />
          </span>
          {getUniButtonLabel(activeType)}
        </button>
        <p className={styles.uniHelper}>Fale ou escreva. A Uni ajuda a escolher a categoria.</p>
      </div>

      {/* 3. Busca */}
      {showSearch ? (
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar categoria"
            aria-label="Buscar categoria"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <button
              type="button"
              className={styles.clearButton}
              aria-label="Limpar busca"
              onClick={() => setSearch('')}
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 5. Todas as categorias */}
      <section
        id="category-grid-panel"
        role="tabpanel"
        aria-labelledby={`tab-${activeType}`}
      >
        <h2 className={styles.sectionTitle}>Todas as categorias</h2>

        {isLoading ? (
          <div className={styles.skeletonGrid} aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className={styles.skeletonTile} />
            ))}
          </div>
        ) : hasError ? (
          <div className={styles.stateBox} role="alert">
            <p className={styles.stateTitle}>Não foi possível carregar as categorias.</p>
            <button type="button" className={styles.uniButton} onClick={() => categoryState.refresh?.()}>
              Tentar novamente
            </button>
          </div>
        ) : isEmpty ? (
          <div className={styles.stateBox}>
            <p className={styles.stateTitle}>{emptyStateTitle}</p>
            <button
              type="button"
              className={styles.uniButton}
              onClick={handleOpenCreate}
              disabled={!canManage}
              title={getManageCategoriesTitle()}
            >
              Criar primeira categoria
            </button>
          </div>
        ) : noResults ? (
          <div className={styles.stateBox} role="status" aria-live="polite">
            <p className={styles.stateTitle}>Nenhuma categoria encontrada.</p>
            <p className={styles.stateText}>Tente outro nome ou crie uma nova categoria.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleCategories.map((category) => {
              const isSelected = category.id === selectedId;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={isSelected ? `${styles.tile} ${styles.tileSelected}` : styles.tile}
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(category)}
                >
                  {isSelected ? (
                    <span className={styles.tileCheck} aria-hidden="true">✓</span>
                  ) : null}
                  <span className={styles.tileIcon}>
                    <CategoryIcon category={category} />
                  </span>
                  <span className={styles.tileLabel}>{category.name}</span>
                </button>
              );
            })}

            {/* 6. Nova categoria */}
            <button
              type="button"
              className={`${styles.tile} ${styles.newTile}`}
              onClick={handleOpenCreate}
              disabled={!canManage}
              title={getManageCategoriesTitle()}
            >
              <span className={styles.tileIcon}>
                <PlusIcon />
              </span>
              <span className={styles.tileLabel}>Nova categoria</span>
            </button>
          </div>
        )}

        {canManageSelected ? (
          <div className={styles.selectionActions} aria-label={`Ações de ${selectedCategory.name}`} role="group">
            <button
              type="button"
              className={styles.selectionButton}
              onClick={handleOpenEdit}
              disabled={categoryState.isMutating}
            >
              Editar
            </button>
            <button
              type="button"
              className={`${styles.selectionButton} ${styles.selectionButtonDanger}`}
              onClick={handleOpenDelete}
              disabled={categoryState.isMutating}
            >
              Excluir
            </button>
          </div>
        ) : null}
      </section>

      <CategoryCreateModal
        open={createOpen || Boolean(editingCategory)}
        onClose={handleCloseForm}
        defaultType={activeType}
        categories={categoryState.categories}
        category={editingCategory}
        onCreate={editingCategory ? handleEdit : handleCreate}
        isMutating={categoryState.isMutating}
        serverError={
          createOpen || editingCategory
            ? getCategoryErrorMessage(
                categoryState.error,
                'Não foi possível salvar a categoria. Tente novamente.',
              )
            : ''
        }
      />

      {deletingCategory ? (
        <CategoryDeleteConfirmModal
          category={deletingCategory}
          isMutating={categoryState.isMutating}
          serverError={getCategoryErrorMessage(
            categoryState.error,
            'Não foi possível excluir a categoria. Tente novamente.',
          )}
          onConfirm={handleDelete}
          onClose={() => {
            categoryState.clearError?.();
            setDeletingCategory(null);
          }}
        />
      ) : null}
    </div>
  );
}
