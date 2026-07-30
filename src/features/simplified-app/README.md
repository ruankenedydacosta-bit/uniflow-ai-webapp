# Simplified App V1

Ramo autenticado da experiência simplificada da UniFlow AI.

## Rotas

- `/app/home`: Home conversacional com a mesma infraestrutura real da Uni.
- `/app/registros`: placeholder da futura Central de Registros.
- `/app/conta`: placeholder da futura área de Conta.

O shell mostra somente Home, Registros e Conta. As rotas e os módulos antigos
continuam disponíveis e não foram removidos.

## Voz

A Home usa o `UniVoiceInputProvider` persistente do shell e a variante compacta
do `UniChatPage`. Assim, captura, transcrição, intents, confirmações, Pending
Action Stack, RPC atômica e proteção contra duplicidade continuam no motor já
existente.

A saudação utiliza o TTS já disponível e é tentada uma vez por sessão
autenticada. Falhas de autoplay ou do provedor não bloqueiam a interface.

## Assinatura

O botão do Plano Pessoal apenas chama `startSubscription()` e segue para a Home.
O futuro `SubscriptionGate` deve ser conectado antes deste ramo, sem usar
`localStorage` como autorização.

