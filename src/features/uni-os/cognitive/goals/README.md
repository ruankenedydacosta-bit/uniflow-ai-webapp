# Goal Engine

Modulo cognitivo isolado que organiza objetivos ja presentes no snapshot de memoria.

## Contrato

- le `memorySnapshot`, `contextSnapshot` e `parsedIntent` sem modifica-los;
- normaliza objetivos existentes;
- seleciona somente objetivos com status `ACTIVE`;
- aplica priorizacao deterministica;
- retorna schema profundamente imutavel;
- nunca cria, edita, apaga, persiste ou executa objetivos.

`runGoalEngineShadow()` respeita `UNI_OS_ENABLED`. Com a flag desligada, retorna `DISABLED`. Quando habilitado explicitamente, entrega o snapshot somente ao `observer` e descarta o resultado.

O modulo nao esta conectado ao runtime, ao Inspector, a providers ou a APIs.
