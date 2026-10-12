import { useMemo, useState } from 'react';
import { useSession } from '../app/SessionContext';
import FilterChips from '../components/ui/FilterChips/index.js';
import Modal from '../components/ui/Modal/Modal.jsx';
import OutlineButton from '../components/ui/OutlineButton/index.js';
import ProgressBar from '../components/ui/ProgressBar/index.js';
import { useGoals } from '../features/goals/useGoals';
import GoalListCard from '../features/goals/components/GoalListCard';
import GoalForm from '../features/goals/components/GoalForm';
import GoalCreateFlow from '../features/goals/components/GoalCreateFlow';
import GoalContributions from '../features/goals/components/GoalContributions';
import { listContributions } from '../features/goals/goalService';
import { ABAS_DE_METAS, linhaDeApoio, resumirMetasAtivas, separarPorAba } from '../features/goals/listaDeMetas.js';
import SimplifiedConfirmModal from '../features/simplified-app/SimplifiedConfirmModal.jsx';
import { PhPlusIcon } from '../features/simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../features/simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../features/simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES } from '../features/simplified-app/simplifiedRoutes.js';
import { formatCurrency } from '../utils/formatters';
import styles from './ObjetivosPage.module.css';

const LISTA_VAZIA_POR_ABA = {
  ativas: 'Nenhuma meta ativa.',
  concluidas: 'Nenhuma meta concluída ainda.',
};

// Lista de Metas (handoff 08a, #154). O toque no card abre uma folha com as
// ações da meta até a tela de detalhe (#157) existir.
export default function ObjetivosPage() {
  const navigate = useNavegar();
  const { workspace } = useSession();
  const { goals, isLoading, error, refresh, addGoal, editGoal, removeGoal, addGoalContribution, removeGoalContribution } = useGoals({ workspaceId: workspace?.id, comUltimoAporte: true });

  const [aba, setAba] = useState('ativas');
  const [metaAbertaId, setMetaAbertaId] = useState(null);
  const [metaParaExcluir, setMetaParaExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroAoExcluir, setErroAoExcluir] = useState(null);
  const [criando, setCriando] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [contributionsGoal, setContributionsGoal] = useState(null);
  const [contributions, setContributions] = useState([]);

  const { ativas, concluidas } = useMemo(() => separarPorAba(goals), [goals]);
  const resumo = useMemo(() => resumirMetasAtivas(goals), [goals]);
  const lista = aba === 'ativas' ? ativas : concluidas;
  // Lida da lista a cada render: depois de pausar ou concluir, a folha
  // mostra as ações do estado novo.
  const metaAberta = goals.find((goal) => goal.id === metaAbertaId) ?? null;

  async function handleSave(values, goalId) {
    await editGoal(goalId, values);
  }

  // A meta nova entra no topo de Ativas (useGoals põe o registro novo na
  // frente da lista).
  async function handleCreate(values) {
    const result = await addGoal(values);
    if (!result?.error) {
      setCriando(false);
      setAba('ativas');
      window.scrollTo({ top: 0 });
    }
    return result;
  }

  function handleEdit(goal) {
    setMetaAbertaId(null);
    setEditingGoal(goal);
  }

  // A folha só fecha quando os aportes chegam, para a tela não ficar vazia
  // enquanto a consulta roda.
  async function handleContribute(goal) {
    const result = await listContributions(goal.id);
    setContributions(result.data ?? []);
    setMetaAbertaId(null);
    setContributionsGoal(goal);
  }

  async function handleAddContribution(goalId, values) {
    await addGoalContribution(goalId, values);
    const result = await listContributions(goalId);
    setContributions(result.data ?? []);
  }

  // Sem saber qual aporte passa a ser o último, o refresh traz a data certa.
  async function handleRemoveContribution(goalId, contributionId, amount) {
    await removeGoalContribution(goalId, contributionId, amount);
    const result = await listContributions(goalId);
    setContributions(result.data ?? []);
    void refresh();
  }

  async function handlePauseResume(goal) {
    await editGoal(goal.id, { status: goal.status === 'active' ? 'paused' : 'active' });
  }

  async function handleComplete(goal) {
    await editGoal(goal.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
  }

  function handleAskDelete(goal) {
    setMetaAbertaId(null);
    setErroAoExcluir(null);
    setMetaParaExcluir(goal);
  }

  async function handleDelete() {
    if (!metaParaExcluir || excluindo) return;
    setExcluindo(true);
    const result = await removeGoal(metaParaExcluir.id);
    setExcluindo(false);
    if (result?.error) {
      setErroAoExcluir('Não foi possível excluir a meta. Tente de novo.');
      return;
    }
    setMetaParaExcluir(null);
  }

  return (
    <div className={styles.page} data-simplified-goals>
      <SimplifiedSubpageHeader
        title="Metas"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
        action={(
          <button type="button" className={styles.headerAction} onClick={() => setCriando(true)} aria-label="Criar meta">
            <PhPlusIcon />
          </button>
        )}
      />

      {error && !isLoading ? (
        <div className={styles.errorBanner} role="alert">
          <p>{error.message || 'Não foi possível carregar as metas.'}</p>
          {goals.length === 0 ? (
            <OutlineButton variant="secondary" onClick={() => refresh()}>Tentar novamente</OutlineButton>
          ) : null}
        </div>
      ) : null}

      {isLoading && goals.length === 0 ? (
        <p className={styles.state} role="status">Carregando metas…</p>
      ) : goals.length === 0 ? (
        error ? null : (
          <div className={styles.state}>
            <p className={styles.stateTitle}>Nenhuma meta ainda</p>
            <p>Crie uma meta para ver quanto falta e quanto guardar por mês.</p>
            <OutlineButton onClick={() => setCriando(true)}>Criar meta</OutlineButton>
          </div>
        )
      ) : (
        <>
          {resumo.quantidade > 0 ? (
            <section className={styles.summary} aria-label="Resumo das metas ativas">
              <span className={styles.summaryLabel}>
                {resumo.quantidade === 1 ? 'Guardado em 1 meta' : `Guardado em ${resumo.quantidade} metas`}
              </span>
              <strong className={styles.summaryValue}>{formatCurrency(resumo.guardado)}</strong>
              <ProgressBar value={resumo.progresso} tone="green" />
              <span className={styles.summaryNote}>
                {`${resumo.progresso}% de ${formatCurrency(resumo.total)} no total.`}
              </span>
            </section>
          ) : null}

          <FilterChips label="Metas por situação" options={ABAS_DE_METAS} value={aba} onChange={setAba} />

          {lista.length === 0 ? (
            <p className={styles.state}>{LISTA_VAZIA_POR_ABA[aba]}</p>
          ) : (
            <ul className={styles.list}>
              {lista.map((goal) => (
                <li key={goal.id}>
                  <GoalListCard goal={goal} onOpen={(meta) => setMetaAbertaId(meta.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal
        open={Boolean(metaAberta)}
        onClose={() => setMetaAbertaId(null)}
        title={metaAberta?.name}
        description={metaAberta ? linhaDeApoio(metaAberta) : undefined}
        size="sm"
      >
        {metaAberta ? (
          <div className={styles.sheetActions}>
            {metaAberta.status === 'active' ? (
              <>
                <OutlineButton onClick={() => handleContribute(metaAberta)}>Registrar aporte</OutlineButton>
                <OutlineButton variant="secondary" onClick={() => handleEdit(metaAberta)}>Editar meta</OutlineButton>
                <OutlineButton variant="secondary" onClick={() => handlePauseResume(metaAberta)}>Pausar meta</OutlineButton>
                <OutlineButton variant="secondary" onClick={() => handleComplete(metaAberta)}>Concluir meta</OutlineButton>
              </>
            ) : null}
            {metaAberta.status === 'paused' ? (
              <>
                <OutlineButton onClick={() => handlePauseResume(metaAberta)}>Retomar meta</OutlineButton>
                <OutlineButton variant="secondary" onClick={() => handleEdit(metaAberta)}>Editar meta</OutlineButton>
              </>
            ) : null}
            <OutlineButton variant="ghost" onClick={() => handleAskDelete(metaAberta)}>Excluir meta</OutlineButton>
          </div>
        ) : null}
      </Modal>

      <SimplifiedConfirmModal
        open={Boolean(metaParaExcluir)}
        onClose={() => { if (!excluindo) setMetaParaExcluir(null); }}
        title="Excluir a meta?"
        description={metaParaExcluir ? `"${metaParaExcluir.name}" e os aportes registrados nela serão apagados.` : ''}
        confirmLabel="Excluir meta"
        onConfirm={handleDelete}
        loading={excluindo}
        error={erroAoExcluir}
      />

      {criando ? (
        <GoalCreateFlow onClose={() => setCriando(false)} onCreate={handleCreate} />
      ) : null}

      {editingGoal ? (
        <GoalForm
          key={editingGoal.id}
          open
          onClose={() => setEditingGoal(null)}
          goal={editingGoal}
          onSave={handleSave}
        />
      ) : null}

      {contributionsGoal ? (
        <GoalContributions
          open
          onClose={() => setContributionsGoal(null)}
          goal={contributionsGoal}
          contributions={contributions}
          onAdd={handleAddContribution}
          onRemove={handleRemoveContribution}
        />
      ) : null}
    </div>
  );
}
