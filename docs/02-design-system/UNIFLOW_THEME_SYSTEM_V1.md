# UniFlow Theme System V1

## Objetivo

O Theme System V1 cria a infraestrutura oficial de aparência da UniFlow AI sem
realizar uma migração global de telas. A preferência visual fica separada da
identidade da marca e não depende de backend, autenticação ou perfil remoto.

## Temas

| Nome público | Identificador | Comportamento |
|---|---|---|
| Claro | `light` | Fundo claro suave, superfícies brancas e textos escuros. |
| Escuro | `dark` | Paleta neutra, pouco saturada e confortável para uso prolongado. |
| UniFlow | `uniflow` | Identidade premium com azul `#2563EB`, roxo `#7C3AED` e verde `#10B981`. |
| Sistema | `system` | Preferência que resolve dinamicamente para Claro ou Escuro. |

Para uma pessoa sem preferência salva, o padrão é **Claro**. UniFlow e Escuro
nunca seguem automaticamente a configuração do aparelho.

## Arquitetura

`ThemeProvider` é montado em `src/main.jsx`, acima da aplicação. O hook
`useTheme()` expõe:

- `selectedTheme`: escolha persistida pelo usuário;
- `effectiveTheme`: paleta aplicada ao DOM;
- `setTheme(preference)`: valida, persiste e aplica a nova preferência.

O elemento `<html>` recebe dois atributos independentes:

```html
<html data-theme="light" data-theme-preference="system">
```

Isso permite preservar a escolha Sistema enquanto a paleta efetiva muda.

## Tokens semânticos

`src/styles/theme.css` permanece como fonte única dos tokens `--uf-*`. Foram
reutilizados ou consolidados os seguintes papéis:

- fundos: `--uf-color-bg-canvas`, `--uf-color-bg-surface`,
  `--uf-color-bg-elevated` e `--uf-color-bg-sunken`;
- texto: `--uf-color-text-primary`, `--uf-color-text-secondary`,
  `--uf-color-text-tertiary` e `--uf-color-text-inverse`;
- bordas e camadas: `--uf-color-border-*`, `--uf-color-divider` e
  `--uf-color-overlay`;
- ação e estados: `--uf-color-primary*`, `--uf-color-success`,
  `--uf-color-warning` e `--uf-color-danger`;
- acessibilidade: `--uf-focus-ring-color`;
- profundidade: `--uf-shadow-card`, `--uf-shadow-elevated` e sombras existentes;
- marca: `--uf-gradient-brand` e `--uf-gradient-ai`.

Componentes novos não devem consumir diretamente uma cor fixa quando existir
um papel semântico equivalente.

## Persistência

A preferência é salva somente em:

```text
uniflow.theme.preference
```

Valores aceitos: `light`, `dark`, `uniflow` e `system`. Valores inválidos,
storage indisponível ou falhas de leitura resultam em Claro. Nenhum dado pessoal
ou sensível é armazenado. Uma sincronização futura com o perfil poderá consumir
o mesmo contrato sem substituir a persistência local nesta etapa.

## Tema Sistema

Sistema observa `(prefers-color-scheme: dark)`. A preferência selecionada
continua `system`, enquanto o tema efetivo alterna entre `light` e `dark`. O
listener reage em tempo real e é removido no cleanup do provider.

## Acessibilidade

O seletor usa radios nativos, labels acessíveis, foco visível, área de toque
superior a 44 px e texto explícito “Selecionado”. A seleção não depende apenas
de cor. Transições são desativadas em `prefers-reduced-motion: reduce`.

## Integração V1

Áreas demonstrativas desta etapa:

- raiz do aplicativo e cores globais de fundo/texto;
- Mobile App Shell, que já utiliza tokens semânticos;
- seção Aparência da página Configurações.

Não foram alterados Home Mobile, Financeiro Mobile, Uni AI, Cognitive Live
Chart, Mobile Context Header, Bottom Navigation, autenticação, Supabase, rotas
ou UNI OS.

## Flash de inicialização

O CSS adota Claro como padrão e o provider usa `useLayoutEffect` para aplicar a
preferência salva antes da pintura do React. Em carregamentos com JavaScript
bloqueado, a página permanece no fallback Claro. Uma futura etapa pode adicionar
um bootstrap mínimo no `<head>` se for necessário eliminar também o intervalo
anterior à inicialização do React.

## Migração gradual

1. Migrar primeiro layouts e componentes compartilhados que ainda usem cores fixas.
2. Validar contraste e estados em Claro, Escuro e UniFlow por conjunto de telas.
3. Migrar páginas desktop por domínio, começando por componentes reutilizáveis.
4. Tratar gráficos e visualizações com paletas semânticas próprias.
5. Só depois considerar persistência opcional no profile do usuário.

## Itens ainda não adaptados

- telas desktop com estilos visuais próprios;
- páginas de autenticação e onboarding;
- Uni AI e experiências de voz;
- módulos financeiros e gráficos;
- Cognitive Live Chart;
- componentes legados que usam cores fixas ou primitivas diretamente.
