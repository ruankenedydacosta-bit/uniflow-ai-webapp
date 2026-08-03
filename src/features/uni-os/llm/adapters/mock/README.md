# LLM Adapter Mock

Implementacao local e deterministica do contrato LLM Adapter Interface. O adapter simula ciclo de vida, health, custo, latencia, request e response sem modelo, SDK, HTTP ou credenciais.

- As 16 capabilities previstas possuem respostas estruturadas fixas.
- `FAST`, `NORMAL`, `SLOW` e `TIMEOUT` sao simulacoes controladas.
- Toda resposta e profundamente imutavel e declara zero tokens consumidos.
- `runMockLLMAdapterShadow()` respeita `UNI_OS_ENABLED` e descarta o resultado.

Este modulo serve apenas para validar a futura cadeia de orquestracao.
