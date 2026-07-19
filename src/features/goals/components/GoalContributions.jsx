import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import styles from './GoalContributions.module.css';

export default function GoalContributions({ open, onClose, goal, contributions, onAdd, onRemove }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    const cleaned = String(amount || '').replace(/[^0-9,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (!num || num <= 0) return;
    setSaving(true);
    const clientOperationId = `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await onAdd(goal.id, { amount: num, note: note.trim() || undefined, client_operation_id: clientOperationId });
    setSaving(false);
    setAmount('');
    setNote('');
  }

  async function handleRemove(contrib) {
    await onRemove(goal.id, contrib.id, contrib.amount);
    setConfirmRemoveId(null);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Contribuições: ${goal?.name}`} size="md">
      <form onSubmit={handleAdd} className={styles.addForm}>
        <div className={styles.addRow}>
          <Input
            placeholder="Valor"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9,]/g, ''))}
            required
          />
          <Input
            placeholder="Observação (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" loading={saving} disabled={!amount}>Adicionar</Button>
        </div>
      </form>

      <div className={styles.list}>
        {(!contributions || contributions.length === 0) && (
          <p className={styles.empty}>Nenhuma contribuição registrada.</p>
        )}
        {contributions?.map((c) => (
          <div key={c.id} className={styles.item}>
            <div className={styles.itemInfo}>
              <strong className={styles.itemAmount}>{formatCurrency(c.amount)}</strong>
              <span className={styles.itemDate}>{formatDate(c.contribution_date)}</span>
              {c.note && <span className={styles.itemNote}>{c.note}</span>}
            </div>
            {confirmRemoveId === c.id ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>Excluir?</span>
                <Button size="sm" variant="danger" onClick={() => handleRemove(c)}>Sim</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveId(null)}>Não</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveId(c.id)}>Excluir</Button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
