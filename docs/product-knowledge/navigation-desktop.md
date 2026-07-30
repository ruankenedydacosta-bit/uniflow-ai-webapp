# Navegação — Desktop

## Finalidade

Descrever como navegar pela UniFlow AI em telas de desktop.

## Onde encontrar

Barra lateral (esquerda) sempre visível após login; barra superior (Topbar) no topo da área de conteúdo.

## Passo a passo

**Barra lateral**, agrupada em:
- **Visão geral**: Dashboard, Visão de Futuro.
- **Financeiro**: Financeiro, Categorias, Open Finance, Objetivos, Agenda.
- **Gestão** (somente Espaço Empresa): CRM, Clientes, Projetos.
- **Uni**: Uni AI (chat).
- **Conta**: Configurações.

**Barra superior**: alternador Pessoal/Empresa, sino de notificações, menu da conta (avatar) com atalhos para Perfil, Configurações, Segurança e Sair.

Grupos sem nenhum item visível (ex.: "Gestão" no Espaço Pessoal) simplesmente não aparecem.

## Diferenças PF/PJ

CRM, Clientes e Projetos só aparecem na barra lateral quando o Espaço Empresa está ativo.

## Desktop / mobile

Este documento cobre apenas desktop. Para mobile, ver `navigation-mobile.md`.

## Permissões

A visibilidade de Relatórios depende do plano (Pro, Business ou Enterprise — não aparece no plano Free). As demais rotas dependem apenas do tipo de espaço (Pessoal/Empresa), não do plano.

## Pré-requisitos

Sessão autenticada, apresentação e Plano Pessoal concluídos.

## Limitações atuais

Acesso direto por URL a um módulo bloqueado (ex.: `/crm` no Espaço Pessoal) redireciona automaticamente para o Dashboard com um aviso.

## Mensagens de erro conhecidas

Não há mensagem de erro específica de navegação — o usuário é redirecionado silenciosamente com um aviso visual (`WorkspaceContextNotice`).

## Funcionalidades ainda não disponíveis

Nenhuma rota nova além das listadas está planejada nesta fase.
