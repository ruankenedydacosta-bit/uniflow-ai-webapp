# User Modes and Plans

Este documento define a arquitetura conceitual de perfis, modos de uso e planos da UniFlow AI.

A UniFlow AI deve continuar sendo um unico aplicativo, mas a experiencia apresentada ao usuario deve mudar conforme o perfil, o plano e o espaco ativo.

## 1. Objetivo da separacao

Separar a experiencia por modo evita que usuarios diferentes recebam complexidade desnecessaria.

A UniFlow AI deve atender tres realidades principais:

- pessoa fisica que quer clareza financeira pessoal;
- empresario que precisa gerir vida pessoal e operacao profissional;
- usuario que usa pessoal e empresa, mas precisa manter dados, decisoes e contextos separados.

Essa separacao deve reduzir carga cognitiva, proteger dados e permitir evolucao comercial por planos.

## 2. App unico, experiencias diferentes

O produto deve ser um unico WebApp, com uma base compartilhada de:

- Design System;
- autenticacao futura;
- Uni AI;
- dados financeiros;
- componentes;
- layout;
- regras de seguranca;
- infraestrutura.

A diferenca deve estar na experiencia ativada para cada usuario.

Pessoa fisica nao deve sentir que entrou em um sistema empresarial. Empresario deve sentir que tem recursos profissionais. Usuario com modo duplo deve perceber claramente qual espaco esta usando.

## 3. Modos de uso

### `personal`

Modo para pessoa fisica.

Foco:

- organizacao financeira pessoal;
- saldo, receitas e despesas;
- metas pessoais;
- reserva de emergencia;
- agenda financeira;
- relatorios simples;
- conversa com a Uni sobre vida financeira pessoal.

Nao deve mostrar:

- CRM;
- clientes;
- equipe;
- colaboradores;
- empresas;
- pipeline comercial;
- modulos empresariais.

### `business`

Modo para empresario ou empresa.

Foco:

- tudo que existe no modo pessoal quando fizer sentido;
- financeiro empresarial;
- CRM;
- clientes;
- projetos;
- equipe;
- relatorios empresariais;
- agenda operacional;
- decisoes de caixa, faturamento, despesas e metas do negocio.

O usuario deve sentir que esta usando uma plataforma profissional, mas ainda com baixa carga cognitiva.

### `both`

Modo para usuario que tem vida financeira pessoal e uma ou mais empresas.

Foco:

- permitir alternancia clara entre espaco pessoal e espaco empresarial;
- impedir mistura de dados;
- manter a Uni consciente do espaco atual;
- permitir que o usuario entenda rapidamente onde esta.

O modo `both` nao significa mostrar tudo ao mesmo tempo. Significa que o usuario pode alternar entre `personal` e `business` com seguranca.

## 4. Planos

### `free`

Plano inicial para entrada no produto.

Deve servir para validar valor rapidamente.

Possivel escopo:

- modo `personal`;
- dashboard pessoal simples;
- Uni AI com limites;
- cadastro manual basico;
- poucas metas;
- relatorios simples ou limitados;
- sem modulos empresariais.

### `pro`

Plano pago para pessoa fisica ou profissional individual.

Possivel escopo:

- modo `personal` completo;
- mais historico;
- mais metas;
- insights mais completos da Uni;
- relatorios pessoais;
- automacoes futuras;
- exportacoes futuras;
- sem CRM/equipe por padrao.

### `business`

Plano para empresario, microempresa, pequena empresa ou usuario com espaco empresarial.

Possivel escopo:

- modo `business`;
- opcao de modo `both`;
- financeiro empresarial;
- CRM;
- clientes;
- projetos;
- agenda empresarial;
- relatorios empresariais;
- equipe conforme limites do plano;
- Uni AI com contexto do negocio.

### `enterprise` futuro

Plano futuro para empresas maiores.

Possivel escopo:

- multiplos workspaces empresariais;
- permissoes avancadas;
- auditoria;
- integracoes;
- SSO;
- politicas de seguranca;
- suporte prioritario;
- limites customizados;
- IA com controles e governanca.

## 5. Modulos para pessoa fisica

No modo `personal`, a navegacao deve priorizar:

- Dashboard;
- Uni AI;
- Financeiro;
- Metas;
- Agenda;
- Relatorios pessoais;
- Configuracoes.

Modulos empresariais devem ficar ocultos, nao apenas desabilitados.

## 6. Modulos para empresario

No modo `business`, a navegacao pode incluir:

- Dashboard;
- Uni AI;
- Financeiro;
- CRM;
- Clientes;
- Projetos;
- Agenda;
- Equipe;
- Relatorios;
- Configuracoes.

O empresario pode precisar de visao pessoal e empresarial, mas a experiencia principal deve estar orientada ao negocio quando o espaco atual for empresarial.

## 7. Modulos no modo duplo

No modo `both`, os modulos devem depender do `currentWorkspace`.

Quando o espaco atual for pessoal:

- mostrar modulos pessoais;
- ocultar CRM, clientes e equipe;
- manter a Uni focada em financas pessoais.

Quando o espaco atual for empresarial:

- mostrar modulos empresariais;
- usar dados da empresa ativa;
- manter a Uni focada no negocio.

O produto deve evitar uma tela unica misturando saldo pessoal, caixa da empresa, clientes e metas pessoais.

## 8. Navegacao futura

A navegacao deve ser filtrada por modo, plano e espaco atual.

Regras futuras:

- `navigationItems` deve ser derivado de `userMode`, `currentWorkspace` e `plan`;
- itens nao disponiveis para o modo atual nao devem aparecer;
- itens disponiveis apenas em plano superior podem aparecer com tratamento de upgrade, quando isso fizer sentido;
- em modo `both`, deve existir um seletor claro de espaco atual;
- a Sidebar deve refletir o espaco ativo sem exigir interpretacao do usuario.

Exemplo conceitual:

```txt
userMode: both
currentWorkspace: personal
plan: business
navigationItems: Dashboard, Uni AI, Financeiro, Metas, Agenda, Relatorios, Configuracoes
```

```txt
userMode: both
currentWorkspace: business
plan: business
navigationItems: Dashboard, Uni AI, Financeiro, CRM, Clientes, Projetos, Agenda, Equipe, Relatorios, Configuracoes
```

## 9. Comportamento da Uni AI por modo

### Uni no modo `personal`

A Uni deve falar sobre:

- renda pessoal;
- despesas pessoais;
- reserva;
- metas;
- organizacao financeira;
- decisoes pessoais.

Tom:

- humano;
- calmo;
- didatico;
- sem culpa;
- sem julgamento.

### Uni no modo `business`

A Uni deve falar sobre:

- caixa da empresa;
- faturamento;
- despesas operacionais;
- clientes;
- projetos;
- agenda;
- riscos e oportunidades do negocio.

Tom:

- profissional;
- objetivo;
- consultivo;
- sem alarmismo;
- orientativo, nao decisorio.

### Uni no modo `both`

A Uni deve respeitar o espaco atual.

Ela nunca deve usar dados pessoais para responder perguntas empresariais, nem dados empresariais para responder perguntas pessoais, a menos que uma funcionalidade futura permita analise cruzada com consentimento claro.

## 10. Como evitar mistura de dados

Regras obrigatorias:

- todo dado deve pertencer a um escopo claro;
- dados pessoais devem pertencer ao usuario;
- dados empresariais devem pertencer a um workspace empresarial;
- toda consulta da Uni deve receber o contexto do espaco atual;
- toda tela deve saber qual workspace esta ativo;
- alternar espaco deve trocar contexto, navegacao e dados exibidos;
- relatorios devem indicar se sao pessoais ou empresariais;
- notificacoes devem deixar claro a qual espaco pertencem.

Regra de produto:

> O usuario nunca deve precisar adivinhar se esta vendo informacao pessoal ou empresarial.

## 11. Regras de UX

### Pessoa fisica

- Nao deve ver linguagem de empresa.
- Nao deve ver CRM, clientes ou equipe.
- Nao deve sentir que esta usando um ERP.
- Deve sentir clareza, cuidado e progresso pessoal.

### Empresario

- Deve sentir que tem recursos profissionais.
- Deve ver modulos de negocio quando fizer sentido.
- Deve conseguir entender caixa, clientes, projetos e proximos passos.
- Deve receber orientacao da Uni com foco em decisao empresarial.

### Modo duplo

- Deve deixar claro o espaco atual.
- Deve permitir alternancia simples.
- Deve proteger contra mistura de dados.
- Deve evitar dashboards que combinam tudo sem contexto.
- Deve usar labels como "Pessoal" e nome da empresa ativa.

## 12. Sugestao futura de estrutura tecnica

Estrutura conceitual:

```js
const sessionContext = {
  userMode: 'personal' | 'business' | 'both',
  currentWorkspace: {
    id: 'workspace_id',
    type: 'personal' | 'business',
    name: 'Pessoal' | 'Nome da empresa',
  },
  plan: 'free' | 'pro' | 'business' | 'enterprise',
};
```

### `userMode`

Define quais experiencias o usuario pode acessar.

Valores:

- `personal`;
- `business`;
- `both`.

### `currentWorkspace`

Define o espaco ativo naquele momento.

Valores conceituais:

- workspace pessoal;
- workspace empresarial.

### `plan`

Define limites comerciais, recursos disponiveis e oportunidades de upgrade.

Valores:

- `free`;
- `pro`;
- `business`;
- `enterprise`.

### `navigationItems`

Deve ser filtrado por modo, plano e workspace.

Exemplo conceitual:

```js
const visibleNavigationItems = navigationItems.filter((item) => {
  return item.modes.includes(userMode)
    && item.workspaceTypes.includes(currentWorkspace.type)
    && item.plans.includes(plan);
});
```

Essa estrutura e apenas uma direcao futura. Nao deve ser implementada sem uma etapa propria de arquitetura e revisao.

## 13. Roadmap de implementacao

### Etapa 1: Documentacao

- Registrar modos, planos e regras de separacao.
- Definir quais modulos aparecem em cada contexto.
- Alinhar tom da Uni por modo.

### Etapa 2: Modelo conceitual

- Definir `userMode`;
- definir `currentWorkspace`;
- definir `plan`;
- definir regras de filtragem de navegacao.

### Etapa 3: Mock local

- Criar mock de usuario com modo/plano;
- criar mock de workspaces;
- filtrar navegacao localmente;
- nao integrar backend ainda.

### Etapa 4: UX de alternancia

- Criar seletor de espaco;
- indicar claramente "Pessoal" ou nome da empresa;
- validar que nao existe mistura visual de dados.

### Etapa 5: Uni AI por contexto

- Passar contexto do workspace ativo para a Uni;
- ajustar prompts e respostas mockadas;
- separar memoria pessoal e empresarial.

### Etapa 6: Backend futuro

- Modelar workspaces no Supabase;
- vincular usuarios a workspaces;
- aplicar permissoes;
- proteger consultas por workspace.

### Etapa 7: Planos e limites

- Aplicar limites por plano;
- preparar telas de upgrade;
- liberar modulos conforme assinatura;
- planejar `enterprise` com governanca e auditoria.

## Regra final

A UniFlow AI deve crescer como um produto unico, mas nunca como uma experiencia unica para todos.

Cada usuario deve ver apenas a complexidade necessaria para tomar melhores decisoes no contexto em que esta.
