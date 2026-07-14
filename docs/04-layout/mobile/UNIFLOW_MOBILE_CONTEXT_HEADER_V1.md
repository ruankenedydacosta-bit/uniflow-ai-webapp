# UniFlow Mobile Context Header V1

## Objetivo

O header mobile funciona como moldura cognitiva: identifica usuário ou
workspace, contexto PF/PJ e estado de notificações sem exibir dados financeiros
ou competir com o primeiro conteúdo da Home.

## Componentes

- `MobileContextHeader`: composição controlada por propriedades;
- `HeaderAvatar`: foto, iniciais, loading, presença e anel PF/PJ;
- `HeaderIdentityBlock`: saudação e identidade truncada;
- `ContextSegmentedControl`: estados PF/PJ, loading, erro e bloqueio;
- `NotificationBell`: estados visuais, badge e callback local;
- `HeaderSkeleton`: loading completo ou apenas da identidade.

`MobileHeader` preserva o contrato atual do shell e adapta o workspace recebido
para o novo componente. `AuthenticatedLayout`, rotas, guards e regras de acesso
não são alterados. Troca de contexto, perfil e notificações são callbacks sem
efeito nesta versão.

## Visual e acessibilidade

O header possui altura máxima estrutural de 64px, além da safe area superior.
Avatar e sino oferecem área de toque mínima de 44px. Nome e workspace usam uma
linha com ellipsis. O controle PF/PJ usa o gradiente oficial de IA, enquanto
sucesso, alerta, erro, superfícies e textos usam tokens semânticos existentes.
Transições respeitam `prefers-reduced-motion`.

## Bottom sheet Mais

Os destinos foram agrupados em `Conta` e `Produto`, com ícones de escaneamento.
`Sair` permanece callback sem autenticação e fica isolado após um divisor para
reduzir toque acidental.

## Limitações

- o segmented control não altera `AccessContext`;
- o sino não solicita permissão nem integra push;
- o avatar não navega para Perfil;
- loading, erro e bloqueio são representações visuais controladas;
- presença online só deve ser ativada futuramente com dado real.
