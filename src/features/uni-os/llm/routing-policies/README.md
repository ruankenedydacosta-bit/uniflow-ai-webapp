# Routing Policies

Engine determinístico que transforma uma capability, o Provider Registry e
metadados compilados em regras declarativas de roteamento. Ele produz conjuntos
permitidos e bloqueados, além de uma ordem de prioridade, mas nunca seleciona
um provedor final.

Não contém modelos, URLs, credenciais, autenticação ou chamadas externas.
`UNI_OS_ENABLED` permanece desligada e o modo sombra sempre descarta o resultado.

O próximo estágio é o Model Router representacional, que combinará Capability
Registry, Provider Registry e estas policies sem integrar APIs.

