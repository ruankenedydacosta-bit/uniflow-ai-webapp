# Roadmap UniFlow AI

Este roadmap consolida os módulos e prioridades existentes nos documentos atuais. Ele não cria escopo novo.

## Prioridade atual do projeto

Conforme `AGENTS.md`, a prioridade atual é:

1. Criar o Kit Base UniFlow AI em `docs/00-master`.
2. Criar os componentes base restantes.
3. Criar layout principal.
4. Criar Dashboard inicial.

## Módulos oficiais do produto

### 01. Login

Objetivo: permitir acesso rápido, sem complicação e sem excesso de informação.

Regras:

- login em menos de 30 segundos;
- entrada por email;
- métodos futuros documentados: Google, Apple e Microsoft.

### 02. Onboarding Inteligente

Objetivo: conhecer o usuário por conversa, não por formulário.

A Uni deve conduzir perguntas sobre:

- quem é o usuário;
- trabalho;
- empresa;
- funcionários;
- objetivos;
- preocupações financeiras;
- forma atual de controle;
- destino financeiro desejado.

Resultado esperado: a Uni deve conseguir montar o primeiro plano financeiro.

### 03. Perfil

Inclui:

- informações pessoais;
- objetivos;
- preferências;
- configurações;
- segurança.

### 04. Empresas

Módulo opcional para usuários com empresa.

Inclui:

- cadastro e edição de empresas;
- funcionários;
- centros de custo;
- fluxo empresarial.

### 05. Painel de Clareza

Substitui o dashboard tradicional.

Pergunta principal: "Como está minha vida financeira hoje?"

Deve mostrar:

- resumo financeiro;
- objetivos;
- alertas;
- conquistas;
- prioridades;
- projeções;
- insights da Uni.

Regra: sem excesso. O painel muda conforme o usuário.

### 06. Receitas

Inclui:

- adicionar, editar e excluir receitas;
- recorrência;
- categorias;
- empresas;
- pessoa física e jurídica;
- voz;
- importação futura.

### 07. Despesas

Mesmo conceito de receitas, mas com inteligência contextual.

Ao registrar despesas, a Uni deve aprender padrões, como frequência e categoria de gastos.

### 08. Fluxo de Caixa

Inclui:

- visão de hoje;
- semana;
- mês;
- ano;
- projeções;
- entradas;
- saídas;
- saldo futuro.

Tudo deve ser explicado pela Uni.

### 09. Objetivos

Módulo psicológico, não apenas financeiro.

Exemplos:

- comprar casa;
- trocar carro;
- abrir empresa;
- viajar;
- aposentar;
- investir;
- quitar dívidas.

Cada objetivo pode ter valor, prazo, importância, probabilidade, estratégia e plano.

### 10. Uni

Não deve ser tratada como chat comum. É uma Central de Inteligência.

Pode concentrar:

- conversa;
- áudio;
- imagem futura;
- documento;
- perguntas;
- planejamento;
- simulações;
- análises;
- pesquisas;
- notícias;
- recomendações.

### 11. Relatórios

Não devem ser planilhas frias. Devem ser histórias claras.

Exemplo de abordagem:

"Neste mês você economizou R$ 840. Isso representa 18% acima da sua média."

### 12. Configurações

Inclui:

- conta;
- segurança;
- notificações;
- plano;
- integrações;
- empresas;
- privacidade;
- exportações.

## Navegação planejada

A navegação principal documentada deve ser simples:

- Clareza;
- Objetivos;
- ação rápida central;
- Uni;
- Evolução.

O botão central deve abrir ações rápidas para registrar receitas, despesas, metas e outros eventos.

Perfil e configurações ficam no avatar no canto superior direito.

## Regras de UX que guiam o roadmap

### Regra dos 5 segundos

Em até cinco segundos após abrir a UniFlow AI, o usuário deve responder:

- Como estou hoje?
- O que mudou desde ontem?
- O que precisa da minha atenção?
- Qual é minha próxima ação?
- Estou evoluindo?

### Regra dos 3 cliques

Nenhuma função essencial deve exigir mais de três interações.

Funções essenciais:

- registrar despesa;
- registrar receita;
- conversar com a Uni;
- criar meta;
- visualizar fluxo de caixa.

### Regra do zero aprendizado

O usuário não deve precisar aprender a usar a UniFlow AI. Se um tutorial for necessário para uma função básica, a função precisa ser redesenhada.

## Decisões já documentadas fora dos 12 módulos

### CRM

Existe documentação de referência para um módulo de Clientes/CRM em `docs/06-modules/README.md`.

O documento assume um padrão mínimo coerente de CRM:

- nome;
- email;
- telefone;
- empresa;
- status;
- tags;
- notas;
- timeline.

### Projetos

Existe documentação de planejamento para o módulo Projetos em `docs/01-arquitetura/ARQUITETURA.md`.

O documento ancora Projetos em entidades já existentes no modelo conceitual:

- Empresa;
- Cliente;
- Funcionários como responsáveis.

Também define visões planejadas:

- lista;
- kanban;
- calendário;
- timeline.
