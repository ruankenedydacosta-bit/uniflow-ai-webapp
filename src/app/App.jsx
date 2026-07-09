import AppShell from '../components/layout/AppShell';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

function App() {
  return (
    <AppShell title="Dashboard">
      <section>
        <Card variant="glass" padding="lg">
          <div
            style={{
              display: 'grid',
              gap: 'var(--uf-space-24)',
            }}
          >
            <Badge variant="secondary" dot>
              Painel de Clareza
            </Badge>

            <div
              style={{
                display: 'grid',
                gap: 'var(--uf-space-12)',
              }}
            >
              <h2>Bem-vindo à UniFlow AI</h2>
              <p>
                A base visual está pronta para evoluir para um painel simples, claro e orientado por decisões.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 'var(--uf-space-12)',
                flexWrap: 'wrap',
              }}
            >
              <Button>Conversar com a Uni</Button>
              <Button variant="outline">Ver próximos passos</Button>
            </div>
          </div>
        </Card>
      </section>
    </AppShell>
  );
}

export default App;
