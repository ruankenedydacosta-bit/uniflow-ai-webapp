import { useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { useGoals } from '../features/goals/useGoals';
import GoalCard from '../features/goals/components/GoalCard';
import GoalSummary from '../features/goals/components/GoalSummary';
import GoalForm from '../features/goals/components/GoalForm';
import GoalContributions from '../features/goals/components/GoalContributions';
import GoalSkeleton from '../features/goals/components/GoalSkeleton';
import { listContributions } from '../features/goals/goalService';
import { calcActiveGoals } from '../features/goals/goalCalc';
import styles from './ObjetivosPage.module.css';

function getWorkspaceLabel(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? 'Pessoal' : 'Empresarial';
}

export default function ObjetivosPage() {
  const { access } = useAccess();
  const { workspace } = useSession();
  const { goals, isLoading, addGoal, editGoal, removeGoal, addGoalContribution, removeGoalContribution } = useGoals({ workspaceId: workspace?.id });

  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [contributionsOpen, setContributionsOpen] = useState(false);
  const [contributionsGoal, setContributionsGoal] = useState(null);
  const [contributions, setContributions] = useState([]);

  const activeCount = calcActiveGoals(goals).length;

  async function handleSave(values, goalId) {
    if (goalId) {
      await editGoal(goalId, values);
    } else {
      await addGoal(values);
    }
  }

  function handleEdit(goal) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  function handleNewGoal() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  async function handleContribute(goal) {
    setContributionsGoal(goal);
    const result = await listContributions(goal.id);
    setContributions(result.data ?? []);
    setContributionsOpen(true);
  }

  async function handleAddContribution(goalId, values) {
    await addGoalContribution(goalId, values);
    const result = await listContributions(goalId);
    setContributions(result.data ?? []);
  }

  async function handleRemoveContribution(goalId, contributionId, amount) {
    await removeGoalContribution(goalId, contributionId, amount);
    const result = await listContributions(goalId);
    setContributions(result.data ?? []);
  }

  async function handlePauseResume(goal) {
    const newStatus = goal.status === 'active' ? 'paused' : 'active';
    await editGoal(goal.id, { status: newStatus });
  }

  async function handleComplete(goal) {
    await editGoal(goal.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
  }

  async function handleDelete(goal) {
    if (!window.confirm(`Excluir a meta "${goal.name}"?`)) return;
    await removeGoal(goal.id);
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {getWorkspaceLabel(access.currentWorkspace)}
          </Badge>
          <h2 id="objetivos-title">Metas</h2>
          <p>{activeCount > 0 ? `${activeCount} meta${activeCount !== 1 ? 's' : ''} ativa${activeCount !== 1 ? 's' : ''}` : 'Crie sua primeira meta financeira'}</p>
        </div>
        <div className={styles.actions}>
          <Button onClick={handleNewGoal}>Nova meta</Button>
        </div>
      </section>

      {!isLoading && goals.length > 0 && (
        <GoalSummary goals={goals} />
      )}

      <section aria-labelledby="goals-list-title">
        <div className={styles.sectionHeader}>
          <h3 id="goals-list-title">
            {isLoading ? 'Carregando...' : `Todas as metas (${goals.length})`}
          </h3>
        </div>

        {isLoading ? (
          <GoalSkeleton />
        ) : goals.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎯</div>
            <p className={styles.emptyTitle}>Nenhuma meta ainda</p>
            <p className={styles.emptyText}>Crie sua primeira meta financeira para começar a acompanhar seu progresso.</p>
            <Button onClick={handleNewGoal}>Criar meta</Button>
          </div>
        ) : (
          <div className={styles.goalsGrid}>
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onContribute={handleContribute}
                onPauseResume={handlePauseResume}
                onComplete={handleComplete}
              />
            ))}
          </div>
        )}
      </section>

      <GoalForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        goal={editingGoal}
        onSave={handleSave}
      />

      {contributionsGoal && (
        <GoalContributions
          open={contributionsOpen}
          onClose={() => setContributionsOpen(false)}
          goal={contributionsGoal}
          contributions={contributions}
          onAdd={handleAddContribution}
          onRemove={handleRemoveContribution}
        />
      )}
    </div>
  );
}
