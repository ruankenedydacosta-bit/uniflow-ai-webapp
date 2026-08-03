# Context Adapter

Consolida somente campos seguros e explicitamente permitidos de sessão,
usuário, profile, workspace, conversa, personalidade e feature flags.

O adapter nunca copia e-mail, telefone, token, JWT, chaves ou dados financeiros.
`UNI_OS_ENABLED` continua `false`; quando habilitado em DEV, o contexto segue
para o UNI OS em modo sombra e o resultado é descartado.
