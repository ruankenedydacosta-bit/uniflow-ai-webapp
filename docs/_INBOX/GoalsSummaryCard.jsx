import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';
import ProgressBar from '../../components/shared/ProgressBar';

export default function GoalsSummaryCard({ goals, loading }) {
  return (
    <Card variant="surface">
      <CardHeader>
        <span className="uf-text-title">Metas</span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="uf-flex uf-justify-center uf-p-lg">
            <Loader variant="dots" label="Carregando metas" />
          </div>
        ) : goals.length === 0 ? (
          <p className="uf-text-caption uf-text-tertiary">
            Você ainda não tem metas. Conte pra Uni onde quer chegar.
          </p>
        ) : (
          <ul className="uf-flex uf-flex-column uf-gap-lg">
            {goals.map((goal) => (
              <li key={goal.id} className="uf-flex uf-flex-column uf-gap-sm">
                <div className="uf-flex uf-justify-between">
                  <span className="uf-text-caption uf-text-primary">{goal.titulo}</span>
                  <span className="uf-text-micro uf-text-tertiary">{goal.progresso ?? 0}%</span>
                </div>
                <ProgressBar value={goal.progresso ?? 0} label={goal.titulo} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
