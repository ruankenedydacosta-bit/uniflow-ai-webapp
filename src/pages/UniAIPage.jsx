import PageScaffold from './PageScaffold';

function UniAIPage() {
  return (
    <PageScaffold
      title="Uni AI"
      description="O centro conversacional da UniFlow AI, preparado para transformar contexto financeiro em orientação clara."
      badge="Inteligência em construção"
      cards={[
        {
          title: 'Conversas guiadas',
          badge: 'Mock',
          metric: '0 integrações reais',
          description: 'Fluxos simulados para estruturar perguntas, respostas e decisões futuras da Uni.',
          variant: 'glass',
          badgeVariant: 'secondary',
        },
        {
          title: 'Leitura de contexto',
          badge: 'Planejado',
          metric: 'Perfil financeiro',
          description: 'Base visual para conectar objetivos, hábitos, riscos e próximos passos.',
          badgeVariant: 'primary',
        },
        {
          title: 'Tom da Uni',
          badge: 'Cuidado',
          metric: 'Sem culpa',
          description: 'Experiência pensada para orientar sem alarmismo e reduzir esforço mental.',
          badgeVariant: 'success',
        },
      ]}
    />
  );
}

export default UniAIPage;
