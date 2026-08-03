# Parser Adapter

Traduz a saída existente de `parseFinancialText` para o schema imutável
`parsedIntent`. Não importa nem modifica o parser.

`UNI_OS_ENABLED` permanece `false`. Quando habilitado em desenvolvimento,
`runParserAdapterShadow` envia o contrato ao UNI OS, registra somente resumos
sanitizados e descarta o resultado. Falhas nunca alcançam o fluxo legado.

O adapter não inclui texto bruto, descrição financeira, usuário, sessão ou IDs
de workspace nos logs. A origem pode ser `text`, `voice` ou `system`; enquanto
o fluxo atual não informa a origem, o fallback é `text`.
