# Generate Uni Premium Voice

Edge Function exclusiva para demonstrações internas da voz premium da Uni.

## Segredos obrigatórios

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_MODEL_ID`
- `UNI_PREMIUM_VOICE_ALLOWED_USER_IDS`: UUIDs separados por vírgula

`SUPABASE_URL` e `SUPABASE_ANON_KEY` são fornecidos pelo ambiente da função.
Nenhum desses valores pertence ao frontend ou ao Git.

## Contrato

Aceita apenas `POST` autenticado com:

```json
{
  "text": "Resumo final sanitizado da Uni.",
  "personalityProfile": "balanced"
}
```

`user_id`, `voice_id` e `model_id` enviados pelo cliente são rejeitados. A
identidade vem do JWT e precisa constar na allowlist. A função limita o texto a
320 caracteres, bloqueia padrões sensíveis, não persiste texto ou áudio, não
faz retry e mantém apenas uma geração simultânea por usuário em cada isolate.

O controle em memória é adequado somente à demonstração V1. Uma política de
produção exigirá quota persistente e coordenação distribuída.

## Estado

A função está preparada localmente, mas não foi implantada, não possui segredos
configurados e não deve ser usada em produção nesta fase.
