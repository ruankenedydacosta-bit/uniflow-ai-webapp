# Provider Registry

Catálogo imutável e independente que descreve provedores mock e as capacidades
que eles poderão oferecer no futuro. Não contém modelos, URLs, credenciais,
autenticação ou chamadas externas.

Todos os registros começam não operacionais e com health `UNKNOWN`.
`runProviderRegistryShadow()` respeita `UNI_OS_ENABLED`, entrega o snapshot a um
observador quando habilitado explicitamente e sempre descarta o resultado.

O próximo estágio previsto é Routing Policies, seguido do Model Router. A
integração externa permanece fora deste módulo.

