import Avatar from '../../../components/ui/Avatar';
import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';

function UniInsightsCard({ insights }) {
  return (
    <Card variant="glass" padding="lg" className="dashboardInsightsCard">
      <div className="dashboardInsightHeader">
        <Avatar name="Uni" size="md" status="online" />
        <div>
          <span>Insights da Uni</span>
          <p>Sinais importantes antes dos números virarem urgência.</p>
        </div>
      </div>

      <ul className="dashboardInsightList">
        {insights.map((insight) => (
          <li key={insight}>
            <Badge variant="secondary" dot>
              Insight
            </Badge>
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default UniInsightsCard;
