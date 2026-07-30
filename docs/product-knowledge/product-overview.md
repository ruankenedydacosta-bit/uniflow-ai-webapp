# Visão geral — UniFlow AI

## Finalidade

UniFlow AI é um aplicativo financeiro mobile-first (também disponível em desktop) que ajuda uma pessoa a organizar as finanças pessoais (PF) e, opcionalmente, de um negócio (PJ), com apoio de uma assistente de IA chamada **Uni**.

## Onde encontrar

Aplicativo web em `/dashboard` após login. Não existe app nativo iOS/Android nesta fase — é uma aplicação web responsiva (React + Vite), usável no navegador do celular ou do desktop.

## Passo a passo (visão geral do fluxo)

1. Usuário cria conta ou entra (e-mail/senha ou Google).
2. Passa pela apresentação pós-login (`/apresentacao`) e pelo Plano Pessoal (`/plano-pessoal`), quando aplicável; o espaço Pessoal é criado automaticamente, sem perguntas.
3. Cai no Dashboard, com um resumo financeiro, próximos passos e atalhos.
4. Navega entre módulos (Financeiro, Categorias, Objetivos, Agenda, CRM, Clientes, Projetos, Relatórios, Configurações) pela barra lateral (desktop) ou pela barra inferior/menu "Mais" (mobile).
5. Pode conversar com a Uni a qualquer momento para tirar dúvidas ou registrar movimentações por linguagem natural.

## Diferenças PF/PJ

- **Espaço Pessoal (PF)**: finanças pessoais — Financeiro, Categorias, Objetivos, Agenda, Relatórios, Uni.
- **Espaço Empresa (PJ)**: tudo do espaço pessoal, mais CRM, Clientes e Projetos (exclusivos de empresa).
- Um usuário pode ter os dois espaços e alternar entre eles a qualquer momento.

## Desktop / mobile

Mesma base de dados e funcionalidades; a apresentação muda (barra lateral vs. barra inferior, modais vs. telas dedicadas). Diferenças específicas estão detalhadas em `navigation-desktop.md` e `navigation-mobile.md`.

## Permissões

Definidas por papel dentro do workspace: `owner`, `admin`, `member`, `viewer`. Ver `workspaces-pf-pj.md`.

## Pré-requisitos

Conta criada, apresentação concluída e, quando aplicável, Plano Pessoal com assinatura ativa. Sem isso, o usuário é redirecionado para `/apresentacao` ou `/plano-pessoal`.

## Limitações atuais

- Não é um app nativo — apenas web.
- Integração bancária real (Open Finance) ainda não existe — é uma demonstração visual (ver `financial-management.md`).
- Não há central de suporte com interface própria nesta fase (a base de conhecimento desta fase é a fundação para isso, mas a tela ainda não existe).

## Mensagens de erro conhecidas

Não aplicável neste documento — ver o documento específico de cada módulo.

## Funcionalidades ainda não disponíveis

- Central de Suporte com tela própria (planejada, ainda não implementada).
- Integração bancária real.
- Aplicativo nativo.
