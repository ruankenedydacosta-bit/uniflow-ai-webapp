# UNI OS Context Adapter V1

## 1. Objetivo

O Context Adapter V1 consolida um contexto unico, pequeno e imutavel para o UNI
OS. Ele seleciona somente campos seguros ja disponiveis na aplicacao e nunca
consulta, cria, grava ou modifica dados.

A integracao permanece em modo sombra com `UNI_OS_ENABLED=false`. Nenhum
resultado do UNI OS altera a experiencia atual.

## 2. Arquitetura

```text
SessionContext + workspace + profile + personalidade + ambiente
  -> Context Adapter
  -> normalizacao
  -> UniOSContext imutavel
  -> uniOS.process({ parsedIntent, context })
  -> resultado descartado

Fluxo legado continua em paralelo e sem mudanca.
```

Arquivos:

```text
src/features/uni-os/adapters/context/
  contextAdapter.js
  contextNormalizer.js
  contextSchema.js
  contextAdapter.test.js
  README.md
  index.js
```

`src/features/uni-os/adapters/featureFlags.js` centraliza a mesma constante
`UNI_OS_ENABLED=false` usada por Parser Adapter e Context Adapter.

## 3. Schema

```json
{
  "timestamp": "2026-07-12T20:00:00.000Z",
  "session": {
    "authenticated": true,
    "sessionId": null,
    "state": "authenticated"
  },
  "user": {
    "id": "user-id",
    "profileCompleted": true
  },
  "workspace": {
    "id": "workspace-id",
    "role": null
  },
  "conversation": {
    "channel": "text",
    "language": "pt-BR",
    "timezone": "America/Sao_Paulo"
  },
  "personality": {
    "mode": "balanced"
  },
  "featureFlags": {
    "uniOS": false,
    "premiumVoice": false
  },
  "metadata": {
    "version": "1.0"
  }
}
```

O schema e todos os objetos internos sao profundamente congelados. Identifiers
vazios ou acima do limite seguro viram `null`.

## 4. Fontes somente leitura

### SessionContext

O runtime cria uma projecao segura antes de chamar a conversa:

- `isAuthenticated`;
- `isLoading`;
- presenca de erro;
- `session.id`, quando existir;
- `user.id`.

O objeto completo de sessao nao e entregue ao adapter. Access token, refresh
token, JWT, e-mail e metadata de autenticacao ficam fora da fronteira.

### Profile

Somente `id` e `onboarding_completed` sao permitidos. Nome, e-mail, telefone e
preferencias nao relacionadas nao entram no schema.

### Workspace

Somente `id` e role explicitamente fornecida sao aceitos. O adapter nao infere
role pelo owner e nao copia nome, empresa ou dados financeiros. Como o provider
atual nao expoe membership role junto ao workspace, `role` permanece `null` no
runtime atual.

### Personalidade

Somente o identificador conhecido `balanced`, `direct`, `warm` ou `strategic`.
O adapter nao resolve nem altera personalidade.

### Ambiente da conversa

- idioma disponibilizado pelo navegador;
- timezone disponibilizado por `Intl.DateTimeFormat`;
- canal `text` ou `voice`;
- flags booleanas conhecidas.

O canal atual permanece `text`, pois Voice Input ja entrega apenas transcricao
ao contrato de conversa. Transportar `voice` exigira uma etapa futura separada
para nao modificar Voice nesta fase.

## 5. Normalizacao

### Idioma

Converte `_` para `-`, idioma para minusculas e regiao para maiusculas:

- `pt_br` -> `pt-BR`;
- `EN-us` -> `en-US`;
- `pt` permanece `pt`.

Entrada invalida usa o default do produto `pt-BR`.

### Timezone

Timezone e validado pelo runtime `Intl`. Valores validos sao canonicalizados;
valores ausentes ou invalidos usam `UTC`. Nenhum horario financeiro e
recalculado pelo adapter.

### Canal

Somente `text` e `voice`. Valor desconhecido usa `text` sem alterar o provider
de origem.

### Role

Somente `owner`, `admin`, `member` e `viewer`. Valores desconhecidos ficam
`null`; nenhuma permissao e inferida.

### Estado da sessao

Somente `anonymous`, `authenticated`, `loading` e `error`, derivados dos sinais
publicos ja existentes no `SessionContext`.

### Feature flags

Somente boolean `true` ativa uma flag. Strings como `"true"` nao sao
promovidas. No modo sombra ativo, a copia enviada ao UNI OS marca `uniOS: true`
para representar aquela observacao; a constante global continua falsa.

## 6. Modo sombra

Parser Adapter e Context Adapter compartilham `UNI_OS_ENABLED=false`.

Quando falso:

- o adapter retorna `DISABLED`;
- o contexto nao e construido;
- o UNI OS nao e chamado;
- nenhum log e produzido.

Quando explicitamente habilitado em uma futura validacao DEV:

1. parser gera o resultado legado;
2. Parser Adapter cria `parsedIntent`;
3. Context Adapter cria o contexto seguro;
4. ambos seguem na mesma chamada `uniOS.process()`;
5. o resultado e descartado;
6. falhas retornam `FAILED_SAFE` e nao propagam.

O Context Adapter tambem oferece runner sombra isolado para testes e validacao
arquitetural, sem uso no runtime atual.

## 7. Logs DEV

Com flag ativa, os logs `[UNI OS]` mostram apenas:

- versao e timestamp do contexto;
- autenticacao, estado e presenca de sessionId;
- presenca de workspace e role;
- idioma e timezone;
- canal;
- flags booleanas.

Nunca registrar:

- IDs de usuario, sessao ou workspace;
- e-mail ou telefone;
- tokens, JWT, headers ou chaves;
- nomes de workspace;
- texto da conversa;
- valores, contas, categorias ou outros dados financeiros.

## 8. Falhas e objetos vazios

Fontes ausentes geram um contexto vazio seguro:

- sessao anonima;
- IDs e role nulos;
- canal `text`;
- idioma `pt-BR`;
- timezone `UTC`;
- personalidade `balanced`;
- flags falsas.

Falhas no processor sombra sao contidas e nao chegam ao fluxo da aplicacao.

## 9. Testes

A cobertura valida:

- schema completo e imutabilidade profunda;
- idioma e timezone;
- canais text e voice;
- roles conhecidas;
- estados de sessao;
- profile e workspace;
- feature flags estritamente booleanas;
- fontes sem mutacao;
- exclusao de campos sensiveis;
- objetos vazios;
- flag compartilhada desligada;
- modo sombra e descarte;
- logs sem IDs ou dados privados;
- falhas contidas;
- contexto e parsedIntent na mesma chamada ao UNI OS.

## 10. Integracao futura

1. transportar channel de forma neutra sem modificar Voice Input;
2. expor role segura por um adapter de membership somente leitura;
3. definir um sessionId opaco, caso Auth passe a fornecê-lo;
4. substituir a constante por feature flag DEV controlada;
5. comparar contextos por metricas agregadas e sem identificadores;
6. manter o resultado do UNI OS descartado durante observacao;
7. revisar privacidade antes de ampliar qualquer campo do schema.

## 11. Estado

O Context Adapter esta implementado, testado e conectado ao caminho sombra do
Parser Adapter. A flag continua falsa e nenhuma mudanca visual ou funcional foi
introduzida.
