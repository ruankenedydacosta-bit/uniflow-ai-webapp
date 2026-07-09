import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import { formatCurrency } from '../../../utils/formatters';

function RecentActivityList({ activities }) {
  return (
    <Card variant="default" padding="lg">
      <div className="dashboardCardHeader">
        <span>Atividades recentes</span>
        <Badge variant="outline">Atualizado</Badge>
      </div>

      <ul className="dashboardActivityList">
        {activities.map((activity) => (
          <li key={activity.id}>
            <div>
              <strong>{activity.title}</strong>
              <span>{activity.category} · {activity.date}</span>
            </div>
            <strong className={activity.type === 'expense' ? 'dashboardTone-danger' : 'dashboardTone-success'}>
              {activity.type === 'expense' ? '-' : '+'} {formatCurrency(activity.amount)}
            </strong>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default RecentActivityList;
