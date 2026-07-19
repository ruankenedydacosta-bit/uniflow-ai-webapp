import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import styles from './GoalForm.module.css';

const DEFAULT_CATEGORIES = [
  { value: 'emergency_reserve', label: 'Reserva de emergência' },
  { value: 'pay_debt', label: 'Quitar dívida' },
  { value: 'travel', label: 'Viagem' },
  { value: 'property', label: 'Imóvel' },
  { value: 'vehicle', label: 'Veículo' },
  { value: 'investment', label: 'Investimento' },
  { value: 'education', label: 'Educação' },
  { value: 'business', label: 'Empresa' },
  { value: 'other', label: 'Outra' },
];

const INITIAL_STATE = {
  name: '',
  description: '',
  target_amount: '',
  initial_amount: '0',
  start_date: new Date().toISOString().split('T')[0],
  target_date: '',
  category: 'other',
  priority: 'medium',
  planned_monthly_amount: '',
};

function toNumber(value) {
  const cleaned = String(value || '').replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatInputCurrency(value) {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? toNumber(value) : value;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export default function GoalForm({ open, onClose, goal, onSave }) {
  const isEditing = Boolean(goal);
  const [form, setForm] = useState(() => {
    if (goal) {
      return {
        name: goal.name || '',
        description: goal.description || '',
        target_amount: String(goal.target_amount || ''),
        initial_amount: String(goal.initial_amount || '0'),
        current_amount: String(goal.current_amount || '0'),
        start_date: goal.start_date || new Date().toISOString().split('T')[0],
        target_date: goal.target_date || '',
        category: goal.category || 'other',
        priority: goal.priority || 'medium',
        planned_monthly_amount: String(goal.planned_monthly_amount || ''),
      };
    }
    return { ...INITIAL_STATE };
  });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validate() {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Nome é obrigatório.';
    const target = toNumber(form.target_amount);
    if (!target || target <= 0) errors.target_amount = 'Valor-alvo deve ser positivo.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      target_amount: toNumber(form.target_amount),
      initial_amount: isEditing ? undefined : toNumber(form.initial_amount),
      current_amount: isEditing ? toNumber(form.current_amount) : toNumber(form.initial_amount),
      start_date: form.start_date || undefined,
      target_date: form.target_date || undefined,
      category: form.category || 'other',
      priority: form.priority || 'medium',
      planned_monthly_amount: form.planned_monthly_amount ? toNumber(form.planned_monthly_amount) : undefined,
    };

    await onSave(payload, goal?.id);
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar meta' : 'Nova meta'} size="md">
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Nome"
          required
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          error={fieldErrors.name}
          placeholder="Ex: Reserva de emergência"
        />

        <div className={styles.row}>
          <Input
            label="Valor-alvo (R$)"
            required
            value={formatInputCurrency(form.target_amount)}
            onChange={(e) => handleChange('target_amount', e.target.value.replace(/[^0-9,]/g, ''))}
            error={fieldErrors.target_amount}
          />
          {!isEditing && (
            <Input
              label="Valor inicial (R$)"
              value={formatInputCurrency(form.initial_amount)}
              onChange={(e) => handleChange('initial_amount', e.target.value.replace(/[^0-9,]/g, ''))}
            />
          )}
          {isEditing && (
            <Input
              label="Valor acumulado (R$)"
              value={formatInputCurrency(form.current_amount)}
              onChange={(e) => handleChange('current_amount', e.target.value.replace(/[^0-9,]/g, ''))}
            />
          )}
        </div>

        <Input
          label="Descrição"
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Por que essa meta é importante?"
        />

        <div className={styles.row}>
          <Input
            label="Data de início"
            type="date"
            value={form.start_date}
            onChange={(e) => handleChange('start_date', e.target.value)}
          />
          <Input
            label="Data-alvo"
            type="date"
            value={form.target_date}
            onChange={(e) => handleChange('target_date', e.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.selectLabel}>Categoria</label>
            <select
              className={styles.select}
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
            >
              {DEFAULT_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.selectLabel}>Prioridade</label>
            <select
              className={styles.select}
              value={form.priority}
              onChange={(e) => handleChange('priority', e.target.value)}
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </div>
        </div>

        <Input
          label="Contribuição mensal planejada (R$)"
          value={formatInputCurrency(form.planned_monthly_amount)}
          onChange={(e) => handleChange('planned_monthly_amount', e.target.value.replace(/[^0-9,]/g, ''))}
          placeholder="Quanto pretende contribuir por mês"
        />

        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>
            {isEditing ? 'Salvar' : 'Criar meta'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
