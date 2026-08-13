import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Modal from '../../../components/ui/Modal';
import { cx } from '../../../utils/cx.js';
import {
  getCategoryIconSections,
  getDefaultCategoryIconKey,
} from '../categoryIconCatalog.js';
import { CategoryIcon } from '../categoryIcons.jsx';
import { CATEGORY_TYPES, isDuplicateCategoryName } from '../categoryUtils.js';
import styles from '../CategoriesPage.module.css';

const TYPE_LABELS = {
  [CATEGORY_TYPES.EXPENSE]: 'Saída',
  [CATEGORY_TYPES.INCOME]: 'Entrada',
};

/**
 * Formulário curto de criação de categoria. Reusa o Modal do Design System
 * e a mutação `saveCategory` do useCategories. Valida nome duplicado dentro
 * do mesmo tipo antes de chamar o serviço.
 */
function CategoryCreateModal({
  open,
  onClose,
  defaultType,
  categories,
  onCreate,
  isMutating,
  serverError,
  className,
  overlayClassName,
}) {
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState(defaultType);
  const [icon, setIcon] = useState(() => getDefaultCategoryIconKey(defaultType));
  const [localError, setLocalError] = useState('');
  const iconWasChosenRef = useRef(false);
  const iconSections = useMemo(
    () => getCategoryIconSections(categoryType),
    [categoryType],
  );

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('');
      setCategoryType(defaultType);
      setIcon(getDefaultCategoryIconKey(defaultType));
      setLocalError('');
      iconWasChosenRef.current = false;
    }
  }, [open, defaultType]);

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
    if (isDuplicateCategoryName(categories, trimmed, categoryType)) {
      setLocalError('Já existe uma categoria com esse nome neste tipo.');
      return;
    }
    setLocalError('');
    await onCreate({ name: trimmed, category_type: categoryType, icon });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title="Nova categoria"
      description="Dê um nome simples e escolha se é uma saída ou uma entrada."
      size="lg"
      className={cx(styles.categoryCreateDialog, className)}
      bodyClassName={styles.categoryCreateBody}
      headerClassName={styles.categoryCreateHeader}
      overlayClassName={overlayClassName}
    >
      <form className={cx(styles.form, styles.categoryCreateForm)} onSubmit={handleSubmit}>
        <Input
          id="new-category-name"
          label="Nome da categoria"
          placeholder="Ex: Mercado"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          fullWidth
        />

        <div
          className={styles.segmented}
          role="radiogroup"
          aria-label="Tipo da categoria"
        >
          {[CATEGORY_TYPES.EXPENSE, CATEGORY_TYPES.INCOME].map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={categoryType === type}
              className={
                categoryType === type
                  ? `${styles.segment} ${styles.segmentActive}`
                  : styles.segment
              }
              onClick={() => {
                setCategoryType(type);
                if (!iconWasChosenRef.current) {
                  setIcon(getDefaultCategoryIconKey(type));
                }
              }}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <fieldset className={styles.iconFieldset}>
          <legend>Escolha um ícone</legend>
          <p className={styles.iconHelper}>Todos os símbolos continuam disponíveis.</p>
          <div className={styles.iconLibrary} role="radiogroup" aria-label="Ícone da categoria">
            {iconSections.map((section) => (
              <section className={styles.iconSection} key={section.id}>
                <h3>{section.label}</h3>
                <div className={styles.iconGrid}>
                  {section.options.map((option) => {
                    const selected = icon === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={option.label}
                        className={selected
                          ? `${styles.iconOption} ${styles.iconOptionSelected}`
                          : styles.iconOption}
                        onClick={() => {
                          iconWasChosenRef.current = true;
                          setIcon(option.key);
                        }}
                      >
                        <span className={styles.iconGlyph}>
                          <CategoryIcon category={{ icon: option.key }} />
                          {selected ? <span className={styles.iconCheck} aria-hidden="true">✓</span> : null}
                        </span>
                        <span className={styles.iconLabel}>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </fieldset>

        {(localError || serverError) ? (
          <p className={styles.formError} role="alert">
            {localError || serverError}
          </p>
        ) : null}

        <div className={styles.formActions}>
          <Button variant="ghost" type="button" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          <Button type="submit" loading={isMutating} disabled={isMutating || !name.trim()}>
            Criar categoria
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default CategoryCreateModal;
