# Apresentacao inicial V1

Carrossel autenticado de tres slides exibido uma vez por usuario antes da
jornada principal simplificada.

## Fluxo

`Login/Cadastro -> /apresentacao -> /plano-pessoal`

O destino e centralizado em `PRESENTATION_NEXT_ROUTE`, que agora aponta para a
Etapa 3 (Plano Pessoal).

## Persistencia

O schema atual de `profiles` possui apenas os campos do onboarding legado e nao
tem um campo proprio para esta apresentacao. Para nao misturar contratos nem
criar migration nesta etapa, a conclusao usa a chave local versionada
`uniflow.presentation.v1.completed:<userId>`. O namespace por usuario impede
heranca entre contas no mesmo navegador. A API de storage esta isolada para
permitir futura persistencia remota sem alterar o carrossel.

Para uma futura opcao "Rever apresentacao" na area Conta, navegar para
`/apresentacao` com `state: { replayPresentation: true }`.

O questionario em `/onboarding` continua existente, mas nao participa deste
fluxo.
