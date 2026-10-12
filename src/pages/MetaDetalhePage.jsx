import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import Modal from '../components/ui/Modal/Modal.jsx';
import OutlineButton from '../components/ui/OutlineButton/index.js';
import UniCard from '../components/ui/UniCard/index.js';
import { useGoals } from '../features/goals/useGoals';
import GoalContributions from '../features/goals/components/GoalContributions';
import GoalForm from '../features/goals/components/GoalForm';
import { AnelDeProgresso } from '../features/goals/components/GoalListCard';
import { calcProgress } from '../features/goals/goalCalc.js';
import { listContributions } from '../features/goals/goalService';
import { dataDoAporte, numerosDaMeta, precisaDeAjuste, previsaoDaUni } from '../features/goals/detalheDaMeta.js';
import { linhaDeApoio, seloDaMeta } from '../features/goals/listaDeMetas.js';
import SimplifiedConfirmModal from '../features/simplified-app/SimplifiedConfirmModal.jsx';
import { PhDotsThreeIcon } from '../features/simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../features/simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../features/simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES } from '../features/simplified-app/simplifiedRoutes.js';
import { cx } from '../utils/cx.js';
import { formatCurrency } from '../utils/formatters';
import listaStyles from './ObjetivosPage.module.css';
import styles from './MetaDetalhePage.module.css';

// Detalhe da meta (handoff 08e, #157): anel, números do plano, ações,
// previsão da Uni e aportes. O menu ⋯ guarda Editar, Pausar, Concluir e
// Excluir. Retirar chega com a folha de aporte (#158), e Ajustar plano abre
// a edição até a folha própria (#159) existir.
export default function MetaDetalhePage() {
  const { id } = useParams();
  const navigate = useNavegar();
  const { workspace } = useSession();
  const { goals, isLoading, error, refresh, editGoal, removeGoal, addGoalContribution, removeGoalContribution } = useGoals({ workspaceId: workspace?.id, comUltimoAporte: true });

  const [aportes, setAportes] = useState([]);
  const [carregandoAportes, setCarregandoAportes] = useState(true);
  const [erroDosAportes, setErroDosAportes] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [erroDaConfirmacao, setErroDaConfirmacao] = useState(null);
  const [erroDaAcao, setErroDaAcao] = useState(null);
  const tituloDosAportesId = useId();

  const meta = goals.find((goal) => goal.id === id) ?? null;
  const voltar = () => navigate(SIMPLIFIED_ROUTES.METAS);

  const carregarAportes = useCallback(async () => {
    const resultado = await listContributions(id);
    setAportes(resultado.data ?? []);
    setErroDosAportes(resultado.error ? 'Não foi possível carregar os aportes.' : null);
    setCarregandoAportes(false);
  }, [id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => carregarAportes(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [carregarAportes]);

  const previsao = useMemo(() => (meta ? previsaoDaUni(meta, aportes) : null), [meta, aportes]);

  if (!meta) {
    return (
      <div className={listaStyles.page}>
        <SimplifiedSubpageHeader title="Meta" onBack={voltar} backLabel="Voltar para Metas" />
        {isLoading ? (
          <p className={listaStyles.state} role="status">Carregando meta…</p>
        ) : (
          <div className={listaStyles.state}>
            <p>{error ? 'Não foi possível carregar a meta.' : 'Esta meta não existe mais.'}</p>
            {error ? <OutlineButton variant="secondary" onClick={() => refresh()}>Tentar novamente</OutlineButton> : null}
          </div>
        )}
      </div>
    );
  }

  const progresso = calcProgress(Number(meta.current_amount || 0), Number(meta.target_amount || 0));
  const selo = seloDaMeta(meta);
  const numeros = numerosDaMeta(meta);
  const ativa = meta.status === 'active';
  const pausada = meta.status === 'paused';
  const concluida = meta.status === 'completed';
  const alcancada = !concluida && numeros.falta <= 0;

  async function salvarEdicao(values) {
    return editGoal(meta.id, values);
  }

  async function alternarPausa() {
    setMenuAberto(false);
    setErroDaAcao(null);
    const resultado = await editGoal(meta.id, { status: pausada ? 'active' : 'paused' });
    if (resultado?.error) setErroDaAcao(pausada ? 'Não foi possível retomar a meta. Tente de novo.' : 'Não foi possível pausar a meta. Tente de novo.');
  }

  function pedirConfirmacao(tipo) {
    setMenuAberto(false);
    setErroDaConfirmacao(null);
    setConfirmacao(tipo);
  }

  async function confirmar() {
    if (processando) return;
    setProcessando(true);
    const concluir = confirmacao === 'concluir';
    const resultado = concluir
      ? await editGoal(meta.id, { status: 'completed', completed_at: new Date().toISOString() })
      : await removeGoal(meta.id);
    setProcessando(false);
    if (resultado?.error) {
      setErroDaConfirmacao(concluir ? 'Não foi possível concluir a meta. Tente de novo.' : 'Não foi possível excluir a meta. Tente de novo.');
      return;
    }
    setConfirmacao(null);
    navigate(concluir ? `${SIMPLIFIED_ROUTES.METAS}?aba=concluidas` : SIMPLIFIED_ROUTES.METAS);
  }

  async function adicionarAporte(goalId, values) {
    await addGoalContribution(goalId, values);
    await carregarAportes();
  }

  // Sem saber qual aporte passa a ser o último, o refresh traz a data certa.
  async function removerAporte(goalId, contributionId, amount) {
    await removeGoalContribution(goalId, contributionId, amount);
    await carregarAportes();
    void refresh();
  }

  return (
    <div className={listaStyles.page} data-simplified-goal>
      <SimplifiedSubpageHeader
        title={meta.name}
        onBack={voltar}
        backLabel="Voltar para Metas"
        action={(
          <button type="button" className={listaStyles.headerAction} onClick={() => setMenuAberto(true)} aria-label="Mais ações da meta">
            <PhDotsThreeIcon />
          </button>
        )}
      />

      <section className={styles.hero} aria-label="Progresso da meta">
        <AnelDeProgresso progresso={progresso} tom={selo?.tom} className={styles.ring} />
        <div className={styles.heroText}>
          {selo ? <span className={cx(styles.selo, styles[selo.tom])}>{selo.rotulo}</span> : null}
          <strong className={styles.saved}>{formatCurrency(numeros.guardado)}</strong>
          <span className={styles.ofTarget}>{`de ${formatCurrency(meta.target_amount)}`}</span>
        </div>
      </section>

      {concluida || alcancada ? <p className={styles.support}>{linhaDeApoio(meta)}</p> : null}

      <dl className={styles.numbers}>
        <div>
          <dt>Falta</dt>
          <dd>{formatCurrency(numeros.falta)}</dd>
        </div>
        <div>
          <dt>Por mês</dt>
          <dd>{numeros.porMes ? formatCurrency(numeros.porMes) : '—'}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{numeros.data ?? 'Sem data'}</dd>
        </div>
      </dl>

      {erroDaAcao ? <p className={styles.error} role="alert">{erroDaAcao}</p> : null}

      {ativa || pausada ? (
        <div className={styles.actions}>
          {alcancada ? (
            <OutlineButton onClick={() => pedirConfirmacao('concluir')}>Concluir meta</OutlineButton>
          ) : null}
          {ativa && !alcancada ? (
            <OutlineButton onClick={() => setRegistrando(true)}>Registrar aporte</OutlineButton>
          ) : null}
          {pausada ? <OutlineButton onClick={alternarPausa}>Retomar meta</OutlineButton> : null}
          {precisaDeAjuste(meta) ? (
            <OutlineButton variant="secondary" onClick={() => setEditando(true)}>Ajustar plano</OutlineButton>
          ) : null}
        </div>
      ) : null}

      {previsao ? (
        <UniCard aria-label="Previsão da Uni">
          <p>{previsao}</p>
        </UniCard>
      ) : null}

      <section className={styles.contributions} aria-labelledby={tituloDosAportesId}>
        <h2 id={tituloDosAportesId} className={styles.sectionTitle}>Aportes</h2>
        {carregandoAportes ? (
          <p className={styles.empty} role="status">Carregando aportes…</p>
        ) : erroDosAportes ? (
          <p className={styles.error} role="alert">{erroDosAportes}</p>
        ) : aportes.length === 0 ? (
          <p className={styles.empty}>Nenhum aporte registrado.</p>
        ) : (
          <ul className={styles.contributionList}>
            {aportes.map((aporte) => (
              <li key={aporte.id} className={styles.contribution}>
                <span className={styles.contributionText}>
                  <span>{dataDoAporte(aporte.contribution_date)}</span>
                  {aporte.note ? <span className={styles.contributionNote}>{aporte.note}</span> : null}
                </span>
                <strong className={styles.contributionAmount}>{formatCurrency(aporte.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={menuAberto} onClose={() => setMenuAberto(false)} title={meta.name} size="sm">
        <div className={listaStyles.sheetActions}>
          {!concluida ? (
            <>
              <OutlineButton variant="secondary" onClick={() => { setMenuAberto(false); setEditando(true); }}>Editar meta</OutlineButton>
              <OutlineButton variant="secondary" onClick={alternarPausa}>{pausada ? 'Retomar meta' : 'Pausar meta'}</OutlineButton>
              <OutlineButton variant="secondary" onClick={() => pedirConfirmacao('concluir')}>Concluir meta</OutlineButton>
            </>
          ) : null}
          <OutlineButton variant="ghost" onClick={() => pedirConfirmacao('excluir')}>Excluir meta</OutlineButton>
        </div>
      </Modal>

      <SimplifiedConfirmModal
        open={Boolean(confirmacao)}
        onClose={() => { if (!processando) setConfirmacao(null); }}
        title={confirmacao === 'concluir' ? 'Concluir a meta?' : 'Excluir a meta?'}
        description={confirmacao === 'concluir'
          ? `"${meta.name}" vai para Concluídas e para de receber aportes.`
          : `"${meta.name}" e os aportes registrados nela serão apagados.`}
        confirmLabel={confirmacao === 'concluir' ? 'Concluir meta' : 'Excluir meta'}
        onConfirm={confirmar}
        loading={processando}
        error={erroDaConfirmacao}
      />

      {editando ? (
        <GoalForm open onClose={() => setEditando(false)} goal={meta} onSave={salvarEdicao} />
      ) : null}

      {registrando ? (
        <GoalContributions
          open
          onClose={() => setRegistrando(false)}
          goal={meta}
          contributions={aportes}
          onAdd={adicionarAporte}
          onRemove={removerAporte}
        />
      ) : null}
    </div>
  );
}
