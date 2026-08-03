# Insight Engine

Motor cognitivo isolado que identifica insights estruturados usando somente snapshots já produzidos pelo UNI OS.

## Contrato

- recebe intenção, contexto, objetivos e rankings somente leitura;
- detecta sinais por regras determinísticas;
- produz somente códigos estruturados, nunca texto final;
- usa IDs de insight determinísticos;
- retorna snapshot profundamente imutável;
- nunca cria metas ou memórias, persiste dados, notifica o usuário ou executa ações.

`runInsightEngineShadow()` respeita `UNI_OS_ENABLED`. Quando habilitado explicitamente, entrega o snapshot ao observador e descarta o resultado. O módulo não está conectado ao Runtime ou ao Inspector.
