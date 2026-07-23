# Open Finance Connection Animation V1

Prévia educativa e totalmente mockada do fluxo futuro de Open Finance da
UniFlow. A feature não realiza conexão bancária, OAuth, HTTP nem coleta de
credenciais.

## Componentes

- `OpenFinanceConnectionAnimation`: animação reutilizável nas variantes
  `compact` (13 segundos) e `expanded` (15 segundos).
- `OpenFinanceLearnMorePanel`: explicação estática acessível aberta pelo botão
  `Ver mais`; não contém nem repete a animação.

## Integração

A Home Mobile usa exclusivamente a variante `compact`, com `autoPlay` e `loop`.
O componente pausa a timeline quando sai do viewport e permanece estático com
`prefers-reduced-motion: reduce`.

O tema efetivo (`light`, `dark` ou `uniflow`) é recebido por prop a partir do
Theme System V1. A preferência `system` continua sendo resolvida somente pelo
`ThemeProvider`.

Todos os nomes, valores e instituições exibidos são genéricos e ilustrativos.
