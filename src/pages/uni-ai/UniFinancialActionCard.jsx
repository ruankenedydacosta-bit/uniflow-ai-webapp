import { useState } from 'react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { UNI_CONVERSATION_STATES } from '../../features/uni-conversation';
import styles from '../UniAIPage.module.css';

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatDate(value) {
  if (!value) return 'A confirmar';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
}

function UniFinancialActionCard({ conversation, onConfirm, onCorrect, onCancel }) {
  const { status, action, response } = conversation;
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [corrections, setCorrections] = useState({});
  const activeIssue = action?.issues?.[0] ?? null;
  const isClarifying = status === UNI_CONVERSATION_STATES.NEEDS_CLARIFICATION;
  const isAwaiting = status === UNI_CONVERSATION_STATES.AWAITING_CONFIRMATION;
  const isExecuting = status === UNI_CONVERSATION_STATES.EXECUTING;
  const showEditor = isClarifying || isCorrecting;

  if (!action || status === UNI_CONVERSATION_STATES.IDLE) return null;

  function updateCorrection(field, value) {
    setCorrections((current) => ({ ...current, [field]: value }));
  }

  function submitCorrections(event) {
    event.preventDefault();
    onCorrect(corrections);
    setCorrections({});
    setIsCorrecting(false);
  }

  function renderAccountField(field = 'accountId', label = 'Conta') {
    const currentAccountId = field === 'destinationAccountId'
      ? action.payload?.destination_account_id
      : action.account?.id;
    return (
      <label className={styles.financialCorrectionField}>
        <span>{label}</span>
        <select
          value={corrections[field] ?? (isClarifying ? '' : currentAccountId ?? '')}
          onChange={(event) => updateCorrection(field, event.target.value)}
          required
        >
          <option value="">Selecione uma conta ativa</option>
          {action.options.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
    );
  }

  function renderFocusedCorrection() {
    if (!isClarifying || !activeIssue) return null;
    if (activeIssue.field === 'account') return renderAccountField();
    if (activeIssue.field === 'destinationAccount') {
      return renderAccountField('destinationAccountId', 'Conta de destino');
    }
    if (activeIssue.field === 'category') {
      return (
        <label className={styles.financialCorrectionField}>
          <span>Categoria</span>
          <select
            value={corrections.categoryId ?? ''}
            onChange={(event) => updateCorrection('categoryId', event.target.value)}
            required
          >
            <option value="">Selecione uma categoria existente</option>
            {action.options.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      );
    }
    if (activeIssue.field === 'amount') {
      return (
        <Input
          label="Valor"
          type="number"
          min="0.01"
          step="0.01"
          value={corrections.amount ?? ''}
          onChange={(event) => updateCorrection('amount', event.target.value)}
          required
          fullWidth
        />
      );
    }
    if (activeIssue.field === 'date') {
      return (
        <Input
          label="Data"
          type="date"
          value={corrections.date ?? ''}
          onChange={(event) => updateCorrection('date', event.target.value)}
          required
          fullWidth
        />
      );
    }
    return (
      <Input
        label="Descrição"
        value={corrections.description ?? ''}
        onChange={(event) => updateCorrection('description', event.target.value)}
        required
        fullWidth
      />
    );
  }

  return (
    <Card variant="glass" padding="lg" className={styles.financialActionCard}>
      <header className={styles.financialActionHeader}>
        <div>
          <Badge variant={status === UNI_CONVERSATION_STATES.COMPLETED ? 'success' : 'primary'}>
            {status === UNI_CONVERSATION_STATES.COMPLETED
              ? 'Lançamento registrado'
              : isExecuting
                ? 'Registrando com segurança'
                : isClarifying
                  ? 'Só falta um detalhe'
                  : 'Confirmação necessária'}
          </Badge>
          <h3>{action.typeLabel ?? 'Movimentação financeira'}</h3>
        </div>
        <span>Uni · ação financeira</span>
      </header>

      <p className={styles.financialActionResponse} role="status" aria-live="polite">
        {response}
      </p>

      {!isClarifying ? (
        <dl className={styles.financialActionDetails}>
          <div><dt>Tipo</dt><dd>{action.typeLabel}</dd></div>
          <div><dt>Valor</dt><dd>{action.amount ? CURRENCY_FORMATTER.format(action.amount) : 'A confirmar'}</dd></div>
          <div><dt>Categoria</dt><dd>{action.category?.name ?? 'A confirmar'}</dd></div>
          <div><dt>Descrição</dt><dd>{action.description ?? 'A confirmar'}</dd></div>
          <div><dt>Conta</dt><dd>{action.account?.name ?? 'A confirmar'}</dd></div>
          <div><dt>Data</dt><dd>{formatDate(action.date)}</dd></div>
        </dl>
      ) : null}

      {showEditor ? (
        <form className={styles.financialCorrectionForm} onSubmit={submitCorrections}>
          {isClarifying ? renderFocusedCorrection() : (
            <>
              {renderAccountField()}
              <label className={styles.financialCorrectionField}>
                <span>Categoria</span>
                <select
                  value={corrections.categoryId ?? action.category?.id ?? ''}
                  onChange={(event) => updateCorrection('categoryId', event.target.value)}
                >
                  {action.options.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <Input
                label="Valor"
                type="number"
                min="0.01"
                step="0.01"
                value={corrections.amount ?? action.amount ?? ''}
                onChange={(event) => updateCorrection('amount', event.target.value)}
                required
                fullWidth
              />
              <Input
                label="Data"
                type="date"
                value={corrections.date ?? action.date ?? ''}
                onChange={(event) => updateCorrection('date', event.target.value)}
                required
                fullWidth
              />
              <Input
                label="Descrição"
                value={corrections.description ?? action.description ?? ''}
                onChange={(event) => updateCorrection('description', event.target.value)}
                required
                fullWidth
              />
            </>
          )}
          <div className={styles.financialActionButtons}>
            <Button type="submit" size="sm">
              {isClarifying ? 'Continuar' : 'Aplicar correção'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      ) : null}

      {isAwaiting && !isCorrecting ? (
        <footer className={styles.financialActionButtons}>
          <Button size="sm" onClick={onConfirm}>Confirmar</Button>
          <Button variant="outline" size="sm" onClick={() => setIsCorrecting(true)}>Corrigir</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        </footer>
      ) : null}
    </Card>
  );
}

export default UniFinancialActionCard;
