# UniFlow Theme System V1

Fundação local de aparência da UniFlow AI. A feature separa a preferência
salva (`light`, `dark`, `uniflow` ou `system`) do tema efetivo aplicado ao DOM.

## Contrato

- `ThemeProvider` mantém a preferência, resolve o sistema e aplica os atributos.
- `useTheme()` expõe `selectedTheme`, `effectiveTheme` e `setTheme`.
- `themeStorage.js` persiste somente `uniflow.theme.preference` no `localStorage`.
- `themeResolver.js` concentra validação, resolução e ciclo de vida do media query.
- `ThemeSelector` oferece as quatro opções na página Configurações.
- `src/styles/theme.css` continua sendo a fonte única dos tokens `--uf-*`.

## DOM

```html
<html data-theme="dark" data-theme-preference="system">
```

`data-theme` sempre recebe uma paleta efetiva. `data-theme-preference` preserva
a escolha do usuário, inclusive `system`.

## Limites

Esta versão aplica os tokens na raiz, no estilo global, no Mobile App Shell que
já consome tokens e no seletor de Configurações. Componentes com cores fixas
continuam fora do escopo e serão migrados gradualmente.
