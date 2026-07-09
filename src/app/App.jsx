import { useState } from 'react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Avatar from '../components/ui/Avatar';
import Loader from '../components/ui/Loader';
import Modal from '../components/ui/Modal';
import Tooltip from '../components/ui/Tooltip';
import heroImage from '../assets/hero.png';

function App() {
  const [modalOpen, setModalOpen] = useState(false);

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
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Avatar src={heroImage} alt="UniFlow AI" size="xl" status="online" />
          <Avatar name="Ruan Weber" size="lg" status="away" />
          <Avatar initials="UF" variant="rounded" status="busy" />
          <Avatar variant="square" status="offline" />
        </div>

        <div
          style={{
            marginTop: 'var(--uf-space-24)',
            display: 'flex',
            gap: 'var(--uf-space-16)',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Loader size="xs" variant="neutral" />
          <Loader size="sm" variant="primary" />
          <Loader size="md" variant="secondary" label="Sincronizando" />
          <Loader size="lg" variant="success" />
          <Loader size="xl" variant="primary" label="Carregando" />
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
          <Tooltip content="Mostra a explicação do estado atual" position="top">
            <Button variant="outline">Ver detalhes</Button>
          </Tooltip>
          <Tooltip content="Fecha esta ação sem salvar mudanças" position="right">
            <Button variant="ghost">Cancelar</Button>
          </Tooltip>
          <Button variant="success" onClick={() => setModalOpen(true)}>
            Abrir modal
          </Button>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Plano financeiro inicial"
        description="A Uni transforma objetivos em próximos passos claros."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Agora não
            </Button>
            <Button onClick={() => setModalOpen(false)}>Continuar</Button>
          </>
        }
      >
        <div
          style={{
            display: 'grid',
            gap: 'var(--uf-space-16)',
          }}
        >
          <Badge variant="secondary" dot>
            Uni AI
          </Badge>
          <p>
            Com base no seu objetivo, a Uni pode organizar prioridades, acompanhar progresso e sugerir ajustes sem
            aumentar seu esforço manual.
          </p>
          <Input label="Primeiro objetivo" placeholder="Ex: reserva de emergência" fullWidth />
        </div>
      </Modal>
    </main>
  );
}

export default App;
