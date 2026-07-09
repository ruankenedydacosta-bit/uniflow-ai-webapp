import Avatar from '../../../components/ui/Avatar';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';

function DashboardGreeting({ userName, status }) {
  return (
    <header className="dashboardHero">
      <div className="dashboardHeroCopy">
        <Badge variant="secondary" dot>
          Uni analisando seu mês
        </Badge>
        <h2>Olá, {userName}. Seu futuro financeiro está ficando mais claro.</h2>
        <p>
          Organizei os sinais mais importantes para você decidir o próximo passo sem precisar caçar números.
        </p>
      </div>

      <div className="dashboardHeroAction">
        <Avatar name="Uni Flow" size="lg" status="online" />
        <Badge variant="success">{status}</Badge>
        <Button>Conversar com a Uni</Button>
      </div>
    </header>
  );
}

export default DashboardGreeting;
