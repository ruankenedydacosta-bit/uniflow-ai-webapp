import { cx } from '../../lib/cx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';

/**
 * UniInsightsCard — docx 3.1 ("Insights da Uni"). Sem o Motor de
 * Projeção Financeira (GPS Financeiro) implementado ainda, este card
 * não simula insights falsos — mostra um estado vazio honesto. Quando o
 * Motor existir, só `dashboardService.getUniInsights` muda.
 */
export default function UniInsightsCard({ insights, loading }) {
  return (
    <Card variant="glass">
      <CardHeader>
        <div className="uf-flex uf-items-center uf-gap-sm">
          <Avatar name="Uni" size="sm" />
          <span className="uf-text-title uf-text-ai">Insights da Uni</span>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <p className="uf-text-caption uf-text-tertiary uf-animate-fade-in">Uni está analisando...</p>
        ) : insights.length === 0 ? (
          <p className="uf-text-caption uf-text-tertiary">
            Ainda não tenho insights suficientes — quanto mais você usar a UniFlow AI, mais eu aprendo.
          </p>
        ) : (
          <ul className="uf-flex uf-flex-column uf-gap-md">
            {insights.map((insight, index) => (
              <li key={insight.id ?? index} className={cx('uf-text-caption', 'uf-text-primary', 'uf-animate-fade-in', `uf-stagger-${Math.min(index + 1, 6)}`)}>
                💡 {insight.mensagem}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
