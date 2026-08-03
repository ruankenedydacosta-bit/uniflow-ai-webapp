# Memory Adapter

Camada somente leitura entre os providers existentes e o UNI OS. O adapter
normaliza e consolida memórias explícitas, ativas, válidas, não expiradas e do
workspace atual em um snapshot profundamente imutável.

## Garantias

- não cria, confirma, altera, infere ou persiste memória;
- rejeita origens inferidas, estados inativos e workspaces diferentes;
- rejeita valores ou datas de expiração inválidos;
- clona os dados antes de congelar o snapshot, preservando os providers;
- expõe ao orquestrador apenas um provider com operação `read`;
- registra em desenvolvimento somente nomes de providers e contagens.

`UNI_OS_ENABLED` permanece `false`. Quando ativado explicitamente para teste, o
snapshot segue na mesma chamada sombra do Parser e Context Adapters, e o retorno
do UNI OS é descartado sem interferir no fluxo atual.
