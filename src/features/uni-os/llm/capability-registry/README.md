# Capability Registry

Registry estático e imutável das capacidades cognitivas disponíveis para a futura camada de orquestração.

## Contrato

- registra apenas capabilities e metadados relativos;
- valida IDs oficiais, unicidade, enums, campos obrigatórios e booleanos;
- permite busca e listagem somente leitura;
- não conhece fornecedores, modelos, endpoints ou credenciais;
- não cria prompts, não chama rede e não executa IA;
- respeita `UNI_OS_ENABLED` e descarta o resultado no modo sombra.

Este módulo será consumido futuramente por políticas de roteamento, em etapa separada.
