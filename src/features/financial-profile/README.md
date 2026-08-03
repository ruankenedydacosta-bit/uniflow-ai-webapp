# Financial Profile System V1

Camada local que mantém o perfil financeiro ativo da experiência mobile.

## Contrato

- Modos válidos: `pf` e `pj`.
- Padrão seguro: `pf`.
- Persistência: `localStorage` em `uniflow.financial-profile`.
- Escopo: apenas o ramo mobile de `AuthenticatedLayout`.
- Transição: fade-out, troca do snapshot e fade-in em 200 ms.

O provider não consulta backend, não conhece autenticação e não transforma dados. Home e Financeiro selecionam snapshots mockados imutáveis a partir do perfil ativo. O perfil selecionado fica separado do perfil já exibido durante a breve transição, para que o controle responda imediatamente sem trocar conteúdo antes do fade-out.

Uma futura persistência por usuário poderá observar o mesmo contrato, sem transformar esta preferência local em dado de autenticação.
