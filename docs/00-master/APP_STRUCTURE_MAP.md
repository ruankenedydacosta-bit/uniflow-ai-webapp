# App Structure Map

Este documento define o mapa oficial da estrutura do aplicativo UniFlow AI.

Ele deve ser lido antes de criar novas telas, refinar modulos ou expandir a navegacao. O objetivo e manter a evolucao do WebApp coerente com a arquitetura oficial em `docs/01-arquitetura`, com os modos de uso, com o Design System e com as referencias visuais/comportamentais em `docs/08-references`.

## 1. Objetivo do app

A UniFlow AI e um aplicativo financeiro guiado pela Uni, uma consultora financeira inteligente.

O app nao deve ser uma planilha bonita nem um ERP generico. Ele deve transformar dados financeiros em clareza, orientacao e proximos passos.

Pela arquitetura oficial, a UniFlow AI tambem deve funcionar como um GPS financeiro: mostrar onde o usuario esta, para onde esta indo, quais obstaculos existem e qual rota pode aproximar o usuario dos seus objetivos.

O usuario deve conseguir responder rapidamente:

- como estou hoje;
- o que mudou;
- o que precisa da minha atencao;
- qual e meu proximo passo;
- se estou evoluindo.

A interface deve reduzir carga cognitiva. A Uni deve ser o centro da experiencia, mas sem tomar decisoes pelo usuario. O usuario compra clareza sobre o futuro financeiro, nao apenas organizacao de dados.

## 2. Fontes oficiais e hierarquia

### Fonte principal: `docs/01-arquitetura`

`docs/01-arquitetura` e a fonte principal para estrutura, escopo, filosofia, modelo conceitual, jornada do usuario, papel da Uni, stack oficial e prioridades do produto.

Documentos considerados nesta revisao:

- `UNIFLOW AI ARQUITETURA FUNCIONAL DO PRODUTO-2.docx`: define a jornada completa, os 12 modulos oficiais, Painel de Clareza, navegacao simples, regra dos 5 segundos, regra dos 3 cliques e ciclo diario.
- `GPS Financeiro-2.docx`: define a UniFlow AI como visao de futuro financeiro, nao apenas controle do passado.
- `Qual Dor Resolvemos.docx`: define a dor central como decisao financeira dificil por dados espalhados e trabalho manual.
- `UNI OS (Sistema Operacional Cognitivo da Uni)-2.docx`: define a Uni como consultora financeira inteligente, seus niveis de compreensao, memoria, tom e ciclo de raciocinio.
- `Mapa Cognitivo do Usuario-2.docx`: define adaptacao ao perfil cognitivo, comunicacao sem culpa e construcao de confianca.
- `4.1 Modelo Conceitual-3.docx`: define entidades como Usuario, Empresa, Funcionarios, Movimentacoes, Categorias, Metas, Planejamentos, Projecoes, IA, Conversas, Notificacoes, Configuracoes, Assinaturas, Permissoes e Logs.
- `5.1 Stack Tecnologica Oficial.docx`: define React, Vite, React Router, Context API, Supabase, PostgreSQL, Supabase Auth, Supabase Storage, Cloudflare, Git/GitHub e IA futura multi-modelo.
- `UX_UI DA UNIFLOW AI-2.docx`: define wireframe antes de layout, componentes reutilizaveis, Design System, acessibilidade, personalidade visual e motion calmo.
- `A filosofia de desenvolvimento.docx`: define MVP pequeno, uma tela por problema, Uni no centro, reducao de esforco mental, ausencia de culpa e qualidade acima de quantidade.
- `PHASE_1_README.md`: registra a direcao de login, cadastro, onboarding inteligente, AuthContext e Supabase como fase estrutural futura.
- `ARQUITETURA.md`: documenta arquitetura planejada para Projetos e reforca decisoes estruturais de modulos empresariais.
- `Planejamento do Claude.docx`: reforca documentacao, clean code, componentes pequenos, services, hooks, seguranca, testes e prompts oficiais.

Decisao: quando houver conflito, `docs/01-arquitetura` vence. Este mapa deve refletir primeiro a arquitetura funcional e cognitiva da UniFlow AI.

### Fonte secundaria: `docs/08-references`

`docs/08-references` nao e arquivo antigo. E uma referencia oficial de sensacao, ritmo, comportamento e identidade visual, mas nao define sozinha a estrutura do aplicativo.

A pasta contem a experiencia `landing-uni-demo`, que mostra a promessa central da UniFlow AI:

- dashboard financeiro vivo;
- microfone como captura de baixo atrito;
- ondas de escuta;
- transcricao;
- analise em etapas;
- resposta consultiva;
- dashboard reagindo depois da resposta da Uni.

O WebApp deve parecer a continuacao natural dessa Landing Page, mas com controle real do usuario e obedecendo a arquitetura de `docs/01-arquitetura`.

### Referencias consideradas

- `docs/08-references/landing-uni-demo/index.html`: estrutura visual da demo, mockup de dashboard e tela de voz.
- `docs/08-references/landing-uni-demo/style.css`: linguagem visual escura, premium, gradientes azul/roxo/verde, cards translucidios, brilho contido e atmosfera financeira.
- `docs/08-references/landing-uni-demo/uni-demo.css`: microfone, ondas, transcricao, pensamento da Uni, resposta e reacao do dashboard.
- `docs/08-references/landing-uni-demo/uni-demo_data.js`: narrativa financeira simulada, estado que evolui, frases consultivas e proximas perguntas.
- `docs/08-references/landing-uni-demo/uni-demo_motion.js`: ritmo de transicoes, escuta, transcricao, analise e resposta.
- `docs/08-references/landing-uni-demo/uni-demo_chat.js`: comportamento visual da voz, estados de escuta, transcricao, analise e resposta.
- `docs/08-references/landing-uni-demo/uni-demo_dashboard.js`: dashboard reagindo somente depois da resposta da Uni.
- `docs/08-references/landing-uni-demo/uni-demo_timeline.js`: sequencia oficial da experiencia: tocar microfone, ouvir, transcrever, analisar, responder e atualizar contexto.
- `docs/00-master/UNI_AI_EXPERIENCE_REFERENCE.md`: traducao oficial da Landing Demo para o WebApp.

### O que preservar

- visual escuro, premium, tecnologico e financeiro;
- microfone como acao central de captura rapida;
- linguagem humana, calma, didatica e sem culpa;
- analise em etapas no lugar de loading generico;
- respostas consultivas, nao decisorias;
- dashboard reagindo depois da resposta;
- motion suave e respeitosa;
- cards com dados financeiros claros, sem poluir a tela.

### Limite da referencia visual

As referencias da Landing devem orientar identidade, motion, microfone, transcricao, analise em etapas e reacao visual. Elas nao devem substituir o mapa de modulos, a jornada mental do usuario, o modelo conceitual nem as prioridades de MVP definidas em `docs/01-arquitetura`.

### O que nao copiar cegamente

- loop automatico infinito;
- mockup de celular dentro do app;
- orbs e elementos decorativos de marketing;
- DOM global e scripts `window.UniDemo`;
- tempos teatrais que atrasem o usuario;
- dashboard reagindo sem acao real;
- promessas de automacao ainda nao implementadas.

## 3. Estrutura pessoal e empresarial

A UniFlow AI deve ser um unico WebApp com experiencias diferentes por modo.

### Modo pessoal

Foco em organizacao financeira pessoal, renda, despesas, reserva, metas, agenda financeira e relatorios simples.

Pessoa fisica nao deve ver CRM, Clientes, Equipe ou modulos empresariais.

### Modo empresarial

Foco em gestao financeira profissional, clientes, CRM, projetos, agenda operacional, relatorios empresariais e equipe futura.

Empresario deve sentir que tem recursos profissionais, mas sem cair em uma experiencia pesada de ERP.

### Modo pessoal + empresa

O usuario pode alternar entre espaco pessoal e empresarial.

Esse modo nao deve misturar dados. O espaco atual deve ficar claro para a Uni, para a navegacao e para os cards.

## 4. Modulos do modo pessoal

- Dashboard / Painel de Clareza
- Uni AI
- Financeiro (Receitas, Despesas e Fluxo de Caixa)
- Metas / Objetivos
- Agenda
- Relatorios
- Configuracoes

## 5. Modulos do modo empresarial

- Dashboard / Painel de Clareza
- Uni AI
- Financeiro (Receitas, Despesas e Fluxo de Caixa)
- CRM
- Clientes
- Projetos
- Agenda
- Relatorios
- Configuracoes
- Equipe futuro

## 6. Catalogo oficial de modulos

Cada modulo deve ser criado como uma tela pequena, com dados mockados locais, antes de qualquer backend real.

### Relacao entre arquitetura oficial e navegacao atual

A arquitetura funcional oficial define 12 grandes modulos:

1. Login
2. Onboarding Inteligente
3. Perfil
4. Empresas
5. Painel de Clareza
6. Receitas
7. Despesas
8. Fluxo de Caixa
9. Objetivos
10. Uni
11. Relatorios
12. Configuracoes

A navegacao atual do WebApp usa nomes mais operacionais:

- `Dashboard` representa o Painel de Clareza.
- `Financeiro` agrupa Receitas, Despesas e Fluxo de Caixa.
- `Metas` representa Objetivos.
- `Uni AI` representa a Central de Inteligencia Uni.
- `CRM`, `Clientes`, `Projetos` e `Equipe futuro` complementam o modo empresarial.

Essa traducao existe para evoluir em passos pequenos sem perder a arquitetura oficial.

### Dashboard / Painel de Clareza

Objetivo: responder "Como esta minha vida financeira hoje?" em menos de cinco segundos.

Este modulo substitui o dashboard tradicional. Ele deve mostrar onde o usuario esta, para onde esta indo, o que mudou, o que pede atencao e qual e a proxima acao recomendada.

Principais cards:

- saldo ou caixa projetado;
- futuro financeiro projetado;
- receitas e despesas;
- metas ou objetivos;
- insight da Uni;
- atividades recentes;
- proximos passos.

Principais acoes:

- registrar movimentacao;
- pedir analise da Uni;
- abrir detalhe de fluxo de caixa;
- revisar despesas em atencao.

Dados mockados necessarios:

- usuario;
- saldo;
- receitas;
- despesas;
- metas;
- atividades;
- status financeiro;
- recomendacoes.

Dados reais futuros no Supabase:

- `profiles`;
- `workspaces`;
- `transactions`;
- `goals`;
- `activities`;
- `insights`;
- `recommendations`.

Relacao com a Uni AI:

- a Uni deve explicar os sinais do dashboard;
- a Uni deve recomendar proximos passos;
- a Uni pode gerar reacoes visuais no dashboard apos uma conversa;
- o dashboard deve reagir somente depois de resposta ou confirmacao da Uni;
- a Uni deve apresentar, no maximo, tres prioridades realmente uteis.

Identidade das referencias:

- usar cards financeiros escuros e vivos;
- manter dados claros e poucos indicadores por tela;
- usar badges como "Saudavel", "Atencao" e "Em analise";
- preservar a sensacao de painel que responde ao contexto, nao de dashboard estatico.

### Uni AI

Objetivo: ser a Central de Inteligencia da UniFlow AI.

A Uni nao e chatbot. Ela e uma consultora financeira inteligente que organiza, interpreta, preve, explica, acompanha e aprende junto com o usuario.

Principais cards:

- palco do microfone;
- conversa/orientacao;
- etapas de analise;
- contexto usado pela Uni;
- resposta consultiva;
- sugestoes iniciais.

Principais acoes:

- falar com a Uni;
- digitar pergunta;
- escolher sugestao;
- ouvir resposta;
- parar audio;
- pedir explicacao ou proximo passo.

Dados mockados necessarios:

- mensagens iniciais;
- contexto financeiro usado pela Uni;
- sugestoes contextuais;
- respostas por palavras-chave;
- estados de experiencia;
- sinais para painel lateral.

Dados reais futuros no Supabase:

- `conversations`;
- `messages`;
- `voice_captures`;
- `financial_context_snapshots`;
- `ai_recommendations`;
- `user_preferences`.
- `cognitive_memory`;
- `recommendation_history`.

Relacao com a Uni AI:

- este e o modulo central da Uni;
- todos os outros modulos devem poder enviar contexto para a Uni;
- a Uni deve orientar, organizar e recomendar, mas nunca decidir pelo usuario;
- a Uni deve responder internamente: o que aconteceu, por que aconteceu e qual e a melhor orientacao agora;
- a Uni deve aprender padroes, nao eventos isolados;
- a Uni nunca deve perguntar algo que ja sabe.

Identidade das referencias:

- microfone deve ser protagonista;
- ondas e feedback visual devem ser calmos;
- analise em etapas substitui spinner generico;
- resposta deve ser humana, didatica e sem alarmismo;
- a experiencia deve lembrar a Landing Demo, mas controlada pelo usuario.

### Financeiro

Objetivo: concentrar Receitas, Despesas e Fluxo de Caixa para alimentar a clareza financeira e o Motor de Projecao Financeira.

Financeiro nao existe para o usuario preencher formularios. Ele existe para reduzir trabalho manual e transformar movimentacoes em entendimento do presente e projecao do futuro.

Principais cards:

- saldo projetado;
- fluxo de caixa;
- receitas previstas;
- despesas em atencao;
- categorias;
- recebiveis;
- vencimentos.
- oportunidades detectadas pela Uni.

Principais acoes:

- registrar receita;
- registrar despesa;
- registrar por voz ou frase natural;
- revisar categorias;
- simular fluxo de caixa;
- pedir leitura da Uni.

Dados mockados necessarios:

- lista de transacoes;
- categorias;
- receitas recorrentes;
- despesas recorrentes;
- saldo atual;
- saldo projetado;
- alertas.

Dados reais futuros no Supabase:

- `transactions`;
- `categories`;
- `recurring_transactions`;
- `cashflow_snapshots`;
- `payment_methods`;
- `attachments`.

Relacao com a Uni AI:

- a Uni deve explicar variacoes;
- identificar padroes;
- sugerir priorizacao;
- transformar transacoes em leitura de fluxo;
- categorizar automaticamente quando houver contexto;
- projetar saldo futuro e impacto em objetivos.

Identidade das referencias:

- valores com destaque forte;
- status financeiro claro;
- cards de alerta sem drama;
- motion discreto para atualizacao de valores.

### Metas / Objetivos

Objetivo: acompanhar objetivos financeiros pessoais ou empresariais com estrategia, progresso e sentido de futuro.

Pela arquitetura oficial, Objetivos e um modulo psicologico, nao apenas financeiro. Comprar casa, trocar carro, abrir empresa, viajar, aposentar, investir ou quitar dividas sao destinos do GPS financeiro.

Principais cards:

- progresso da meta;
- valor alvo;
- prazo;
- importancia;
- probabilidade;
- contribuicao sugerida;
- risco de atraso;
- impacto no fluxo.

Principais acoes:

- criar meta;
- atualizar valor;
- pedir plano da Uni;
- simular prazo;
- priorizar metas.
- recalcular rota quando o usuario sair do caminho.

Dados mockados necessarios:

- nome da meta;
- valor alvo;
- valor atual;
- prazo;
- status;
- contribuicao mensal;
- prioridade;
- importancia;
- probabilidade.

Dados reais futuros no Supabase:

- `goals`;
- `goal_contributions`;
- `goal_milestones`;
- `goal_recommendations`;
- `workspace_goals`.

Relacao com a Uni AI:

- a Uni deve explicar se a meta esta saudavel;
- sugerir ajustes;
- conectar meta com fluxo de caixa;
- evitar julgamento quando houver atraso;
- acompanhar diariamente quando fizer sentido;
- explicar como pequenas mudancas antecipam ou atrasam o destino.

Identidade das referencias:

- progresso visual premium;
- textos de encorajamento calmos;
- recomendacoes praticas;
- evitar gamificacao exagerada.

### Agenda

Objetivo: organizar compromissos, vencimentos, lembretes e decisoes financeiras.

Principais cards:

- eventos de hoje;
- proximos vencimentos;
- decisoes pendentes;
- lembretes da Uni;
- semana financeira.

Principais acoes:

- criar lembrete;
- marcar como resolvido;
- pedir priorizacao;
- revisar semana;
- conectar vencimento a uma transacao.

Dados mockados necessarios:

- eventos;
- vencimentos;
- lembretes;
- status;
- prioridade;
- origem do evento.

Dados reais futuros no Supabase:

- `calendar_events`;
- `reminders`;
- `due_dates`;
- `notifications`;
- `tasks`.

Relacao com a Uni AI:

- a Uni deve lembrar sem pressionar;
- explicar impacto de vencimentos;
- sugerir ordem de acao;
- ajudar a planejar a semana.

Identidade das referencias:

- alertas discretos;
- nada de urgencia artificial;
- foco em clareza temporal;
- cards compactos e acionaveis.

### Relatorios

Objetivo: transformar dados em narrativas claras, nao em planilhas frias.

Principais cards:

- resumo mensal;
- comparativo de categorias;
- tendencias;
- oportunidades;
- riscos;
- exportacoes futuras.

Principais acoes:

- gerar resumo;
- comparar periodo;
- pedir explicacao da Uni;
- exportar no futuro;
- salvar leitura.

Dados mockados necessarios:

- periodo;
- variacao;
- categorias;
- insights;
- tendencias;
- comparativos.

Dados reais futuros no Supabase:

- `reports`;
- `report_snapshots`;
- `analytics_events`;
- `financial_summaries`;
- `exports`.

Relacao com a Uni AI:

- a Uni deve narrar o relatorio;
- destacar o que importa;
- explicar mudancas;
- sugerir proximas acoes.

Identidade das referencias:

- relatorio deve parecer leitura executiva premium;
- menos tabelas, mais clareza;
- graficos simples;
- frases curtas e orientativas.

### Configuracoes

Objetivo: concentrar preferencias, conta, seguranca, plano, notificacoes e ajustes da Uni.

Principais cards:

- perfil;
- plano;
- personalidade e tom inicial da Uni;
- notificacoes;
- seguranca;
- privacidade;
- integracoes futuras.

Principais acoes:

- editar preferencias;
- ajustar perfil de comunicacao e notificacoes da Uni;
- trocar plano no futuro;
- gerenciar espacos;
- revisar privacidade.

Dados mockados necessarios:

- nome;
- email fake;
- plano atual;
- modo de uso;
- preferencias;
- perfil de personalidade mockado (`balanced`, `direct`, `warm` ou
  `strategic`);
- status de seguranca.

Dados reais futuros no Supabase:

- `profiles`;
- `user_settings`;
- `user_preferences.uni_personality_profile` futuro;
- `plans`;
- `subscriptions`;
- `notification_preferences`;
- `security_settings`.

Relacao com a Uni AI:

- a Uni deve respeitar preferencias;
- usar modo e plano como contexto;
- usar a preferencia explicita como base e adaptar linguagem de forma gradual;
- preservar a identidade central definida em `UNI_PERSONALITY_V1.md`;
- explicar configuracoes sem tecnicismo.

Identidade das referencias:

- configuracoes devem ser silenciosas e confiaveis;
- evitar tela burocratica;
- usar linguagem humana;
- deixar claro o espaco atual.

### CRM

Objetivo: ajudar empresas a acompanhar relacionamento comercial, oportunidades e sinais de risco.

Principais cards:

- pipeline;
- oportunidades;
- clientes ativos;
- risco de churn;
- proximas interacoes.

Principais acoes:

- criar oportunidade;
- registrar contato;
- pedir priorizacao da Uni;
- revisar cliente em risco;
- converter oportunidade em projeto.

Dados mockados necessarios:

- oportunidades;
- estagios;
- valores;
- clientes;
- tags;
- atividades comerciais.

Dados reais futuros no Supabase:

- `customers`;
- `deals`;
- `deal_stages`;
- `crm_activities`;
- `customer_notes`;
- `customer_tags`.

Relacao com a Uni AI:

- a Uni deve sugerir proxima acao comercial;
- cruzar oportunidade com fluxo de caixa;
- alertar risco sem alarmismo;
- ajudar a priorizar clientes.

Identidade das referencias:

- CRM deve parecer financeiro e estrategico, nao apenas lista de contatos;
- cards devem mostrar impacto financeiro;
- motion deve ser discreto e profissional.

### Clientes

Objetivo: centralizar empresas, pessoas, historico, contratos e contexto financeiro por cliente.

Principais cards:

- clientes ativos;
- receita por cliente;
- historico recente;
- inadimplencia ou risco;
- proximas interacoes.

Principais acoes:

- criar cliente;
- editar dados;
- registrar nota;
- ver historico;
- pedir resumo da Uni.

Dados mockados necessarios:

- nome;
- empresa;
- status;
- tags;
- receita associada;
- historico;
- responsavel.

Dados reais futuros no Supabase:

- `customers`;
- `customer_contacts`;
- `customer_history`;
- `contracts`;
- `invoices`;
- `customer_segments`.

Relacao com a Uni AI:

- a Uni deve resumir historico;
- apontar clientes importantes;
- explicar impacto financeiro;
- sugerir follow-ups.

Identidade das referencias:

- cliente deve ser visto como contexto de decisao;
- evitar CRM pesado;
- usar badges e resumo financeiro claro.

### Projetos

Objetivo: acompanhar entregas, prazos, responsaveis e impacto financeiro das iniciativas.

Principais cards:

- projetos ativos;
- prazos criticos;
- orcamento;
- margem prevista;
- entregas recentes.

Principais acoes:

- criar projeto;
- atualizar status;
- revisar prazo;
- pedir analise da Uni;
- conectar projeto a cliente e financeiro.

Dados mockados necessarios:

- nome do projeto;
- cliente;
- responsavel;
- prazo;
- status;
- orcamento;
- custo previsto.

Dados reais futuros no Supabase:

- `projects`;
- `project_tasks`;
- `project_members`;
- `project_budgets`;
- `project_timeline`;
- `project_financials`.

Relacao com a Uni AI:

- a Uni deve cruzar prazo, custo e caixa;
- destacar gargalos;
- sugerir priorizacao;
- resumir status para decisao.

Identidade das referencias:

- projetos devem ser apresentados como impacto financeiro e operacional;
- visual deve ser organizado, sem kanban complexo no MVP;
- usar poucos cards antes de views avancadas.

### Equipe futuro

Objetivo: permitir gestao de pessoas, papeis, permissoes e responsabilidades em empresas maiores.

Principais cards:

- membros;
- papeis;
- responsaveis por projetos;
- permissoes;
- atividades recentes.

Principais acoes:

- convidar membro;
- definir permissao;
- atribuir responsabilidade;
- revisar atividade.

Dados mockados necessarios:

- membros fake;
- cargos;
- permissoes;
- responsaveis;
- atividade.

Dados reais futuros no Supabase:

- `team_members`;
- `roles`;
- `permissions`;
- `invitations`;
- `audit_logs`.

Relacao com a Uni AI:

- a Uni deve respeitar permissoes;
- explicar responsabilidades;
- sugerir responsaveis quando houver contexto;
- nunca expor dados fora do escopo permitido.

Identidade das referencias:

- modulo futuro, profissional e discreto;
- nao deve aparecer no MVP pessoal;
- deve transmitir seguranca e controle.

## 7. O que entra no MVP demo

O MVP demo deve provar a promessa da UniFlow AI sem backend real.

Entra:

- AppShell com Sidebar, Topbar e seletor demo de acesso;
- filtros de navegacao por modo/plano usando acesso demo;
- Dashboard evoluido como Painel de Clareza, com dados mockados, futuro financeiro e proximos passos;
- Uni AI com chat local, sugestoes, microfone, analise em etapas, resposta mockada e audio local;
- Financeiro com Receitas, Despesas e Fluxo de Caixa mockados;
- Metas/Objetivos no modo pessoal;
- Agenda com vencimentos e lembretes mockados;
- Relatorios com leitura clara e narrativa;
- CRM e Projetos em modo empresarial com escopo simples;
- Configuracoes com perfil/plano/preferencias mockadas;
- esboco documentado de Login e Onboarding Inteligente, sem autenticacao real ainda;
- documentacao atualizada antes de cada modulo maior.

O MVP demo nao precisa ter:

- Supabase real;
- autenticacao real;
- IA real;
- importacao bancaria;
- pagamentos;
- automacoes reais;
- permissoes reais;
- equipes reais.

## 8. O que fica para depois

Fica para depois:

- login e onboarding real com Supabase;
- Supabase Auth;
- modelagem final do banco;
- integracao com OpenAI/Anthropic/Gemini;
- importacao de extratos;
- anexos e documentos;
- notificacoes reais;
- exportacoes reais;
- multiempresa avancado;
- equipe e permissoes;
- planos pagos reais;
- portal administrativo;
- dashboards complexos;
- views avancadas como kanban, calendario completo e timeline detalhada.

## 9. Ordem recomendada das proximas telas

Ordem recomendada a partir do estado atual:

1. Painel de Clareza: ajustar o Dashboard para responder "onde estou, para onde vou e o que fazer hoje".
2. Financeiro: consolidar Receitas, Despesas, Fluxo de Caixa e categorias mockadas.
3. Metas / Objetivos: criar tela de objetivos com progresso, probabilidade, rota e recomendacao da Uni.
4. Uni AI: conectar melhor perguntas, contexto financeiro e proximos passos sem IA real ainda.
5. Relatorios / Evolucao: criar narrativa mensal com graficos simples e resumo da Uni.
6. Agenda: evoluir vencimentos, lembretes e prioridades.
7. Configuracoes / Perfil: organizar perfil, plano, preferencias da Uni e espaco atual.
8. CRM: evoluir pipeline simples para empresas.
9. Clientes: criar base separada de clientes e historico.
10. Projetos: conectar projetos a cliente, prazo e impacto financeiro.
11. Ajustes de navegacao por `currentWorkspace` quando modo `both` estiver mais maduro.
12. Equipe futuro, somente depois de clientes/projetos/permissoes estarem melhor definidos.

Regra: criar uma tela por vez. Primeiro estrutura e dados mockados. Depois refinamento visual. Depois integracao real.

## 10. Regras de evolucao

- Estrutura primeiro.
- Design fino depois.
- Sem backend real ainda.
- Sem refatoracao grande.
- Criar uma tela por vez.
- Usar dados mockados locais enquanto o fluxo nao estiver validado.
- Usar `docs/01-arquitetura` como fonte principal para estrutura, escopo e prioridades.
- Respeitar `docs/08-references` como referencia visual e comportamental secundaria.
- Nao copiar a Landing literalmente; adaptar para experiencia real do WebApp.
- A Uni deve ser humana, calma, didatica, sem culpa e sem alarmismo.
- Nenhum modulo deve parecer app generico.
- Cada tela deve responder uma pergunta principal.
- Toda tela deve ter relacao clara com a Uni AI.
- Toda mudanca relevante deve preservar os modos `personal`, `business` e `both`.
- Toda funcionalidade deve reduzir trabalho manual ou transformar dados em decisao.

## 11. Checklist ate o MVP demonstravel

### Base do app

- [x] App React + Vite criado.
- [x] Design System base criado.
- [x] Componentes UI base criados.
- [x] AppShell, Sidebar e Topbar criados.
- [x] React Router criado.
- [x] Navegacao centralizada por modo/plano.
- [x] AccessContext demo criado.
- [x] Acesso Demo integrado ao perfil.

### Experiencia central

- [x] Dashboard inicial mockado.
- [x] Uni AI com experiencia local mockada.
- [x] Uni Quick Capture local.
- [x] Audio local da resposta.
- [x] Referencia oficial da experiencia Uni AI documentada.
- [ ] Dashboard ajustado conceitualmente como Painel de Clareza.
- [ ] Visao de futuro financeiro no primeiro contato.
- [ ] Dashboard reagindo de forma controlada apos resposta da Uni.
- [ ] Eventos locais entre Uni AI e Dashboard.

### Modulos pessoais

- [x] Financeiro com tela real mockada inicial.
- [ ] Financeiro consolidado como Receitas, Despesas e Fluxo de Caixa.
- [ ] Metas/Objetivos com tela real mockada.
- [ ] Agenda com vencimentos/lembretes mockados.
- [ ] Relatorios com narrativa clara.
- [ ] Configuracoes com preferencias mockadas.

### Modulos empresariais

- [ ] CRM com pipeline simples mockado.
- [ ] Clientes com historico e resumo financeiro.
- [ ] Projetos com prazo, cliente e impacto financeiro.
- [ ] Relatorios empresariais simples.
- [ ] Equipe documentada como futuro.

### Qualidade e coerencia

- [ ] Cada tela segue identidade visual da UniFlow AI.
- [ ] Cada tela tem relacao explicita com a Uni AI.
- [ ] Cada tela usa dados mockados locais antes de backend.
- [ ] Cada tela evita excesso de cards e botoes.
- [ ] Cada tela funciona em modo pessoal ou empresarial quando aplicavel.
- [ ] Textos mantem tom humano, calmo e sem julgamento.
- [ ] Animacoes respeitam `prefers-reduced-motion`.
- [ ] Documentacao atualizada apos decisoes estruturais.

## 12. Decisao final deste mapa

`docs/01-arquitetura` e a fonte principal da estrutura do app.

`docs/08-references` deve ser tratado como referencia oficial visual/comportamental, nao como sobra de Landing Page, mas sem substituir a arquitetura funcional.

O WebApp deve evoluir como uma experiencia propria da UniFlow AI: Painel de Clareza, conversa, voz, contexto, analise, objetivos e projecao financeira trabalhando juntos para gerar clareza sobre o futuro.

Enquanto nao houver backend real, cada modulo deve provar seu valor com mock local, baixa carga cognitiva e relacao clara com a Uni.
