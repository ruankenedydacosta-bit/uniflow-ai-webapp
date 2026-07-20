# UniFlow AI — Fase 1: Autenticação, Login, Cadastro e Onboarding Inteligente

Entrega completa dos 4 módulos pedidos, construída inteiramente sobre o
Design System e os componentes React já existentes (Button, Input, Card,
Avatar) — nenhum token novo, nenhuma cor/espaçamento/radius/sombra
inventados, nenhuma lógica duplicada dos componentes já entregues.

## O que foi entregue

```
src/
├── services/supabase/        # client + auth/profile/onboarding services
├── contexts/AuthContext.jsx  # sessão + perfil (useAuth)
├── hooks/useAuth.js
├── utils/validators.js
├── layouts/AuthLayout/       # split-screen compartilhado Login/Signup
├── routes/AuthGuards.jsx     # ProtectedRoute / PublicOnlyRoute
├── features/
│   ├── auth/
│   │   ├── Login/            # LoginForm + useLoginForm
│   │   ├── Signup/           # SignupForm + useSignupForm
│   │   └── README.md
│   └── onboarding/           # conversa completa (config + hook + UI)
│       └── README.md
└── pages/
    ├── LoginPage/
    ├── SignupPage/
    └── OnboardingPage/

.env.example
```

## Ordem de leitura recomendada

1. `src/services/supabase/README.md` — schema assumido (revisar antes de subir para produção real).
2. `src/features/auth/README.md` — setup, dependências assumidas, wiring de rotas.
3. `src/features/onboarding/README.md` — como a conversa funciona e como estendê-la.

## Rastreabilidade com os documentos de arquitetura

| Módulo (docx) | Implementado em |
|---|---|
| Módulo 01 — Login | `pages/LoginPage`, `features/auth/Login` |
| Módulo 01 — Cadastro | `pages/SignupPage`, `features/auth/Signup` |
| Módulo 02 — Onboarding Inteligente | `features/onboarding` |
| 4.3 Usuários (PostgreSQL) | `services/supabase/profile.service.js` |
| 4.13 Banco Cognitivo da Uni | `services/supabase/onboarding.service.js` |
| UNI OS — "nunca pergunta o que já sabe" | onboarding não repete e-mail (já veio do cadastro) |
| UNI OS — "nunca técnico sem necessidade" | `auth.service.js` traduz todo erro do Supabase |

## Regra do Design System — auditoria rápida

Busquei manualmente por qualquer valor visual fora de `var(--uf-...)` ou
utilitário existente. As únicas exceções, todas documentadas inline
onde ocorrem:

- 3 larguras de "medida de leitura" (`420px`/`480px`/`560px` em
  `AuthLayout`, `OnboardingConversation`, `OnboardingPage`) — não são
  cor/espaçamento/radius/sombra, são medidas de layout que o `theme.css`
  não tokeniza (nem deveria, provavelmente). Se isso se repetir em mais
  telas, é sinal de promover a um token real.
- 1 breakpoint (`767px` em `AuthLayout.module.css`) — espelha manualmente
  `--uf-breakpoint-tablet` porque `@media` não aceita `var()` na condição
  (limitação do CSS). Documentado inline como ponto de manutenção.
- 1 estilo mínimo de checkbox (`SignupForm.module.css`) — `reset.css`
  deixa checkboxes nativos invisíveis; não existe ainda um componente
  `Checkbox` no Design System. Recomendo criá-lo antes da próxima tela
  que precisar de um.

Nenhuma outra exceção foi necessária — toda cor, espaçamento, radius,
sombra, tipografia, duração e easing usados vêm diretamente de
`theme.css`/`utilities.css`/`animations.css`, e Button/Input/Card/Avatar
foram reutilizados exatamente como recebidos, sem nenhuma modificação.

## Bug pré-existente encontrado (não corrigido, fora do meu escopo decidir)

`Input.jsx` chama `useControllableState` com 3 argumentos posicionais,
mas o hook espera um único objeto — na prática, o Input nunca fica
verdadeiramente controlado pelo `value` externo. Detalhado com contexto
completo em `features/auth/README.md`. Contornei o sintoma em
`OnboardingConversation` com uma `key` por step; recomendo corrigir na
origem antes que mais telas dependam de campos de texto controlados.

## O que NÃO foi feito nesta fase (por escopo, não por esquecimento)

- Tela de "Esqueci minha senha" (o link já existe em `LoginForm`, aponta
  para `/esqueci-minha-senha`, mas a página em si não foi pedida na Fase 1).
- Confirmação de e-mail pós-cadastro (depende de como o Supabase Auth
  está configurado no projeto — template de e-mail, domínio de redirect).
- Persistência incremental do onboarding (hoje só salva no final —
  documentado como próximo passo natural no README do módulo).
- Painel de Clareza (Módulo 05) — é o destino pós-onboarding/login, mas
  pertence à Fase 2.
