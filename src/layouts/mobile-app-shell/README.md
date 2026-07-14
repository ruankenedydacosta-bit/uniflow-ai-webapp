# Mobile App Shell

Infraestrutura mobile-first de navegação da UniFlow AI. `AuthenticatedLayout`
é o único ponto de decisão entre o shell mobile e o `AppShell` desktop atual.

## Uso futuro

```jsx
<AuthenticatedLayout title="Dashboard" mobileTitle="Home">
  <Outlet />
</AuthenticatedLayout>
```

- `onAction` recebe ações sem rota, inclusive `sign-out`.
- `onNavigate` permite telemetria futura sem controlar a navegação.
- o shell mobile é usado abaixo de 768px; a partir de 768px, o `AppShell` atual é preservado.
- safe areas são aplicadas no cabeçalho, menu e navegação inferior.
- nenhum item aplica regras de acesso; o consumidor poderá fornecer uma lista filtrada.

Os guards continuam no `AppContent`, antes do seletor de layout. O shell não
conhece Supabase, regras de negócio ou APIs. Nesta versão, a Home existente é
validada no shell mobile; as demais páginas apenas mantêm suas rotas atuais e
ainda não receberam desenho mobile específico.
