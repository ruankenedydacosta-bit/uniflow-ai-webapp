# Supabase Env Setup

Este documento registra a configuracao inicial de ambiente para a futura integracao real com Supabase.

## Objetivo

Preparar a UniFlow AI para sair do demo mockado e entrar na Fase 2 com Supabase Auth, workspaces, RLS e dados reais, sem quebrar a experiencia atual.

## Variaveis necessarias

O app usara variaveis Vite:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use `.env.example` como referencia.

## Regras de seguranca

- Nunca commitar `.env` real.
- Nunca colocar chaves reais em codigo fonte.
- Nunca expor service role key no frontend.
- Usar apenas a anon key publica do Supabase no app web.
- Habilitar RLS antes de conectar dados sensiveis.

## Estado atual

O demo atual continua funcionando sem `.env` e sem Supabase configurado.

Nesta etapa, `src/services/supabaseClient.js`, `authService.js` e `workspaceService.js` existem apenas como base tecnica. Eles nao substituem os mocks e nao conectam Login, Onboarding ou paginas internas ao Supabase.

## Proxima etapa

Quando a dependencia `@supabase/supabase-js` for instalada e o projeto Supabase estiver criado, o cliente real deve ser ativado em `src/services/supabaseClient.js`.

Depois disso, a migracao deve acontecer por modulo, preservando o demo:

1. Auth basica.
2. Profiles.
3. Workspaces.
4. Membership/RLS.
5. Access real substituindo o mock gradualmente.
6. Modulos reais por dominio.

