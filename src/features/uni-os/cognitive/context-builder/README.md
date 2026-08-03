# Cognitive Context Builder

Compilador cognitivo isolado que organiza snapshots estruturados em um único contexto imutável.

## Contrato

- recebe intenção, rankings, insights, planning, reflection, security e permissions;
- filtra somente dados comprovadamente inválidos, inelegíveis ou expirados;
- remove duplicidades preservando o item de maior score;
- não aplica truncamento arbitrário;
- remove campos de prompt, credenciais e texto bruto;
- nunca gera prompt, texto, modelo, persistência ou execução.

`runCognitiveContextBuilderShadow()` respeita `UNI_OS_ENABLED`. Quando habilitado explicitamente, entrega o snapshot ao observador e descarta o resultado. O módulo não está conectado ao Runtime ou ao Gateway.
