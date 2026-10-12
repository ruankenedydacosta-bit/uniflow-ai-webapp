import { useId, useRef, useState } from 'react';
import ChoiceRow from '../../../components/ui/ChoiceRow';
import Modal from '../../../components/ui/Modal';
import OutlineButton from '../../../components/ui/OutlineButton';
import { formatCurrency } from '../../../utils/formatters.js';
import { AJUSTES, mensagemDoErroAoAjustar, opcoesDeAjuste, primeiraOpcaoDisponivel } from '../ajusteDoPlano.js';
import { calcRemaining } from '../goalCalc.js';
// Mesma folha da criação de meta: diálogo, campos e rodapé iguais.
import styles from './GoalCreateFlow.module.css';

// Folha "Ajustar plano" (handoff 08g, #159). O pai monta o componente só
// enquanto a folha está aberta, então cada abertura recalcula as opções.
// `onSave` recebe as alterações do updateGoal e devolve o resultado.
export default function GoalPlanAdjustSheet({ meta, onClose, onSave }) {
  const formId = useId();
  const nomeDoGrupo = useId();
  const [hoje] = useState(() => new Date());
  const [opcoes] = useState(() => opcoesDeAjuste(meta, hoje));
  const [escolha, setEscolha] = useState(() => primeiraOpcaoDisponivel(opcoes));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);

  const falta = calcRemaining(Number(meta.current_amount || 0), Number(meta.target_amount || 0));
  const opcaoEscolhida = opcoes.find((opcao) => opcao.value === escolha);

  async function handleSubmit(event) {
    event.preventDefault();
    if (salvandoRef.current || !opcaoEscolhida?.alteracoes) return;
    salvandoRef.current = true;
    setSalvando(true);
    setErro(null);
    let resultado;
    try {
      resultado = await onSave(opcaoEscolhida.alteracoes);
    } catch (error) {
      resultado = { error };
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
    if (resultado?.error) setErro(mensagemDoErroAoAjustar(escolha));
  }

  const rodape = (
    <div className={styles.actions}>
      <OutlineButton variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</OutlineButton>
      <OutlineButton type="submit" form={formId} loading={salvando} disabled={!opcaoEscolhida?.alteracoes}>
        {escolha === AJUSTES.PAUSAR ? 'Pausar meta' : 'Salvar ajuste'}
      </OutlineButton>
    </div>
  );

  return (
    <Modal
      open
      onClose={salvando ? undefined : onClose}
      closeOnOverlayClick={!salvando}
      closeOnEsc={!salvando}
      title="Ajustar plano"
      description={`${meta.name}. Faltam ${formatCurrency(falta)}.`}
      footer={rodape}
      size="sm"
      className={styles.dialog}
      overlayClassName={styles.overlay}
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Escolha como seguir</legend>
          {opcoes.map((opcao) => (
            <ChoiceRow
              key={opcao.value}
              name={nomeDoGrupo}
              value={opcao.value}
              title={opcao.titulo}
              description={opcao.descricao}
              checked={escolha === opcao.value}
              disabled={!opcao.alteracoes || salvando}
              onChange={() => {
                setEscolha(opcao.value);
                setErro(null);
              }}
            />
          ))}
        </fieldset>

        {erro ? <p className={styles.error} role="alert">{erro}</p> : null}
      </form>
    </Modal>
  );
}
