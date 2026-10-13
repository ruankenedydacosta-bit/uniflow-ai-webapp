# Simplified App V1

Ramo autenticado da experiência simplificada da UniFlow AI.

## Rotas

- `/app/home`: Home conversacional com a mesma infraestrutura real da Uni.
- `/app/registros`: placeholder da futura Central de Registros.
- `/app/conta`: placeholder da futura área de Conta.

O shell mostra somente Home, Registros e Conta. As rotas e os módulos antigos
continuam disponíveis e não foram removidos.

## Voz

A Home usa a variante compacta do `UniChatPage`. A voz é só a conversa em tempo
real (`uni-voice-realtime`): o orb da barra inferior abre a tela de voz, e o que
a pessoa pede passa pelo mesmo envio do texto. Assim, intents, confirmações,
Pending Action Stack, RPC atômica e proteção contra duplicidade continuam no
motor já existente.

A saudação da Home é visual. Quem cumprimenta em voz é a Uni da conversa em
tempo real, ao abrir a conversa.

## Assinatura

O botão do Plano Pessoal apenas chama `startSubscription()` e segue para a Home.
O futuro `SubscriptionGate` deve ser conectado antes deste ramo, sem usar
`localStorage` como autorização.

