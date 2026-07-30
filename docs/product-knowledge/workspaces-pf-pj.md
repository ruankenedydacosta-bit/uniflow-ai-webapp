# Workspaces — Pessoal (PF) e Empresa (PJ)

## Finalidade

Explicar o que é um "espaço" (workspace), como alternar entre Pessoal e Empresa, e os papéis de acesso dentro de um espaço.

## Onde encontrar

Alternador Pessoal/Empresa na barra superior (desktop) ou no cabeçalho do app (mobile).

## Passo a passo

**Alternar de espaço**: tocar no alternador "Pessoal/Empresa" no topo da tela. A troca é local e imediata (não recarrega a página); um indicador breve "Alterando para Espaço X…" aparece durante a transição. Na primeira vez que o usuário entra em cada tipo de espaço, um aviso explicativo é mostrado uma única vez.

**Múltiplos espaços de empresa**: nada no aplicativo impede criar mais de um espaço de Empresa, mas o espaço Pessoal é criado apenas um automaticamente; espaços adicionais exigiriam um fluxo de criação que não está exposto nesta fase.

**Papéis dentro de um espaço** (`owner`, `admin`, `member`, `viewer`):
- `owner`: acesso completo, incluindo excluir o espaço.
- `admin`: pode editar e excluir a maioria dos registros.
- `member`: pode editar, mas não excluir a maioria dos registros.
- `viewer`: apenas leitura.

## Diferenças PF/PJ

- Espaço Pessoal: Financeiro, Categorias, Objetivos, Agenda, Relatórios, Uni.
- Espaço Empresa: tudo do Pessoal, mais CRM, Clientes e Projetos.
- Categorias podem ser específicas de PF, de PJ, ou compartilhadas entre os dois.

## Desktop / mobile

Mesmo comportamento de alternância em ambos.

## Permissões

Papéis são por espaço — um usuário pode ser `owner` no espaço Pessoal e `member` em um espaço Empresa ao qual foi convidado (quando aplicável).

## Pré-requisitos

Ao menos um espaço criado (o espaço Pessoal é criado automaticamente).

## Limitações atuais

- Não há tela dedicada para convidar outros membros para um workspace nesta fase (a estrutura de papéis existe no banco, mas a interface de convite não foi confirmada como disponível — tratar como não confirmado até validar na tela real).
- Não há limite de espaços de Empresa aplicado na interface, mas também não há fluxo guiado para criar um segundo.

## Mensagens de erro conhecidas

Ao tentar acessar diretamente uma rota de um módulo indisponível no espaço atual (ex.: `/crm` no Pessoal), o usuário é redirecionado ao Dashboard com um aviso.

## Funcionalidades ainda não disponíveis

- Convite de membros por interface própria (não confirmado como disponível nesta fase).
