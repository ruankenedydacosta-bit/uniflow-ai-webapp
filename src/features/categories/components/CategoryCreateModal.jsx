import { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Modal from '../../../components/ui/Modal';
import { CATEGORY_TYPES, isDuplicateCategoryName } from '../categoryUtils.js';
import styles from '../CategoriesPage.module.css';

const TYPE_LABELS = {
  [CATEGORY_TYPES.EXPENSE]: 'Despesa',
  [CATEGORY_TYPES.INCOME]: 'Receita',
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
}) {
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState(defaultType);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('');
      setCategoryType(defaultType);
      setLocalError('');
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
    await onCreate({ name: trimmed, category_type: categoryType });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title="Nova categoria"
      description="Dê um nome simples e escolha se é uma despesa ou uma receita."
      size="sm"
    >
      <form className={styles.form} onSubmit={handleSubmit}>
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
              onClick={() => setCategoryType(type)}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>

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
