import { useEffect, useState } from 'react';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import { PhCaretDownIcon } from '../simplified-app/SimplifiedIcons.jsx';
import {
  amountToCents,
  centsToAmount,
  digitsToCents,
  formatCentsAsCurrencyInput,
} from '../simplified-app/balanceAdjustmentFormUtils.js';
import { ACCOUNT_TYPE_LABELS, TIPOS_DE_CONTA } from './contasOrganizar.js';
import styles from './contas.module.css';

// No celular o teclado subiria com a folha e faria ela pular: só o desktop
// (ponteiro fino) abre com o nome em foco.
const focoAutomatico = typeof window !== 'undefined'
  && window.matchMedia?.('(pointer: fine)').matches === true;

const TIPO_PADRAO = 'checking';

/**
 * Folha curta de conta (handoff 10i): nome, tipo e saldo de hoje. Reusa o
 * Modal do Design System e a mutação `saveAccount` do useAccounts.
 *
 * Com `conta`, a folha edita essa conta: nome e tipo mudam, o saldo não (o
 * saldo se corrige por "Ajustar saldo", que guarda o histórico). Cartão de
 * crédito não passa por aqui: cria e edita em NovoCartaoModal.
 */
function NovaContaModal({ open, onClose, conta = null, onSave, isMutating, serverError }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState(TIPO_PADRAO);
  const [saldoCents, setSaldoCents] = useState(0);
  const [erroLocal, setErroLocal] = useState('');
  const editando = Boolean(conta);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a folha nasce com os dados da conta a cada abertura
      setNome(conta?.name ?? '');
      setTipo(conta?.account_type ?? TIPO_PADRAO);
      setSaldoCents(amountToCents(conta?.initial_balance ?? 0));
      setErroLocal('');
    }
  }, [open, conta]);

  function handleClose() {
    if (isMutating) return;
    onClose?.();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isMutating) return;
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErroLocal('Digite um nome para a conta.');
      return;
    }
    setErroLocal('');
    await onSave(
      editando
        ? { name: nomeLimpo, account_type: tipo }
        : { name: nomeLimpo, account_type: tipo, initial_balance: centsToAmount(saldoCents) },
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={editando ? 'Editar conta' : 'Nova conta'}
      description={editando
        ? 'Mude o nome ou o tipo. Os lançamentos desta conta acompanham a mudança.'
        : 'Dê um nome, escolha o tipo e informe o saldo de hoje.'}
      size="sm"
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field label="Nome da conta">
          <input
            id="conta-nome"
            placeholder="Ex.: Nubank"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoFocus={focoAutomatico}
          />
        </Field>

        <Field label="Tipo da conta" trailing={<PhCaretDownIcon />}>
          <select
            id="conta-tipo"
            value={tipo}
            onChange={(event) => setTipo(event.target.value)}
          >
            {TIPOS_DE_CONTA.map((codigo) => (
              <option key={codigo} value={codigo}>{ACCOUNT_TYPE_LABELS[codigo]}</option>
            ))}
          </select>
        </Field>

        {editando ? null : (
          <Field label="Saldo de hoje" helper="Se não souber, deixe zero. Você ajusta o saldo depois.">
            <input
              id="conta-saldo"
              inputMode="numeric"
              autoComplete="off"
              placeholder="R$ 0,00"
              value={formatCentsAsCurrencyInput(saldoCents)}
              onChange={(event) => setSaldoCents(digitsToCents(event.target.value))}
            />
          </Field>
        )}

        {erroLocal || serverError ? (
          <p className={styles.formError} role="alert">{erroLocal || serverError}</p>
        ) : null}

        <div className={styles.formActions}>
          <OutlineButton type="submit" loading={isMutating} disabled={isMutating || !nome.trim()}>
            {editando ? 'Salvar conta' : 'Criar conta'}
          </OutlineButton>
          <OutlineButton variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </OutlineButton>
        </div>
      </form>
    </Modal>
  );
}

export default NovaContaModal;
