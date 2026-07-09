import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';

function App() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--uf-color-bg-canvas)',
        color: 'var(--uf-color-text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--uf-space-24)',
      }}
    >
      <Card
        variant="glass"
        padding="lg"
        style={{
          textAlign: 'center',
        }}
      >
        <h1>UniFlow AI</h1>
        <p>Design System iniciado com sucesso.</p>

        <div
          style={{
            marginTop: 'var(--uf-space-24)',
            display: 'grid',
            gap: 'var(--uf-space-16)',
          }}
        >
          <Input label="Nome" placeholder="Digite seu nome" fullWidth />
          <Input label="Email" placeholder="email@exemplo.com" error="Informe um email válido." fullWidth />
          <Input
            label="Objetivo"
            placeholder="Comprar um apartamento"
            helperText="A Uni usa isso para criar uma projeção mais clara."
            fullWidth
          />
        </div>

        <div
          style={{
            marginTop: 'var(--uf-space-24)',
            display: 'flex',
            gap: 'var(--uf-space-8)',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Badge variant="default">Base</Badge>
          <Badge variant="primary" dot>
            Primário
          </Badge>
          <Badge variant="secondary">Uni AI</Badge>
          <Badge variant="success">Meta em dia</Badge>
          <Badge variant="warning">Atenção</Badge>
          <Badge variant="danger">Risco</Badge>
          <Badge variant="glass">Glass</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>

        <div
          style={{
            marginTop: 'var(--uf-space-24)',
            display: 'flex',
            gap: 'var(--uf-space-12)',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Button>Começar</Button>
          <Button variant="secondary">Uni AI</Button>
          <Button variant="outline">Ver detalhes</Button>
          <Button variant="ghost">Cancelar</Button>
        </div>
      </Card>
    </main>
  );
}

export default App;
