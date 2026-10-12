import { useState } from 'react';
import Field from '../../components/ui/Field';
import IconBox from '../../components/ui/IconBox';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import { formatCurrency } from '../../utils/formatters.js';
import { toDateKey } from './simplifiedAgendaCalendar.js';
import styles from './PlannedDetailModal.module.css';

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

const COPY = {
  income: {
    confirm: 'Marcar como recebido',
    effect: 'Este valor entra no saldo quando você confirmar o recebimento.',
  },
  expense: {
    confirm: 'Marcar como pago',
    effect: 'Este valor sai do saldo quando você confirmar o pagamento.',
  },
  transfer: {
    confirm: 'Confirmar transferência',
    effect: 'A transferência muda o saldo das contas quando você confirmar.',
  },
};

function formatDay(dateKey) {
  return DATE_FORMATTER.format(new Date(`${dateKey}T12:00:00`));
}

function describeDate(dateKey) {
  const today = toDateKey(new Date());
  if (dateKey > today) return `Previsto para ${formatDay(dateKey)}`;
  if (dateKey === today) return 'Vence hoje';
  return `Venceu em ${formatDay(dateKey)}`;
}

// Tela 24c: detalhe do lançamento previsto. Quem monta passa `key` com o id
// do lançamento, então o modo volta ao detalhe a cada abertura.
function PlannedDetailModal({
  accountName,
  busy = false,
  categoryName,
  error,
  icon,
  onChangeDate,
  onClose,
  onConfirm,
  onDelete,
  onEdit,
  open,
  transaction,
}) {
  const [mode, setMode] = useState('detail');
  const [newDate, setNewDate] = useState(transaction.transaction_date);
  const copy = COPY[transaction.transaction_type] ?? COPY.expense;
  const isIncome = transaction.transaction_type === 'income';
  const sign = transaction.transaction_type === 'transfer' ? '' : isIncome ? '+ ' : '- ';

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOverlayClick={!busy}
      closeOnEsc={!busy}
      aria-label={`Previsto: ${transaction.description}`}
      size="sm"
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <IconBox size={44} className={styles.icon}>{icon}</IconBox>
          <div className={styles.headerText}>
            <strong>{transaction.description}</strong>
            <span>{describeDate(transaction.transaction_date)}</span>
          </div>
        </div>

        <div className={styles.amountBlock}>
          <strong className={styles.amount}>{`${sign}${formatCurrency(transaction.amount)}`}</strong>
          <span>{copy.effect}</span>
        </div>

        <dl className={styles.details}>
          {accountName ? (
            <div><dt>Conta</dt><dd>{accountName}</dd></div>
          ) : null}
          <div><dt>Categoria</dt><dd>{categoryName}</dd></div>
          <div>
            <dt>Na data</dt>
            <dd>{transaction.metadata?.auto_confirm ? 'Confirmar automaticamente' : 'Pedir confirmação'}</dd>
          </div>
        </dl>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {mode === 'detail' ? (
          <div className={styles.actions}>
            <OutlineButton variant="secondary" className={styles.primary} loading={busy} onClick={onConfirm}>
              {copy.confirm}
            </OutlineButton>
            <div className={styles.pair}>
              <OutlineButton variant="ghost" disabled={busy} onClick={() => setMode('date')}>Mudar data</OutlineButton>
              <OutlineButton variant="ghost" disabled={busy} onClick={onEdit}>Editar</OutlineButton>
            </div>
            <OutlineButton variant="ghost" disabled={busy} onClick={() => setMode('delete')}>
              Excluir previsto
            </OutlineButton>
          </div>
        ) : null}

        {mode === 'date' ? (
          <form
            className={styles.actions}
            onSubmit={(event) => {
              event.preventDefault();
              if (newDate && newDate !== transaction.transaction_date) onChangeDate(newDate);
            }}
          >
            <Field label="Nova data">
              <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} required />
            </Field>
            <OutlineButton
              type="submit"
              variant="secondary"
              className={styles.primary}
              loading={busy}
              disabled={!newDate || newDate === transaction.transaction_date}
            >
              Salvar data
            </OutlineButton>
            <OutlineButton variant="ghost" disabled={busy} onClick={() => setMode('detail')}>Cancelar</OutlineButton>
          </form>
        ) : null}

        {mode === 'delete' ? (
          <div className={styles.actions}>
            <p className={styles.confirmText}>Excluir este previsto? Ele some do histórico e do saldo previsto.</p>
            <OutlineButton variant="secondary" className={styles.primary} loading={busy} onClick={onDelete}>
              Excluir
            </OutlineButton>
            <OutlineButton variant="ghost" disabled={busy} onClick={() => setMode('detail')}>Cancelar</OutlineButton>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default PlannedDetailModal;
