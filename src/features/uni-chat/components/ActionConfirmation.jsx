import { useId, useState } from 'react';
import OutlineButton from '../../../components/ui/OutlineButton/OutlineButton.jsx';
import { PhCheckIcon } from '../../simplified-app/SimplifiedIcons.jsx';
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
import { resolveConfirmationCard } from '../confirmationCardModel.js';
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
//
// Redesign (épico #91): o card segue o "Card de rascunho" do handoff. Nada é
// gravado sem Confirmar. `appearance="glass"` é a versão sobre o fundo da
// tela de voz.
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
  appearance = 'default',
}) {
  // O formulário da edição aberta fica guardado: se o rascunho mudar por
  // fora enquanto a pessoa edita, Salvar compara com o que ela viu.
  const [editingForm, setEditingForm] = useState(null);
  const [editValues, setEditValues] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  if (!data) return null;
  const { status = 'pending', editable = true } = data;
  const card = resolveConfirmationCard(data);
  const canEditInline = Boolean(editForm?.fields?.length && onSaveEdit);
  const isEditing = canEditInline && status === 'pending' && editValues !== null;

  function startEditing() {
    if (!canEditInline) {
      onEdit?.();
      return;
    }
    setEditErrors({});
    setEditingForm(editForm);
    setEditValues(initialEditValues(editForm));
  }

  function stopEditing() {
    setEditingForm(null);
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
    const errors = validateEditValues(editingForm, editValues);
    if (Object.values(errors).some(Boolean)) {
      setEditErrors(errors);
      return;
    }
    const overrides = buildEditOverrides(editingForm, editValues);
    stopEditing();
    if (Object.keys(overrides).length) onSaveEdit(overrides);
  }

  return (
    <section
      className={styles.card}
      data-status={status}
      data-appearance={appearance}
      aria-label={card.kind}
    >
      <div className={styles.header}>
        <span className={styles.kind}>{card.kind}</span>
        {status === 'confirmed' && (
          <span className={styles.statusOk}>
            <span className={styles.statusIcon} aria-hidden="true"><PhCheckIcon /></span>
            Confirmado
          </span>
        )}
        {status === 'canceled' && <span className={styles.statusMuted}>Cancelado</span>}
        {status === 'expired' && <span className={styles.statusMuted}>Expirado</span>}
        {status === 'pending' && isExecuting && (
          <span className={styles.statusProcessing}>{processingLabel}</span>
        )}
        {status === 'pending' && !isExecuting && card.tag ? (
          <span className={styles.tag}>{card.tag}</span>
        ) : null}
      </div>

      {isEditing ? (
        <form className={styles.editForm} onSubmit={saveEdit} noValidate>
          <EditFields
            form={editingForm}
            values={editValues}
            errors={editErrors}
            onChange={changeEditValue}
            disabled={isExecuting}
          />
          <div className={styles.actions}>
            <OutlineButton type="submit" variant="confirm" className={styles.primaryAction} disabled={isExecuting}>
              Salvar
            </OutlineButton>
            <OutlineButton variant="ghost" onClick={stopEditing} disabled={isExecuting}>
              Voltar
            </OutlineButton>
          </div>
        </form>
      ) : (
        <>
          {card.amount ? (
            <p className={styles.amount}>
              {card.amountLabel ? <span className={styles.amountLabel}>{card.amountLabel}</span> : null}
              {card.amount}
            </p>
          ) : null}
          {card.details.length > 0 ? (
            <dl className={styles.rows}>
              {card.details.map((row, index) => (
                <div className={styles.rowItem} key={row.key ?? `${row.label}-${index}`}>
                  <dt>{row.label}</dt>
                  <dd className={row.emphasis ? styles.emphasisValue : ''}>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      )}

      {executionError && (
        <div className={styles.errorBox} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">!</span>
          <span className={styles.errorText}>{executionError}</span>
        </div>
      )}

      {status === 'pending' && !isEditing && (
        <div className={styles.actions}>
          <OutlineButton
            variant="confirm"
            className={styles.primaryAction}
            onClick={onConfirm}
            disabled={isExecuting}
          >
            {isExecuting ? null : <PhCheckIcon />}
            {isExecuting ? 'Registrando…' : 'Confirmar'}
          </OutlineButton>
          {editable && (
            <OutlineButton variant="secondary" onClick={startEditing} disabled={isExecuting}>
              Editar
            </OutlineButton>
          )}
          <OutlineButton variant="ghost" onClick={onCancel} disabled={isExecuting}>
            Cancelar
          </OutlineButton>
        </div>
      )}
    </section>
  );
}
