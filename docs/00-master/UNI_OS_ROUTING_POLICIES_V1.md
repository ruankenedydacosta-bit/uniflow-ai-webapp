# UNI OS Routing Policies V1

## Objetivo

O Routing Policies Engine define regras determinísticas que o futuro Model Router
usará para organizar candidatos. Ele recebe uma capability, o Provider Registry e
metadados compilados, mas não escolhe um provedor final e não executa integrações.

## Arquitetura

O módulo está em `src/features/uni-os/llm/routing-policies/`:

- `routingPolicyCatalog.js`: catálogo imutável das policies;
- `routingPolicySchema.js`: contrato, clone e deep freeze;
- `routingPolicyValidator.js`: integridade de entradas e decisões;
- `routingDecision.js`: filtros e ordenação determinísticos;
- `routingPolicyEngine.js`: avaliação e modo sombra;
- `index.js`: API pública;
- `routingPolicies.test.js`: garantias unitárias.

## Políticas

- `DEFAULT`: prioridade declarada pelo Provider Registry;
- `LOW_COST`: menor custo relativo primeiro;
- `LOW_LATENCY`: menor latência relativa primeiro;
- `HIGH_QUALITY`: prioridade catalogal, sem inferir qualidade externa;
- `VISION_REQUIRED`: exige suporte declarado a visão;
- `VOICE_REQUIRED`: exige suporte declarado a voz;
- `STRUCTURED_OUTPUT`: exige suporte declarado a saída estruturada;
- `FUNCTION_CALLING`: exige suporte declarado a function calling;
- `OFFLINE_ONLY`: limita candidatos ao tipo local;
- `LOCAL_ONLY`: limita candidatos ao tipo local;
- `PREMIUM_ONLY`: exige tier explícito `PREMIUM` ou `ENTERPRISE`;
- `ENTERPRISE_ONLY`: exige tier explícito `ENTERPRISE`;
- `FALLBACK_ALLOWED`: habilita fallback e usa sua prioridade declarada;
- `SAFE_MODE`: exige provider `AVAILABLE` e health `HEALTHY`.

Ausência de metadado de acesso nunca concede acesso premium ou enterprise. Um
provider desabilitado ou indisponível nunca aparece em `allowedProviders`.

## Schema

O snapshot contém `routingDecision`, `version` e `metadata`. A decisão inclui:

- policy aplicada;
- providers permitidos e bloqueados;
- ordem declarativa de prioridade;
- fallback habilitado ou não;
- requisitos de contexto estruturado, streaming, visão e voz;
- metadata técnica sem conteúdo do usuário.

`selectedProvider` permanece sempre `null`, e `finalSelectionPerformed` permanece
sempre `false`. As listas representam compatibilidade com regras, não uma escolha.

## Validação

O validator garante:

- policy oficial e catálogo sem duplicidades;
- capability oficial;
- providers conhecidos e sem IDs duplicados;
- prioridades inteiras, positivas e únicas;
- compatibilidade entre capability e providers permitidos;
- ausência de duplicidades ou sobreposição na decisão;
- ordem composta somente por providers permitidos;
- classificação completa entre permitidos e bloqueados.

Falhas diretas geram `RoutingPolicyValidationError` com códigos controlados. No
modo sombra, elas são contidas em `FAILED_SAFE`.

## Fluxo

```text
Capability + Provider Registry + Compiled Context Metadata
                         |
                         v
                Routing Policy Validator
                         |
                         v
              Deterministic Policy Filters
                         |
                         v
              Immutable Routing Decision
                         |
                         v
               Shadow observer (discarded)
```

## Garantias

- nenhuma API, URL, credencial ou autenticação;
- nenhum modelo conhecido ou selecionado;
- nenhum provedor chamado ou executado;
- nenhum prompt, texto ou decisão da aplicação produzido;
- nenhum dado do usuário registrado em logs;
- deep clone antes do deep freeze;
- `UNI_OS_ENABLED` continua `false`;
- resultado sombra sempre descartado.

## Limitações

Custos, latências, prioridades e capabilities são valores catalogais, não
telemetria real. `SAFE_MODE` não consulta saúde externa. Políticas de acesso leem
somente metadados explícitos e não substituem autorização técnica de backend.

## Roadmap

1. Criar o Model Router representacional.
2. Combinar Capability Registry, Provider Registry e Routing Policies.
3. Produzir decisão final ainda sem chamadas externas.
4. Definir contratos seguros de configuração antes de qualquer integração real.

