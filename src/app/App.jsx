import Button from '../components/ui/Button';

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
      <section style={{ textAlign: 'center' }}>
        <h1>UniFlow AI</h1>
        <p>Design System iniciado com sucesso.</p>

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
      </section>
    </main>
  );
}

export default App;