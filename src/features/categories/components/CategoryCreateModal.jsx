import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import OutlineButton from '../../../components/ui/OutlineButton';
import Segmented from '../../../components/ui/Segmented';
import { cx } from '../../../utils/cx.js';
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIconSections,
  getDefaultCategoryIconKey,
  resolveCategoryIconKey,
  sugerirIconesCategoria,
} from '../categoryIconCatalog.js';
import { CategoryIcon } from '../categoryIcons.jsx';
import { CATEGORY_TYPES, isDuplicateCategoryName } from '../categoryUtils.js';
import styles from './CategoryCreateModal.module.css';

// No celular o teclado subiria com a folha e faria ela pular: só o desktop
// (ponteiro fino) abre com o nome em foco.
const focoAutomatico = typeof window !== 'undefined'
  && window.matchMedia?.('(pointer: fine)').matches === true;

const TYPE_OPTIONS = [
  { value: CATEGORY_TYPES.EXPENSE, label: 'Saída' },
  { value: CATEGORY_TYPES.INCOME, label: 'Entrada' },
];

const ROTULO_POR_ICONE = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map(({ key, label }) => [key, label]),
);

// Enquanto a pessoa não escolhe um ícone, ele acompanha o nome: "Mercado"
// já sai com o carrinho. Sem palavra conhecida, fica o padrão do tipo.
function iconePeloNome(nome, tipo) {
  const sugestao = sugerirIconesCategoria(nome, tipo);
  return sugestao.porNome ? sugestao.icones[0] : getDefaultCategoryIconKey(tipo);
}

/**
 * Formulário curto de criação de categoria. Reusa o Modal do Design System
 * e a mutação `saveCategory` do useCategories. Valida nome duplicado dentro
 * do mesmo tipo antes de chamar o serviço.
 *
 * Tela 22h: folha padrão com o nome, Saída/Entrada e a grade de ícones em
 * cinco colunas, rolando por seção dentro da folha.
 *
 * Com `category`, a folha edita essa categoria: nome e ícone mudam, o tipo
 * fica fixo para não deixar lançamentos já vinculados no tipo errado.
 */
function CategoryCreateModal({
  open,
  onClose,
  defaultType,
  categories,
  onCreate,
  category = null,
  isMutating,
  serverError,
  className,
  overlayClassName,
}) {
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState(defaultType);
  const [icon, setIcon] = useState(() => getDefaultCategoryIconKey(defaultType));
  const [localError, setLocalError] = useState('');
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const iconWasChosenRef = useRef(false);
  const iconesId = useId();
  const iconSections = useMemo(
    () => getCategoryIconSections(categoryType),
    [categoryType],
  );
  // Tela 10d: seis ícones pelo nome digitado; o já escolhido continua à vista.
  const sugestao = useMemo(
    () => sugerirIconesCategoria(name, categoryType, { manter: icon }),
    [name, categoryType, icon],
  );

  const isEditing = Boolean(category);

  useEffect(() => {
    if (open) {
      const initialType = category?.category_type ?? defaultType;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(category?.name ?? '');
      setCategoryType(initialType);
      setIcon(category ? resolveCategoryIconKey(category) : getDefaultCategoryIconKey(initialType));
      setLocalError('');
      setMostrarTodos(false);
      // Em edição o ícone salvo é escolha da pessoa: mudar o nome não o troca.
      iconWasChosenRef.current = Boolean(category);
    }
  }, [open, defaultType, category]);

  function handleClose() {
    if (isMutating) return;
    onClose?.();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isMutating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Digite um nome para a categoria.');
      return;
    }
    if (isDuplicateCategoryName(categories, trimmed, categoryType, { excludeId: category?.id })) {
      setLocalError('Já existe uma categoria com esse nome neste tipo.');
      return;
    }
    setLocalError('');
    await onCreate(
      isEditing
        ? { name: trimmed, icon }
        : { name: trimmed, category_type: categoryType, icon },
    );
  }

  function handleNameChange(value) {
    setName(value);
    if (!iconWasChosenRef.current) {
      setIcon(iconePeloNome(value, categoryType));
    }
  }

  function handleTypeChange(type) {
    setCategoryType(type);
    if (!iconWasChosenRef.current) {
      setIcon(iconePeloNome(name, type));
    }
  }

  function escolherIcone(chave) {
    iconWasChosenRef.current = true;
    setIcon(chave);
  }

  function renderIconOption(chave) {
    const selected = icon === chave;
    const rotulo = ROTULO_POR_ICONE[chave] ?? 'Ícone atual';
    return (
      <button
        key={chave}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={rotulo}
        title={rotulo}
        className={styles.iconOption}
        onClick={() => escolherIcone(chave)}
      >
        <CategoryIcon category={{ icon: chave }} />
      </button>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={isEditing ? 'Editar categoria' : 'Nova categoria'}
      description={
        isEditing
          ? 'Mude o nome ou o ícone. Os lançamentos desta categoria acompanham a mudança.'
          : 'Dê um nome simples e escolha se é uma saída ou uma entrada.'
      }
      size="lg"
      className={cx(styles.categoryCreateDialog, className)}
      bodyClassName={styles.categoryCreateBody}
      headerClassName={styles.categoryCreateHeader}
      overlayClassName={overlayClassName}
    >
      <form className={styles.categoryCreateForm} onSubmit={handleSubmit}>
        <Field label="Nome da categoria">
          <input
            id="new-category-name"
            placeholder="Ex.: Mercado"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            autoFocus={focoAutomatico}
          />
        </Field>

        {isEditing ? null : (
          <Segmented
            label="Tipo da categoria"
            options={TYPE_OPTIONS}
            value={categoryType}
            onChange={handleTypeChange}
          />
        )}

        <fieldset className={styles.iconFieldset}>
          <legend>Ícone</legend>
          {mostrarTodos ? (
            <div id={iconesId} className={styles.iconLibrary} role="radiogroup" aria-label="Ícone da categoria">
              {iconSections.map((section) => (
                <section className={styles.iconSection} key={section.id}>
                  <h3>{section.label}</h3>
                  <div className={styles.iconGrid}>
                    {section.options.map((option) => renderIconOption(option.key))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div id={iconesId} className={styles.iconSuggestedGrid} role="radiogroup" aria-label="Ícone da categoria">
              {sugestao.icones.map((chave) => renderIconOption(chave))}
            </div>
          )}
          {/* Um botão só, que troca o texto: o foco do teclado fica nele. */}
          <p className={styles.iconHelper}>
            {mostrarTodos && 'Role para ver todos os ícones.'}
            {!mostrarTodos && sugestao.porNome && 'Sugeridos pelo nome.'}
            {!mostrarTodos && !sugestao.porNome && 'Os mais usados. Digite o nome para ver sugestões.'}
            {' '}
            <button
              type="button"
              className={styles.iconToggle}
              aria-expanded={mostrarTodos}
              aria-controls={iconesId}
              onClick={() => setMostrarTodos((atual) => !atual)}
            >
              {mostrarTodos ? 'Ver sugeridos' : 'Ver todos'}
            </button>
          </p>
        </fieldset>

        {(localError || serverError) ? (
          <p className={styles.formError} role="alert">
            {localError || serverError}
          </p>
        ) : null}

        <div className={styles.formActions}>
          <OutlineButton className={styles.submitButton} type="submit" loading={isMutating} disabled={isMutating || !name.trim()}>
            {isEditing ? 'Salvar alterações' : 'Criar categoria'}
          </OutlineButton>
          <OutlineButton variant="ghost" type="button" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </OutlineButton>
        </div>
      </form>
    </Modal>
  );
}

export default CategoryCreateModal;
