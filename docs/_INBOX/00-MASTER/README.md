# Clientes (CRM)

## ⚠️ Sem docx específico — padrão mínimo coerente

Nenhum documento enviado descreve este módulo. Por instrução explícita,
usei o vocabulário universal de qualquer CRM (nome/email/telefone/
empresa/status/tags/notas/timeline) — não uma funcionalidade inventada
para a UniFlow AI especificamente. Ver suposições de schema completas
em `services/supabase/crm.service.js`.

## Estrutura

```
src/features/crm/
├── CustomerBoard.jsx        # composição raiz (papel de MainDashboard/ChatWindow)
├── CustomerList.jsx / .module.css
├── CustomerCard.jsx
├── CustomerDetails.jsx      # Modal com status/tags/notas/timeline
├── CustomerForm.jsx         # Modal de criação
├── CustomerFilters.jsx
├── CustomerSearch.jsx
├── CustomerTags.jsx
├── CustomerStatus.jsx
├── CustomerTimeline.jsx
├── CustomerNotes.jsx
├── constants.js
├── useCustomers.js / useCustomer.js
└── index.js

src/services/supabase/crm.service.js   # "CustomerService" do roadmap
src/pages/CustomersPage/
```

## Decisão: por que não há `Badge`/`Tooltip` importados

`Badge.jsx` e `Tooltip.jsx` não foram enviados nesta conversa — não
tenho a API real deles. Em vez de adivinhar props e arriscar quebrar a
integração, segui o padrão **já observado no código real** enviado
(`Sidebar.jsx`/`Topbar.jsx`): badges são `<span>` com classes de
`utilities.css` (`uf-bg-*-subtle` + `uf-text-*` + `uf-rounded-full`).
`CustomerStatus`/`CustomerTags` seguem exatamente esse precedente.
Se `Badge.jsx` for compartilhado depois, migrar é trocar só esses dois
arquivos.

## Reuso do Design System

- `Card`, `Avatar`, `Modal` (+ Header/Body/Footer), `Input`, `Button`,
  `Loader` — todos importados exatamente como construídos, zero alteração.
- Validação do `CustomerForm` reaproveita `validateEmail`/`validateRequired`
  de `src/utils/validators.js` (os mesmos usados em Login/Signup) — nenhuma
  regra de validação nova.
- Grid de `CustomerList` é a mesma exceção documentada em
  `DashboardGrid.module.css`: spans de CSS Grid não são token de marca.

## Fluxo

```
CustomerBoard
 ├─ useCustomers (lista + busca com debounce de 300ms + filtro de status)
 ├─ CustomerForm → crmService.createCustomer → log automático em cliente_atividades
 └─ CustomerDetails (useCustomer, por customerId)
     ├─ mudar status → crmService.updateCustomer → nova atividade na timeline
     └─ adicionar nota → crmService.addNote → nova atividade na timeline
```

## O que falta para produção

- Edição dos campos básicos do cliente (hoje só criação + mudança de status/notas).
- Exclusão de cliente (o service já tem `deleteCustomer`, sem UI ainda).
- Paginação — `listCustomers` traz tudo de uma vez; ok para volume baixo,
  precisa de paginação/infinite scroll antes de escalar (mesma ressalva
  de performance já registrada no README do Dashboard).
