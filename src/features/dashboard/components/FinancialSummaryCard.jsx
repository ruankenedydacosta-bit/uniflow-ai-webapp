import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import { formatCurrency } from '../../../utils/formatters';

function FinancialSummaryCard({ financial }) {
  return (
    <>
      <Card variant="glass" padding="lg">
        <div className="dashboardCardHeader">
          <span>Saldo projetado</span>
          <Badge variant="success">{financial.status}</Badge>
        </div>
        <strong className="dashboardMetric">{formatCurrency(financial.balance)}</strong>
        <p className="dashboardMuted">{financial.balanceTrend}</p>
      </Card>

      <Card variant="default" padding="lg">
        <div className="dashboardCardHeader">
          <span>Receitas e despesas</span>
          <Badge variant="primary">Em análise</Badge>
        </div>

        <div className="dashboardRows">
          <MetricRow label="Receitas" value={financial.income} tone="success" />
          <MetricRow label="Despesas" value={financial.expenses} tone="danger" />
          <MetricRow label="Economia" value={financial.savings} tone="primary" />
        </div>
      </Card>
    </>
  );
}

function MetricRow({ label, value, tone }) {
  return (
    <div className="dashboardRow">
      <span>{label}</span>
      <strong className={`dashboardTone-${tone}`}>{formatCurrency(value)}</strong>
    </div>
  );
}

export default FinancialSummaryCard;
