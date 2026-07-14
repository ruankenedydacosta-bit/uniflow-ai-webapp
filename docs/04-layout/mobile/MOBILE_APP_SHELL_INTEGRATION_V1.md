# Mobile App Shell Integration V1

## Decisão

`AuthenticatedLayout` é o único ponto de decisão de layout das rotas
autenticadas. Ele escolhe um único shell por viewport:

- abaixo de 768px: `MobileAppShell`;
- a partir de 768px: `AppShell` desktop existente.

O valor segue o breakpoint oficial de tablet do Design System. A consulta usa
`(max-width: 767px)`, portanto 768px já preserva a experiência desktop atual.

## Integração

O seletor fica em `src/app/App.jsx`, depois dos guards de sessão, onboarding e
acesso. O mesmo bloco de `Routes` é renderizado como filho do shell escolhido;
não existem rotas, páginas ou guards duplicados.

A Home continua sendo `DashboardPage` na rota `/dashboard`. No mobile, ela é
renderizada dentro da área de conteúdo do `MobileAppShell`, sem alteração em
cards, dados, ações ou regras. O título curto do header é `Home`, enquanto o
título interno `Painel de Clareza` permanece como identificação do conteúdo.

## Navegação

- Home: `/dashboard`;
- Financeiro: `/financeiro`;
- Uni: `/uni-ai`;
- Agenda: `/agenda`;
- Mais: abre o bottom sheet local.

As rotas existentes continuam protegidas pelo fluxo atual. Os destinos além da
Home ainda usam suas páginas atuais e não foram redesenhados nesta etapa.

## Mobile

O shell inclui header compacto, workspace disponível, avatar, navegação
inferior, safe areas e espaço inferior para impedir sobreposição do conteúdo.
Não há sidebar nem margem herdada do layout desktop. A largura mínima suportada
é 320px, com rolagem vertical normal e conteúdo sem overflow horizontal criado
pelo shell.

## Desktop

O `AppShell` existente continua sendo retornado diretamente, preservando
Sidebar, Topbar, espaçamentos e navegação. Nenhum CSS do layout desktop foi
alterado.

## Limitações

- somente a Home foi validada visualmente como conteúdo mobile nesta versão;
- Financeiro, Uni, Agenda e páginas do menu Mais ainda mantêm layouts atuais;
- `Sair`, notificações e suporte continuam callbacks de infraestrutura;
- a adaptação final dos cards e densidade da Home permanece para uma etapa de
  design mobile, sem bloquear esta integração estrutural.
