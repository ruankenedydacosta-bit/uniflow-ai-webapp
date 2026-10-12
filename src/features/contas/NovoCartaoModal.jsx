import { useEffect, useState } from 'react';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import {
  amountToCents,
  centsToAmount,
  digitsToCents,
  formatCentsAsCurrencyInput,
} from '../simplified-app/balanceAdjustmentFormUtils.js';
import { TIPO_CARTAO, validarCartao } from './contasOrganizar.js';
import styles from './contas.module.css';

// No celular o teclado subiria com a folha e faria ela pular: só o desktop
// (ponteiro fino) abre com o nome em foco.
const focoAutomatico = typeof window !== 'undefined'
  && window.matchMedia?.('(pointer: fine)').matches === true;

function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '').slice(0, 2);
}

/**
 * Folha curta de cartão de crédito (handoff 10k): nome, limite e os dias de
 * fechamento e vencimento. Grava uma conta `credit_card`. Com `cartao`, a
 * folha edita esse cartão (o saldo não entra: ele vem dos lançamentos).
 */
function NovoCartaoModal({ open, onClose, cartao = null, onSave, isMutating, serverError }) {
  const [nome, setNome] = useState('');
  const [limiteCents, setLimiteCents] = useState(0);
  const [fechamento, setFechamento] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [erroLocal, setErroLocal] = useState('');
  const editando = Boolean(cartao);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a folha nasce com os dados do cartão a cada abertura
      setNome(cartao?.name ?? '');
      setLimiteCents(amountToCents(cartao?.credit_limit ?? 0));
      setFechamento(cartao?.closing_day ? String(cartao.closing_day) : '');
      setVencimento(cartao?.due_day ? String(cartao.due_day) : '');
      setErroLocal('');
    }
  }, [open, cartao]);

  function handleClose() {
    if (isMutating) return;
    onClose?.();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isMutating) return;
    const nomeLimpo = nome.trim();
    const limite = centsToAmount(limiteCents);
    const erro = validarCartao({ nome: nomeLimpo, limite, fechamento, vencimento });
    if (erro) {
      setErroLocal(erro);
      return;
    }
    setErroLocal('');
    const campos = {
      name: nomeLimpo,
      credit_limit: limite,
      closing_day: Number(fechamento),
      due_day: Number(vencimento),
    };
    await onSave(editando ? campos : { ...campos, account_type: TIPO_CARTAO, initial_balance: 0 });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={editando ? 'Editar cartão' : 'Novo cartão'}
      description={editando
        ? 'Mude o nome, o limite ou as datas da fatura.'
        : 'Dê um nome, informe o limite e os dias em que a fatura fecha e vence.'}
      size="sm"
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field label="Nome do cartão">
          <input
            id="cartao-nome"
            placeholder="Ex.: Nubank"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoFocus={focoAutomatico}
          />
        </Field>

        <Field label="Limite" helper="O total que o cartão deixa gastar. Se não souber, deixe zero.">
          <input
            id="cartao-limite"
            inputMode="numeric"
            autoComplete="off"
            placeholder="R$ 0,00"
            value={formatCentsAsCurrencyInput(limiteCents)}
            onChange={(event) => setLimiteCents(digitsToCents(event.target.value))}
          />
        </Field>

        <div className={styles.dias}>
          <Field label="Dia do fechamento" helper="Compras depois desse dia entram na fatura seguinte.">
            <input
              id="cartao-fechamento"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 25"
              value={fechamento}
              onChange={(event) => setFechamento(somenteDigitos(event.target.value))}
            />
          </Field>
          <Field label="Dia do vencimento" helper="Dia em que a fatura é paga.">
            <input
              id="cartao-vencimento"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 5"
              value={vencimento}
              onChange={(event) => setVencimento(somenteDigitos(event.target.value))}
            />
          </Field>
        </div>

        {erroLocal || serverError ? (
          <p className={styles.formError} role="alert">{erroLocal || serverError}</p>
        ) : null}

        <div className={styles.formActions}>
          <OutlineButton type="submit" loading={isMutating} disabled={isMutating || !nome.trim()}>
            {editando ? 'Salvar cartão' : 'Criar cartão'}
          </OutlineButton>
          <OutlineButton variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </OutlineButton>
        </div>
      </form>
    </Modal>
  );
}

export default NovoCartaoModal;
