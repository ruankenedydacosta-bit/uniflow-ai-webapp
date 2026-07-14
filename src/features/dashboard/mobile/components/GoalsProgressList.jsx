import HomeEmptyState from './HomeEmptyState.jsx';

function normalizeProgress(progress) {
  const numericProgress = Number(progress);
  if (!Number.isFinite(numericProgress)) return 0;
  return Math.min(100, Math.max(0, numericProgress));
}

function GoalsProgressList({ goals = [], onViewAll, onCreate }) {
  return (
    <section className="homeMobileCard" aria-labelledby="home-mobile-goals-title">
      <div className="homeMobileSectionHeader">
        <h2 id="home-mobile-goals-title">Objetivos</h2>
        {goals.length ? (
          <button type="button" className="homeMobileTextAction" onClick={onViewAll}>
            Ver todos <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>

      {goals.length ? (
        <div className="homeMobileGoalsList">
          {goals.map((goal) => {
            const progress = normalizeProgress(goal.progress);
            return (
              <div className="homeMobileGoal" key={goal.id ?? goal.title}>
                <div className="homeMobileGoalHeader">
                  <strong>{goal.title}</strong>
                  <span>{progress}%</span>
                </div>
                <div
                  className="homeMobileProgressTrack"
                  role="progressbar"
                  aria-label={`Progresso de ${goal.title}`}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={progress}
                >
                  <span style={{ '--home-mobile-progress': `${progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <HomeEmptyState
          title="Seu primeiro objetivo começa aqui"
          description="Crie uma meta para acompanhar seu avanço com clareza."
          actionLabel="Criar minha primeira meta"
          onAction={onCreate}
          icon="◎"
        />
      )}
    </section>
  );
}

export default GoalsProgressList;
