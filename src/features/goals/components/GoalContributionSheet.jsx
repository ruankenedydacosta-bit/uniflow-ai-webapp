import { useId, useRef, useState } from 'react';
import { useSession } from '../../../app/SessionContext.jsx';
import Field from '../../../components/ui/Field';
import FilterChips from '../../../components/ui/FilterChips';
import Modal from '../../../components/ui/Modal';
import OutlineButton from '../../../components/ui/OutlineButton';
import Toggle from '../../../components/ui/Toggle';
import { useAccounts } from '../../../hooks';
import { formatCurrency } from '../../../utils/formatters.js';
import { digitsToCents, formatCentsAsCurrencyInput } from '../../simplified-app/balanceAdjustmentFormUtils.js';
import { PhCaretDownIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import {
  atalhosDeValor,
  erroDoMovimento,
  mensagemDoErro,
  montarMovimento,
  MOVIMENTOS,
  transferenciaDaMeta,
  valorSugerido,
} from '../aporteDaMeta.js';
import { dataIsoLocal } from '../criacaoDeMeta.js';
// Mesma folha da criação de meta: diálogo, campos e rodapé iguais.
import styles from './GoalCreateFlow.module.css';

// Folha de aporte e de retirada (handoff 08f, #158). O pai monta o
// componente só enquanto a folha está aberta, então cada abertura começa
// com o valor do mês e a data de hoje. `onSave` recebe o payload de
// addContribution e devolve o resultado.
export default function GoalContributionSheet({ meta, movimento, onClose, onSave }) {
  const formId = useId();
  const { workspace } = useSession();
  const {
    activeAccounts,
    isLoading: carregandoContas,
    error: erroDasContas,
    refresh: recarregarContas,
  } = useAccounts({ workspaceId: workspace?.id });
  const retirada = movimento === MOVIMENTOS.RETIRADA;

  const [hoje] = useState(() => new Date());
  // A mesma chave em toda tentativa desta folha: um toque duplo ou uma nova
  // tentativa depois de a resposta se perder não grava o aporte duas vezes.
  const [clientOperationId] = useState(() => `aporte-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [centavos, setCentavos] = useState(() => valorSugerido(meta, movimento));
  const [data, setData] = useState(() => dataIsoLocal(hoje));
  const [observacao, setObservacao] = useState('');
  const [registrar, setRegistrar] = useState(true);
  const [contaId, setContaId] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);

  const atalhos = atalhosDeValor(meta, movimento);
  const transferencia = transferenciaDaMeta(meta, activeAccounts);
  // Sem conta vinculada não há o que esperar. Com ela, salvar antes de as
  // contas chegarem, ou com a lista que falhou, gravaria o aporte sem a
  // transferência que a folha promete.
  const esperandoContas = Boolean(meta.linked_account_id) && (carregandoContas || Boolean(erroDasContas));
  // Com uma conta só do outro lado, ela já vem escolhida.
  const contaEscolhida = contaId || (transferencia.contas.length === 1 ? transferencia.contas[0].id : '');
  const nomeDaConta = transferencia.contas.find((conta) => conta.id === contaEscolhida)?.name;
  const formulario = {
    movimento,
    centavos,
    data,
    observacao,
    registrarNoFinanceiro: registrar && transferencia.disponivel,
    contaId: contaEscolhida,
  };

  function mudar(setter) {
    return (valor) => {
      setter(valor);
      setErro(null);
    };
  }

  async function salvar() {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    let resultado;
    try {
      resultado = await onSave(montarMovimento(formulario, clientOperationId));
    } catch (error) {
      resultado = { error };
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
    if (resultado?.error) setErro(mensagemDoErro(resultado.error, movimento));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (esperandoContas) return;
    const erroDoFormulario = erroDoMovimento(formulario, meta, hoje);
    if (erroDoFormulario) {
      setErro(erroDoFormulario);
      return;
    }
    void salvar();
  }

  const rotuloDoBotao = retirada ? 'Registrar retirada' : 'Registrar aporte';
  const rodape = (
    <div className={styles.actions}>
      <OutlineButton variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</OutlineButton>
      <OutlineButton type="submit" form={formId} loading={salvando} disabled={esperandoContas}>{rotuloDoBotao}</OutlineButton>
    </div>
  );

  const vinculada = transferencia.vinculada?.name;
  const outraPonta = nomeDaConta ?? (retirada ? 'a conta de destino' : 'a conta de origem');
  const ajudaDaTransferencia = retirada
    ? `Lança uma transferência de ${vinculada} para ${outraPonta}.`
    : `Lança uma transferência de ${outraPonta} para ${vinculada}.`;

  return (
    <Modal
      open
      onClose={salvando ? undefined : onClose}
      closeOnOverlayClick={!salvando}
      closeOnEsc={!salvando}
      title={retirada ? 'Retirar da meta' : 'Registrar aporte'}
      description={retirada
        ? `${meta.name}. Guardado: ${formatCurrency(meta.current_amount)}.`
        : meta.name}
      footer={rodape}
      size="sm"
      className={styles.dialog}
      overlayClassName={styles.overlay}
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
        <Field label={retirada ? 'Valor da retirada' : 'Valor do aporte'}>
          <input
            inputMode="numeric"
            autoFocus
            placeholder="R$ 0,00"
            value={centavos ? formatCentsAsCurrencyInput(centavos) : ''}
            onChange={(event) => mudar(setCentavos)(digitsToCents(event.target.value))}
          />
        </Field>
        {atalhos.length > 0 ? (
          <FilterChips
            label="Atalhos de valor"
            options={atalhos}
            value={centavos}
            onChange={mudar(setCentavos)}
          />
        ) : null}

        <Field label="Data">
          <input type="date" value={data} max={dataIsoLocal(hoje)} onChange={(event) => mudar(setData)(event.target.value)} />
        </Field>

        <Field label="Observação (opcional)">
          <input
            value={observacao}
            maxLength={120}
            placeholder={retirada ? 'Ex.: conserto do carro' : 'Ex.: parte do 13º'}
            onChange={(event) => mudar(setObservacao)(event.target.value)}
          />
        </Field>

        {erroDasContas && meta.linked_account_id && !carregandoContas ? (
          <div className={styles.pushNotice}>
            <p className={styles.helper}>Não foi possível carregar as contas para lançar a transferência no Financeiro.</p>
            <OutlineButton variant="secondary" onClick={() => recarregarContas()}>Tentar de novo</OutlineButton>
          </div>
        ) : esperandoContas ? null : transferencia.disponivel ? (
          <>
            <div className={styles.toggleRow}>
              <span className={styles.toggleText}>
                <span>Registrar também no Financeiro</span>
                {registrar ? <span className={styles.helper}>{ajudaDaTransferencia}</span> : null}
              </span>
              <Toggle checked={registrar} onChange={mudar(setRegistrar)} label="Registrar também no Financeiro" />
            </div>
            {registrar ? (
              <Field label={retirada ? 'Conta de destino' : 'Conta de origem'} trailing={<PhCaretDownIcon />}>
                <select value={contaEscolhida} onChange={(event) => mudar(setContaId)(event.target.value)}>
                  <option value="">Escolha a conta</option>
                  {transferencia.contas.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.name}</option>
                  ))}
                </select>
              </Field>
            ) : null}
          </>
        ) : (
          <p className={styles.helper}>{transferencia.motivo}</p>
        )}

        {erro ? <p className={styles.error} role="alert">{erro}</p> : null}
      </form>
    </Modal>
  );
}
