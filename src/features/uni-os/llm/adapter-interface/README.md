# LLM Adapter Interface

Contrato imutável que todo futuro adapter LLM deverá implementar. O módulo
descreve o schema e os nove métodos obrigatórios, mas não fornece implementação
concreta e nunca chama esses métodos.

Não contém provider, modelo, SDK, URL, credencial, request real ou chamada
externa. `UNI_OS_ENABLED` permanece desligada e o modo sombra descarta o snapshot.

O próximo estágio é um LLM Adapter Mock que implementará este contrato sem
integrações externas.

