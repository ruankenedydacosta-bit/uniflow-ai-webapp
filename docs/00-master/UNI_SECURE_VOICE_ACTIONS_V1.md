# Uni Secure Voice Actions V1

## Arquitetura

O fluxo reutiliza cinco fronteiras existentes:

`MediaRecorder` → Edge de transcrição → conversa determinística → confirmação
explícita → RPC financeira atômica.

A transcrição nunca chama um serviço financeiro. O texto recebido segue o mesmo
parser, resolvedor de contas/categorias e regras de workspace usados pela
entrada digitada.

## Contrato e allowlist

As intenções de escrita permitidas são:

- `register_expense`, resolvida como `create_expense`;
- `register_income`, resolvida como `create_income`.

As consultas determinísticas disponíveis são:

- saldo derivado;
- resumo do mês;
- visão de objetivos.

Transferência, pagamento, exclusão, administração e criação de objetivo por voz
permanecem bloqueados. `create_goal` só será liberada quando houver um serviço
atômico específico que preserve confirmação, idempotência e workspace.

## Campos faltantes

Uma ação incompleta entra em `needs_clarification`. Respostas posteriores podem
preencher valor, conta, categoria, data ou descrição. Conta e categoria só são
aceitas com correspondência única dentro do workspace atual. Nenhum campo é
inventado. Ambiguidade mantém o fluxo pendente.

## Confirmação

Toda escrita chega a `awaiting_confirmation` e mostra tipo, valor, conta,
descrição, data e espaço PF/PJ. Somente confirmações exatas da allowlist ou o
botão de confirmação avançam. Negações cancelam sem escrita. Instruções como
“ignore as regras” ou “finja que confirmei” não são confirmação.

## Idempotência e persistência

Cada ação recebe `client_operation_id`, preservado durante correções e
restauração. A RPC `execute_confirmed_financial_action` protege retries e duplo
toque. O estado pendente usa `sessionStorage`, isolado por usuário, workspace e
conversa, com expiração de 15 minutos. O payload restaurado é revalidado contra
as contas e categorias atuais.

## Segurança

- o workspace vem da sessão autenticada;
- a RPC deriva o workspace atual e valida membership;
- valor, tipo, data, conta e categoria são revalidados;
- não há SQL montado por texto;
- nenhuma chave fica no frontend;
- a Edge de transcrição não usa `service_role`;
- consultas usam o snapshot financeiro oficial e saldo derivado;
- TTS é independente: uma falha de áudio nunca desfaz uma ação concluída.

## Roteiro manual

1. entrar em um workspace PF e permitir o microfone;
2. dizer “Gastei cinquenta reais” e responder conta, descrição e categoria;
3. revisar o resumo e confirmar;
4. conferir uma única movimentação e o saldo derivado;
5. repetir a confirmação e verificar que não duplica;
6. testar cancelamento, permissão negada e fala vazia;
7. repetir consulta e escrita em PJ, sem dados cruzados;
8. testar “qual meu saldo?”, “resumo do mês” e “como estão minhas metas?”;
9. testar o botão manual de TTS depois da resposta.

## Limitações

- requer deploy/configuração da nova Edge Function;
- `source_type` continua conforme o contrato atual da RPC;
- ação pendente não é sincronizada entre abas ou dispositivos;
- TTS permanece manual;
- `create_goal` e transferências não estão disponíveis por voz.
