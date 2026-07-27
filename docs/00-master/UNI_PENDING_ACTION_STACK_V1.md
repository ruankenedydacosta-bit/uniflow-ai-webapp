# UNI Pending Action Stack V1

## Objetivo

A Uni preserva a ação principal quando surge uma dependência. A dependência
ocupa o topo da pilha, recebe confirmação própria e, quando concluída, devolve
o controle à ação anterior sem exigir que o usuário repita campos.

## Contrato

Cada pilha pertence a um único usuário, workspace e conversa. Cada ação contém
tipo, campos já preenchidos, contexto, metadados, vínculo com a ação-pai e uma
chave opcional de deduplicação.

O núcleo oferece operações determinísticas para:

- adicionar e suspender ações;
- confirmar somente a ação ativa;
- concluir e retomar automaticamente a ação-pai;
- atualizar campos sem mutar snapshots;
- propagar falhas estruturadas;
- cancelar apenas a dependência ou todo o ramo;
- persistir a pilha temporariamente em `sessionStorage`.

Todos os objetos públicos são clones defensivos com deep freeze.

## Separação de responsabilidades

A pilha não interpreta mensagens e não conhece contas, categorias, clientes,
projetos ou metas. Executores são registrados por tipo no coordenador. Essa
separação permite que novos domínios reutilizem a mesma ordem, deduplicação,
cancelamento e retomada.

## Compatibilidade

O armazenamento anterior de ação única permanece disponível durante a migração
gradual dos fluxos. Nenhuma API, migration ou regra de workspace foi alterada.

## Próxima integração

Cada fluxo deve declarar suas dependências por adaptadores de domínio. O
primeiro candidato é separar a criação de conta da confirmação da movimentação:
confirmar a conta, concluir a subação e retomar a despesa com valor, descrição,
data e workspace preservados.
