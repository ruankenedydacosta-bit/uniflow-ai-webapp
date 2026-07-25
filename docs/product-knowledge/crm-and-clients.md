# CRM e Clientes

**Exclusivo do Espaço Empresa (PJ).** Não aparece no Espaço Pessoal.

## Finalidade

Gerenciar clientes e um funil de oportunidades de negócio (pipeline).

## Onde encontrar

`/clientes` (cadastro de clientes), `/crm` (pipeline de oportunidades).

## Passo a passo

**Clientes**: cada cliente tem nome, tipo (pessoa ou empresa), estágio de relacionamento (lead, potencial, ativo, em risco, inativo), contato principal, e-mail, telefone, documento, valor estimado, data do último contato e próxima ação. Excluir um cliente é permitido apenas depois de arquivá-lo, e a exclusão falha se houver oportunidades de CRM vinculadas a ele — nesse caso, é preciso resolver as oportunidades primeiro (o sistema nunca apaga ou desvincula silenciosamente).

**CRM (oportunidades)**: cada oportunidade pertence a um cliente e a uma etapa do funil, com título e valor estimado. Ações possíveis: criar uma oportunidade (exige cliente e etapa), mover entre etapas, editar título/valor enquanto estiver aberta, e encerrar com um resultado — ganha, perdida ou cancelada. **Encerrar uma oportunidade não pode ser desfeito** nesta versão; não há como reabrir depois de encerrada.

O painel de CRM mostra métricas: quantidade e valor em aberto, quantidade ganha, taxa de conversão, ticket médio ganho e valor perdido.

## Diferenças PF/PJ

Ambos os módulos só existem no Espaço Empresa. No Espaço Pessoal, as telas mostram um aviso de bloqueio.

## Desktop / mobile

Mesma funcionalidade em ambos, com layout adaptado.

## Permissões

Excluir um cliente exige papel owner ou admin. Editar/arquivar está disponível para papéis com permissão de edição (owner/admin/member).

## Pré-requisitos

Espaço Empresa ativo.

## Limitações atuais

- Encerrar uma oportunidade é definitivo — sem reabertura.
- Atribuir uma oportunidade/cliente a um membro específico da equipe ainda não tem interface própria.
- O botão "Perguntar à Uni" nessas telas está desabilitado ("Disponível em breve").

## Mensagens de erro conhecidas

Tentar excluir um cliente com oportunidades vinculadas falha (a exclusão é bloqueada, não silenciosa).

## Funcionalidades ainda não disponíveis

- Reabrir uma oportunidade encerrada.
- Atribuição de responsável por interface própria.
- "Perguntar à Uni" diretamente destas telas.
