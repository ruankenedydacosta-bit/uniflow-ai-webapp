import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import { formatCurrency } from '../../../utils/formatters';

function GoalsSummaryCard({ goals }) {
  return (
    <Card variant="default" padding="lg">
      <div className="dashboardCardHeader">
        <span>Metas financeiras</span>
        <Badge variant="secondary">{goals.length} ativas</Badge>
      </div>

      <div className="dashboardGoals">
        {goals.map((goal) => (
          <article key={goal.id} className="dashboardGoal">
            <div className="dashboardGoalHeader">
              <div>
                <strong>{goal.title}</strong>
                <span>{formatCurrency(goal.current)} de {formatCurrency(goal.target)}</span>
              </div>
              <Badge variant={goal.status === 'Atenção' ? 'warning' : goal.status === 'Saudável' ? 'success' : 'primary'}>
                {goal.status}
              </Badge>
            </div>
            <div className="dashboardProgress" aria-label={`${goal.title}: ${goal.progress}%`}>
              <span style={{ width: `${goal.progress}%` }} />
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

export default GoalsSummaryCard;
