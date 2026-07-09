# Kit Base UniFlow AI

Este diretório é o ponto de entrada para qualquer agente que precise entender a UniFlow AI sem reler toda a documentação original.

## O que é a UniFlow AI

A UniFlow AI é uma plataforma financeira guiada por inteligência artificial. A proposta central não é apenas organizar dados financeiros, mas transformar informações dispersas em clareza, decisões e projeções.

O produto parte de uma decisão importante: a principal interface não deve ser uma planilha nem um formulário. Deve ser uma conversa natural com a Uni, uma consultora financeira inteligente que entende contexto, hábitos, objetivos e riscos.

## Missão do produto

Eliminar o trabalho manual da gestão financeira e transformar informações financeiras em decisões inteligentes por meio de uma IA que aprende continuamente com cada usuário.

## Promessa central

A UniFlow AI não existe para mostrar apenas o que aconteceu com o dinheiro. Ela existe para mostrar ao usuário para onde ele está indo e como chegar mais rápido aos seus objetivos financeiros.

## Princípios de produto

- O MVP deve ser pequeno.
- Cada tela deve resolver apenas um problema.
- A IA, chamada Uni, é o centro da experiência.
- Tudo deve reduzir esforço mental.
- O usuário nunca deve sentir culpa.
- A interface deve desaparecer.
- Dados são consequência; decisões são o valor.
- Toda funcionalidade precisa melhorar a vida do usuário.
- O código deve durar anos.
- Qualidade é mais importante que quantidade.

## Como a Uni deve se comportar

A Uni não é chatbot nem assistente genérica. Ela é uma consultora financeira inteligente.

Ela deve ser:

- simples;
- humana;
- respeitosa;
- didática;
- objetiva;
- acolhedora;
- profissional;
- tranquila;
- nunca arrogante;
- nunca alarmista;
- nunca julgadora.

A Uni nunca deve gerar culpa ou ansiedade. Mesmo quando houver risco, ela deve apresentar um caminho possível.

Exemplo de tom correto:

"Mantendo o ritmo atual, seu saldo pode ficar negativo em cerca de 12 dias. Posso montar um plano para evitar isso."

## Arquitetura mental do usuário

Toda tela deve ajudar o usuário a responder rapidamente:

- Como estou hoje?
- O que mudou?
- O que precisa da minha atenção?
- Qual é meu próximo passo?
- Estou evoluindo?

## Estrutura oficial do projeto

- `docs/`: documentação estratégica e decisões de produto.
- `src/styles/`: Design System.
- `src/utils/`: utilitários reutilizáveis.
- `src/components/ui/`: componentes base.
- `src/components/layout/`: layout.
- `src/features/`: módulos do produto.
- `src/services/`: integrações e serviços.

## Stack oficial documentada

- Front-end: React 19, Vite, JavaScript, React Hooks, Context API.
- Roteamento planejado: React Router.
- Backend planejado: Supabase.
- Banco planejado: PostgreSQL.
- Autenticação planejada: Supabase Auth.
- Storage planejado: Supabase Storage.
- Deploy planejado: Cloudflare.
- Versionamento: Git e GitHub.
- IA futura: OpenAI, Anthropic Claude, Gemini e modelos próprios.

## Estado real do repositório

O projeto atual está em fase inicial.

Existe:

- aplicação React + Vite;
- `src/styles` com tokens e camadas do Design System;
- `src/utils` com utilitários simples;
- `src/components/ui/Button`;
- diretórios preparados para layout, componentes compartilhados, páginas, contextos e features.

Ainda não há implementação ativa em `src` para os módulos completos descritos nos documentos de arquitetura.

## Documentos principais

- `docs/01-arquitetura`: visão de produto, arquitetura funcional, UX/UI, stack, modelo conceitual e filosofia.
- `docs/02-design-system`: referências de componentes e estilos do Design System.
- `docs/03-shared`: referências de componentes compartilhados.
- `docs/04-layout`: referências de layout.
- `docs/05-hooks`: referências de hooks.
- `docs/06-modules`: referências de módulos e serviços.
- `docs/00-master`: kit base para orientação rápida.
