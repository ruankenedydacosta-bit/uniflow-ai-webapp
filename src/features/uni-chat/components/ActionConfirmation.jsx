import { useId, useState } from 'react';
import UniSignatureWave from './UniSignatureWave';
import {
  amountToCents,
  centsToAmount,
  digitsToCents,
  formatCentsAsCurrencyInput,
} from '../../simplified-app/balanceAdjustmentFormUtils.js';
import {
  buildEditOverrides,
  EDIT_DESCRIPTION_MAX_LENGTH,
  initialEditValues,
  validateEditValues,
} from '../confirmationEditForm.js';
import styles from './ActionConfirmation.module.css';

// Campos do "Editar" dentro do próprio card (buildConfirmationEditForm).
function EditFields({ form, values, errors, onChange, disabled }) {
  const baseId = useId();
  return (
    <div className={styles.editFields}>
      {form.fields.map((field) => {
        const id = `${baseId}-${field.key}`;
        const errorId = errors[field.key] ? `${id}-error` : undefined;
        const common = {
          id,
          className: styles.editInput,
          disabled,
          'aria-invalid': Boolean(errors[field.key]),
          'aria-describedby': errorId,
        };
        let control;
        if (field.type === 'money') {
          control = (
            <input
              {...common}
              inputMode="numeric"
              autoComplete="off"
              value={formatCentsAsCurrencyInput(amountToCents(values[field.key]))}
              onChange={(event) => onChange(field.key, centsToAmount(digitsToCents(event.target.value)))}
            />
          );
        } else if (field.type === 'select') {
          control = (
            <select
              {...common}
              value={values[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
            >
              {!field.options.some((option) => option.value === values[field.key]) && (
                <option value={values[field.key]} disabled>Escolha</option>
              )}
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          );
        } else {
          control = (
            <input
              {...common}
              type={field.type === 'date' ? 'date' : 'text'}
              maxLength={field.type === 'text' ? EDIT_DESCRIPTION_MAX_LENGTH : undefined}
              value={values[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          );
        }
        return (
          <div className={styles.editField} key={field.key}>
            <label htmlFor={id}>{field.label}</label>
            {control}
            {errors[field.key] && (
              <span id={errorId} className={styles.editError}>{errors[field.key]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// FASE ESTADOS DE PROCESSAMENTO: `processingLabel` (opcional, default
// "Registrando…") -- alimentado por useUniProcessingMessage('executing',
// { actionKind }) para refletir a ação real (ajuste de saldo, transferência
// etc.) em vez de um rótulo genérico fixo.
//
// Com `editForm` e `onSaveEdit`, "Editar" abre os campos no próprio card e
// "Salvar" devolve só o que mudou. Sem eles, "Editar" chama `onEdit`.
export default function ActionConfirmation({
  data,
  onConfirm,
  onEdit,
  onCancel,
  editForm = null,
  onSaveEdit,
  isExecuting = false,
  executionError = null,
  processingLabel = 'Registrando…',
}) {
  const [editValues, setEditValues] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  if (!data) return null;
  const { title, rows = [], status = 'pending', editable = true } = data;
  const canEditInline = Boolean(editForm?.fields?.length && onSaveEdit);
  const isEditing = canEditInline && status === 'pending' && editValues !== null;

  function startEditing() {
    if (!canEditInline) {
      onEdit?.();
      return;
    }
    setEditErrors({});
    setEditValues(initialEditValues(editForm));
  }

  function stopEditing() {
    setEditValues(null);
    setEditErrors({});
  }

  function changeEditValue(key, value) {
    setEditValues((current) => ({ ...current, [key]: value }));
    setEditErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }

  function saveEdit(event) {
    event.preventDefault();
    if (isExecuting) return;
    const errors = validateEditValues(editForm, editValues);
    if (Object.values(errors).some(Boolean)) {
      setEditErrors(errors);
      return;
    }
    const overrides = buildEditOverrides(editForm, editValues);
    stopEditing();
    if (Object.keys(overrides).length) onSaveEdit(overrides);
  }

  return (
    <div className={`${styles.card} ${status !== 'pending' ? styles.resolved : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {status === 'confirmed' && (
          <span className={styles.statusOk}>
            <UniSignatureWave variant="success" size={20} /> Confirmado
          </span>
        )}
        {status === 'canceled' && <span className={styles.statusCancel}>Cancelado</span>}
        {status === 'expired' && <span className={styles.statusCancel}>Expirado</span>}
        {status === 'pending' && isExecuting && (
          <span className={styles.statusProcessing}>{processingLabel}</span>
        )}
      </div>

      {isEditing ? (
        <form className={styles.editForm} onSubmit={saveEdit} noValidate>
          <EditFields
            form={editForm}
            values={editValues}
            errors={editErrors}
            onChange={changeEditValue}
            disabled={isExecuting}
          />
          <div className={styles.actions}>
            <button type="submit" className={styles.confirm} disabled={isExecuting}>
              Salvar
            </button>
            <button type="button" className={styles.cancel} onClick={stopEditing} disabled={isExecuting}>
              Voltar
            </button>
          </div>
        </form>
      ) : (
        <dl className={styles.rows}>
          {rows.map((row, index) => (
            <div className={styles.rowItem} key={row.key ?? `${row.label}-${index}`}>
              <dt>{row.label}</dt>
              <dd className={row.emphasis ? styles.emphasisValue : ''}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {executionError && (
        <div className={styles.errorBox}>
          <span className={styles.errorIcon}>!</span>
          <span className={styles.errorText}>{executionError}</span>
        </div>
      )}

      {status === 'pending' && !isEditing && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirm}
            onClick={onConfirm}
            disabled={isExecuting}
          >
            {isExecuting ? processingLabel : 'Confirmar'}
          </button>
          {editable && (
            <button
              type="button"
              className={styles.edit}
              onClick={startEditing}
              disabled={isExecuting}
            >
              Editar
            </button>
          )}
          <button
            type="button"
            className={styles.cancel}
            onClick={onCancel}
            disabled={isExecuting}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
