# Model Router

Router determinístico e exclusivamente representacional. Ele combina Capability
Registry, Provider Registry e Routing Policies para organizar candidatos,
representar um provider selecionado e listar fallbacks.

Nenhum provider ou modelo é executado. O módulo não contém URLs, credenciais,
autenticação, SDKs ou chamadas externas. `UNI_OS_ENABLED` permanece desligada e
o modo sombra sempre descarta o resultado.

O próximo estágio é um LLM Adapter Mock que consumirá a decisão sem realizar
integrações externas.

