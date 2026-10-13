# Uni Voice Output Premium Demo V1

> **Removido em 13/10/2026.** A voz fora da conversa em tempo real saiu do app:
> `src/features/uni-voice-output/`, `src/features/uni-voice-tts/` (botão
> "Ouvir" e narração das respostas) e as pastas das Edge Functions
> `generate-uni-premium-voice` e `uni-voice-tts` foram apagadas do repositório.
> As funções publicadas no Supabase saem com `supabase functions delete`. A voz
> da Uni é só a conversa em tempo real (`src/features/uni-voice-realtime/`). O
> texto abaixo fica como registro histórico.

## 1. Objetivo

A Saída de Voz Premium V1 permite comparar, em apresentações internas e
controladas, a voz gratuita do navegador com uma voz natural gerada pela
ElevenLabs. A arquitetura mantém uma interface única para reprodução, sem
acoplar a Uni, a conversa ou o domínio financeiro ao fornecedor.

Esta versão não é uma oferta comercial, não define franquias para clientes e
não integra OpenAI ou qualquer núcleo cognitivo novo.

## 2. Arquitetura de providers

O domínio está em `src/features/uni-voice-output/`:

- `voiceOutputProvider.js`: constrói e resolve providers pelo contrato comum;
- `browserVoiceProvider.js`: encapsula `SpeechSynthesis`;
- `premiumVoiceProvider.js`: chama somente a Edge Function autenticada e
  reproduz o `Blob` temporário;
- `voiceOutputPolicy.js`: sanitização, dados sensíveis, presets e quota local;
- `voiceOutputReducer.js`: estados previsíveis da reprodução;
- `useUniVoiceOutput.js`: ciclo de vida, cancelamento e fallback;
- `voiceOutputMessages.js`: mensagens humanas;
- `uniVoiceOutput.test.js`: testes locais sem chamada externa.

Contrato comum:

```text
speak(text, options)
stop()
isSupported()
providerName
```

O restante da aplicação conhece apenas `browser` e `elevenlabs_demo`.

## 3. Modos e acionamento

- `off`: voz desligada;
- `browser`: voz padrão local do navegador;
- `elevenlabs_demo`: voz premium restrita à demonstração.

Toda reprodução é manual. A resposta textual aparece primeiro e permanece a
fonte de verdade. Os botões `Ouvir padrão` e `Ouvir premium` não reenviam a
mensagem, não confirmam lançamento, não criam memória e não modificam valor,
categoria, conta ou data.

## 4. Voz padrão

O provider gratuito usa `SpeechSynthesis` e tenta selecionar uma voz `pt-BR`,
com preferência heurística por nomes femininos conhecidos. Navegadores não
expõem gênero de forma padronizada, portanto a voz varia entre dispositivos.

Não há chamada controlada pela UniFlow, persistência de áudio ou garantia de
qualidade uniforme. `stop()` usa `speechSynthesis.cancel()`.

## 5. Voz premium e Edge Function

`generate-uni-premium-voice` é a única camada autorizada a chamar o endpoint
oficial de text-to-speech streaming da ElevenLabs. O frontend envia somente:

- resposta final sanitizada com até 320 caracteres;
- identificador de perfil entre `balanced`, `direct`, `warm` e `strategic`.

A Edge Function escolhe internamente `voice_id`, `model_id` e os parâmetros de
voz. Ela não aceita esses valores nem `user_id` do cliente.

## 6. Segredos e configuração

Segredos exclusivos da Edge Function:

- `ELEVENLABS_API_KEY`;
- `ELEVENLABS_VOICE_ID`;
- `ELEVENLABS_MODEL_ID`;
- `UNI_PREMIUM_VOICE_ALLOWED_USER_IDS`.

Nunca criar `VITE_ELEVENLABS_API_KEY` ou enviar segredo, certificado ou
credencial ao navegador. A flag pública
`VITE_UNI_PREMIUM_VOICE_DEMO_ENABLED=true` apenas revela que o ambiente interno
foi preparado; não concede autorização nem contém configuração do provedor.

## 7. Autorização

A função exige `Authorization: Bearer <JWT>`, valida a sessão pelo Supabase Auth
e deriva o UUID do usuário. O UUID precisa estar na allowlist armazenada como
segredo. Usuários fora dela recebem HTTP 403 com mensagem humana.

Não há `service_role` no navegador. A função usa a anon key do próprio ambiente
somente para validar o JWT no Auth. Nenhum identificador de usuário fornecido
pelo payload participa da autorização.

## 8. Limites da demonstração

- máximo de 320 caracteres por geração;
- uma geração simultânea no frontend e por usuário em cada isolate da função;
- dez solicitações premium por sessão da interface;
- timeout de 15 segundos;
- sem retry automático;
- sem reprodução premium automática;
- respostas longas usam o resumo já produzido pela aplicação;
- falha operacional pode acionar a voz padrão uma única vez.

O limite local não substitui o limite financeiro da chave ElevenLabs. O
controle em memória da Edge Function não é distribuído e não constitui uma
franquia de produção. Antes do lançamento será necessário consumo persistente
por usuário, coordenação entre isolates, observabilidade sanitizada e política
comercial definida.

## 9. Personalidade

Os quatro perfis resolvem presets internos determinísticos de estabilidade,
similaridade, estilo e velocidade. O cliente escolhe somente o perfil conhecido;
valores arbitrários nunca chegam à API. Personalidade muda apresentação e
redação, não fatos, autorização ou decisões financeiras.

## 10. Sanitização e privacidade

Antes da geração, frontend e Edge Function:

- removem HTML e markdown de apresentação;
- normalizam espaços e caracteres de controle;
- rejeitam texto vazio;
- bloqueiam padrões de CPF, cartão, conta, senha, token e credenciais;
- limitam o texto premium a 320 caracteres.

Somente a resposta final da Uni pode ser falada. A transcrição do usuário não é
enviada ao provedor. O áudio não é salvo em banco, Storage ou arquivo. O
navegador cria um `Blob/ObjectURL` temporário, revogado ao terminar, falhar,
interromper ou desmontar. A função não registra texto financeiro, headers,
tokens ou segredos e devolve `Cache-Control: no-store`.

## 11. Estados e mensagens

Estados suportados:

- `idle`, `preparing`, `generating`, `playing`, `stopped`;
- `quota_reached`, `unauthorized`, `unsupported`;
- `provider_error`, `fallback_active`.

As mensagens são humanas e não expõem detalhes do fornecedor. O nome
ElevenLabs fica restrito à documentação e ao código interno; a interface usa
`Premium — demonstração`.

## 12. Modo sem configuração

Sem Supabase, flag ou segredos:

- a aplicação continua funcionando;
- entrada por texto e voz não muda;
- voz padrão permanece disponível quando o navegador suporta;
- premium aparece indisponível;
- nenhuma exceção interrompe a página.

## 13. Sequência segura para habilitar uma demonstração

1. Revisar e testar a Edge Function localmente sem credenciais reais no Git.
2. Configurar os quatro segredos somente no projeto Supabase DEV autorizado.
3. Manter a chave ElevenLabs com limite financeiro rígido.
4. Adicionar apenas UUIDs dos fundadores à allowlist.
5. Implantar a função somente no DEV.
6. Testar autenticação, 403, timeout, cancelamento e ausência de logs sensíveis.
7. Ativar `VITE_UNI_PREMIUM_VOICE_DEMO_ENABLED=true` apenas no frontend interno.
8. Acionar `Ouvir premium` manualmente com respostas fictícias e curtas.
9. Desativar a flag e revogar segredos ao encerrar a apresentação, se necessário.

## 14. Limites e próximos passos

Esta V1 não possui quota persistente, painel de consumo, política por plano,
cache, streaming progressivo no player, SLA ou licença comercial definida.
OpenAI e o núcleo cognitivo permanecem fora desta fase. Qualquer lançamento
para clientes exige revisão jurídica, LGPD, custos, termos do provedor,
consentimento e controle persistente de consumo.

## 15. Estado da implementação

A arquitetura, Edge Function e testes estão preparados localmente. Nenhuma
chamada à ElevenLabs foi realizada, nenhum segredo remoto foi configurado e a
função não foi implantada.
