# Status Atual do Projeto

Este arquivo descreve o estado observado na estrutura atual do repositório.

## Aplicação

O projeto é uma aplicação React + Vite.

Arquivos principais observados:

- `package.json`;
- `vite.config.js`;
- `src/main.jsx`;
- `src/app/main.jsx`;
- `src/app/App.jsx`;
- `src/App.jsx`.

Dependências atuais no `package.json`:

- `react`;
- `react-dom`.

Dependências de desenvolvimento atuais:

- Vite;
- plugin React do Vite;
- ESLint;
- plugins de lint para React Hooks e React Refresh;
- tipos de React e React DOM.

## Estrutura atual de `src`

Diretórios existentes:

- `src/app`;
- `src/assets`;
- `src/components`;
- `src/components/layout`;
- `src/components/shared`;
- `src/components/ui`;
- `src/components/ui/Button`;
- `src/contexts`;
- `src/features`;
- `src/features/chat`;
- `src/features/companies`;
- `src/features/crm`;
- `src/features/dashboard`;
- `src/features/employees`;
- `src/features/finance`;
- `src/features/notifications`;
- `src/features/projects`;
- `src/features/settings`;
- `src/hooks`;
- `src/pages`;
- `src/services`;
- `src/styles`;
- `src/utils`.

## Implementação ativa observada

### App

`src/main.jsx` importa `src/app/App.jsx` e `src/styles/index.css`.

`src/app/App.jsx` renderiza uma tela inicial simples da UniFlow AI usando tokens CSS e o componente `Button`.

Também existe `src/App.jsx`, com tela inicial simples e valores visuais hardcoded. O entrypoint atual observado usa `src/app/App.jsx`.

### Design System

`src/styles` contém:

- `theme.css`;
- `reset.css`;
- `globals.css`;
- `animations.css`;
- `utilities.css`;
- `index.css`.

O `theme.css` define tokens de cor, tipografia, espaçamento, radius, sombras, glass, gradientes, motion, z-index, grid, breakpoints e ícones.

### Componentes

Existe implementação ativa de:

- `src/components/ui/Button/Button.jsx`;
- `src/components/ui/Button/Button.module.css`;
- `src/components/ui/Button/index.js`.

O `Button` possui:

- variants: `primary`, `secondary`, `outline`, `ghost`, `danger`, `success`;
- sizes: `xs`, `sm`, `md`, `lg`, `xl`;
- suporte a `fullWidth`;
- suporte a `loading`;
- suporte a `disabled`;
- suporte a `leftIcon` e `rightIcon`.

### Utilitários

`src/utils` contém:

- `constants.js`: `APP_NAME` e `APP_DESCRIPTION`;
- `cx.js`: concatenação simples de classes;
- `formatters.js`: `formatCurrency` e `formatDate`;
- `helpers.js`: `isEmpty`.

### Serviços

`src/services` contém arquivos vazios ou ainda sem implementação observável:

- `auth.service.js`;
- `client.js`;
- `database.service.js`;
- `storage.service.js`.

### Hooks e exports

`src/hooks/index.js` existe, mas sem conteúdo observado.

`src/components/index.js` existe, mas sem conteúdo observado.

`src/app/routes.jsx` existe, mas sem conteúdo observado.

## Documentação organizada

`docs/01-arquitetura` contém documentos de produto, arquitetura, stack, modelo conceitual, filosofia, UX/UI e planejamento.

`docs/02-design-system` contém referências documentais de componentes e estilos do Design System.

`docs/03-shared` contém referências compartilhadas.

`docs/04-layout` contém referências de layout.

`docs/05-hooks` contém referências de hooks.

`docs/06-modules` contém referências de módulos, páginas e services.

`docs/_INBOX/00-MASTER/02-roadmap.md` existe, mas está vazio.

## Atenções importantes

Há diferença entre a stack oficial documentada e a implementação ativa atual.

Documentos indicam React Router, Supabase, Supabase Auth, Supabase Storage e Context API como parte da arquitetura oficial. O `package.json` atual ainda não contém essas dependências, e `src` ainda não mostra a implementação desses módulos.

Antes de implementar qualquer etapa, o agente deve confirmar se está trabalhando com:

- estado real do código em `src`;
- referência estratégica em `docs`;
- ou artefatos de planejamento em `docs/02` a `docs/06`.
