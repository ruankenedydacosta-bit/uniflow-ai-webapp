# Emotion & Personality Layer

Define somente metadados para comunicação futura: emoção, personalidade
representada, tom, verbosidade e estilo. Usa apenas os quatro perfis existentes
da Uni e nunca cria ou altera preferências.

Não gera texto, SSML, voz ou prompts. `outputChannel` e `voiceProfile` permanecem
nulos, e `executionAllowed` permanece sempre `false`.

`UNI_OS_ENABLED` continua desligada. Quando ativada explicitamente, a camada
roda somente em modo sombra e o resultado é descartado.
