# Handoff: Repaginação UniFlow (mobile) — a Uni no centro

## Overview
Redesign completo do app mobile UniFlow (repo `jonatasoc/uniflow-ai-webapp`, branch `master`). A assistente Uni passa a ser a presença central do app: um orb animado no meio da navegação inferior, modo voz em tela cheia e cards da Uni nas telas. Visual escuro (Nocturne) com luz nas três cores da marca.

Este pacote contém 18 telas + 1 componente compartilhado. Este README é a fonte de verdade; os arquivos HTML são a referência visual.

## About the Design Files
Os arquivos em `screens/` são **referências de design em HTML** (protótipos). Não são código de produção para copiar. A tarefa é **recriar essas telas no codebase React existente**, usando os componentes, rotas, hooks e padrões já presentes no repositório (shell mobile, `shellRoutes.js`, `BottomNavigation.jsx`, `UniCenterButton.jsx`, features em `src/features/*`, páginas em `src/pages/*`).

Para ver uma tela: abra `screens/00 Mapa de telas.dc.html` em um navegador (mostra todas), ou qualquer `screens/NN *.dc.html` individual. Os arquivos precisam do `support.js` ao lado (já incluído). O CSS de tokens está em `tokens/nocturne-styles.css`.

Como ler um arquivo de tela: o markup fica entre `<x-dc>` e `</x-dc>`. Todo estilo é inline (`style="..."`), então os valores exatos estão no próprio elemento. `<dc-import name="Uni Orb" size="64" mode="parada">` é o componente compartilhado do orb. `{{ nome }}` são valores vindos da classe `Component` no fim do arquivo.

## Fidelity
**High-fidelity.** Cores, tipografia, espaçamento, raios e textos são finais. Recriar com fidelidade, mas com os componentes do codebase (não copiar o HTML).

## Mapa de telas → código

| # | Tela | Arquivo de design | Onde vive no repo |
|---|------|-------------------|-------------------|
| 01 | Home | `01 Home.dc.html` | `src/features/dashboard/mobile/MobileHomeView.jsx`, `homeMobile.mock.js` |
| 02 | Uni · Conversa | `02 Uni Conversa.dc.html` | `src/features/uni-chat/*` |
| 03 | Uni · Voz | `03 Uni Voz.dc.html` | `src/features/uni-instant/*` (UniInstantButton, UniVoiceWaves, UniInstantResultCard) |
| 04 | Financeiro | `04 Financeiro.dc.html` | `src/pages/financeiro/mobile/MobileFinanceiroView.jsx` + components |
| 05 | Nova movimentação (sheet) | `05 Nova movimentacao.dc.html` | formulário de transação existente em financeiro |
| 06 | Agenda | `06 Agenda.dc.html` | `src/pages/AgendaPage.jsx` |
| 07 | Mais | `07 Mais.dc.html` | `src/layouts/mobile-app-shell/MoreMenu.jsx`, `shellRoutes.js` |
| 08 | Metas | `08 Metas.dc.html` | `src/pages/ObjetivosPage.jsx`, `src/features/goals/*` |
| 09 | Visão de futuro | `09 Visao de futuro.dc.html` | `src/features/future/FuturePage.jsx` |
| 10 | Categorias | `10 Categorias.dc.html` | `src/features/categories/*` |
| 11 | Open Finance (demo) | `11 Open Finance.dc.html` | `src/pages/OpenFinancePage.jsx` |
| 12 | Relatórios | `12 Relatorios.dc.html` | `src/pages/ReportsPage.jsx` |
| 13 | Notificações | `13 Notificacoes.dc.html` | `src/features/notifications/*` |
| 14 | Configurações | `14 Configuracoes.dc.html` | `src/pages/SettingsPage.jsx` |
| 15 | Login | `15 Login.dc.html` | `src/pages/LoginPage.jsx`, `src/features/auth-mobile/*` |
| 16 | Clientes (Empresa) | `16 Clientes.dc.html` | `src/pages/ClientesPage.jsx` |
| 17 | CRM (Empresa) | `17 CRM.dc.html` | `src/pages/CRMPage.jsx` |
| 18 | Projetos (Empresa) | `18 Projetos.dc.html` | `src/pages/ProjectsPage.jsx` |
| — | Uni Orb (componente) | `Uni Orb.dc.html` | novo: `src/components/uni/UniOrb.jsx`; substitui o miolo de `UniCenterButton.jsx` |

## Design Tokens

### Base (Nocturne — `tokens/nocturne-styles.css`)
Mapear para CSS variables globais (ou theme do app). Nomes usados nas telas:
- `--color-bg` #161826 (fundo) · `--color-surface` (cards) · `--color-text` #e9e9ed · `--color-divider`
- `--color-neutral-100…900` (100 = mais claro). Texto secundário: 300/400; texto terciário/placeholder: 500; fundos de inputs e trilhos: 900; avatar: 800
- `--color-accent` #9184d9 e ramp `--color-accent-100…900` (usado só em links e no `.btn-primary` padrão)
- `--radius-md` 8px · `--radius-lg` · `--shadow-sm/md/lg`
- `--font-body` / `--font-heading` = Inter, peso máximo 500

### Cores da marca (novas; adicionar como tokens)
```css
--brand-blue:   #1D4EDB;  /* ações, links "Ver …", aba ativa, 1º item da timeline */
--brand-violet: #7C3AED;  /* presença da Uni: borda do card da Uni, botão Parar, orb, FAB, seleção */
--brand-green:  #10B981;  /* dinheiro positivo (Entradas, Saldo previsto), confirmação, rascunho pronto */
/* versões claras para texto pequeno sobre fundo escuro (contraste): */
--brand-blue-text:   color-mix(in oklch, #1D4EDB 55%, var(--color-neutral-100));
--brand-violet-text: color-mix(in oklch, #7C3AED 55%, var(--color-neutral-100));
--brand-green-text:  color-mix(in oklch, #10B981 70%, var(--color-neutral-100));
```
Regra: as cores da marca são **linha e luz, nunca preenchimento sólido** de áreas grandes. Botões continuam outlined (padrão Nocturne).

### Tipografia (px / peso / line-height)
- Título de tela (header): 17 / 500
- Headline do card da Uni: 21 / 500 / 1.3 / letter-spacing −.01em
- Valor grande (saldo, meta): 30 / 500 / letter-spacing −.02em / tabular-nums
- Valor em input de valor: 40 / 500
- Título de seção: 15 / 500
- Corpo: 14 / 400 / 1.5–1.55
- Secundário: 13 · Meta/legenda: 12 · Rótulo de nav e tag: 11
- Rótulo de grupo (uppercase): 11 / letter-spacing .06em / neutral-500
- Todos os números: `font-variant-numeric: tabular-nums`

### Espaçamento e forma
- Tela: 390×844, padding lateral 22px, gap entre blocos 18px (16 no chat, 20 no Mais)
- Card: padding 16, radius `--radius-lg`, gap interno 12, fundo `--color-surface`, borda `inset 0 0 0 1px color-mix(in oklch, var(--color-neutral-100) 8%, transparent)`
- Card da Uni: fundo `linear-gradient(155deg, color-mix(in oklch,#1D4EDB 22%,var(--color-surface)), color-mix(in oklch,#7C3AED 14%,var(--color-surface)) 45%, var(--color-surface) 80%)`; borda `inset 0 0 0 1px color-mix(in oklch,#7C3AED 28%,transparent)` + `--shadow-sm`
- Ícone em "caixa": 36×36, radius 12, fundo neutral-900
- Input/select: altura 44, radius `--radius-md`, fundo neutral-900, mesma borda de card
- Chip de filtro: 12px, padding 5×10, radius 999; ativo = borda #7C3AED + texto violet-text
- Segmented: trilho neutral-900 padding 3 radius md; opção ativa = fundo surface + borda inset violet 35%
- Toggle on: 40×22, fundo `color-mix(in oklch,#7C3AED 60%,var(--color-neutral-900))` + glow `0 0 10px violet 40%`
- Barra de progresso: altura 3, trilho neutral-900, preenchimento gradiente blue→violet (ou blue→green em metas) com `box-shadow: 0 0 8px <cor final>`
- FAB: 52×52 circular, canto inferior direito (right 22, bottom 96), borda violet, fundo surface 85% + blur 8, glow violet 40%
- Halo de topo (todas as telas com header padrão): elipse 520×420 em top −180px centralizada, dois radial-gradients (blue 26% em 35%/55%, violet 24% em 70%/45%). `pointer-events:none`
- Fundo do modo voz e do login: três radial-gradients (blue 30% em 30%/28%, violet 30% em 72%/34%, green 12% na base) sobre `--color-bg`
- Ícones: Phosphor (`@phosphor-icons/web`), 20–22px; ativos usam a variante `fill`

## Componentes compartilhados

### Header padrão
Padding 18 22 8. Esquerda: logo 26×26 + título 17/500. Direita: chip do espaço ("Pessoal"/"Empresa" com caret, 12px, borda neutral 10%) + avatar 32 circular (neutral-800, iniciais 12/500). Telas internas (Mais → X): seta voltar + título, ação à direita como icon button.

### Navegação inferior (todas as telas, exceto Voz, Login e sheet)
Linha superior em degradê que some nas pontas (`linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% − 48px), transparent)`). Grid 5 colunas: Home · Financeiro · **Uni Orb 64px (margin-top −34, rótulo "Uni" em violet-text)** · Agenda · Mais. Ativo: ícone fill em blue-text, texto `--color-text`; inativo: neutral-500. Rótulos 11px. Toque no orb abre 02 Conversa; segurar abre 03 Voz (comportamento já existente em `UniCenterButton`/`usePressAndHold`).

### Uni Orb (`Uni Orb.dc.html` → `UniOrb.jsx`)
Props: `size` (px), `mode` = `parada | ouvindo | pensando | falando`, `animations` (bool; respeitar `prefers-reduced-motion`).
Camadas, de trás para frente (todas `position:absolute`, circulares):
1. **Glow**: inset −40%, `radial-gradient(closest-side, violet G%, blue G/2% 55%, transparent)`; G = 20 parada, 34 ouvindo/falando, 42 pensando. Anima `uniBreath 4s`.
2. **Ripples** (só ouvindo/falando): 3 anéis 1px nas cores blue, violet, green; `uniRipple` 2.4s (ouvindo) ou 1.6s (falando), delays escalonados.
3. **Anel externo**: `conic-gradient(from 0deg, transparent 0 6%, #1D4EDB 22%, #7C3AED 40%, transparent 54%, #7C3AED 66%, #10B981 82%, transparent 96%)`, recortado em anel via mask `radial-gradient(farthest-side, transparent calc(100% − (t+.5)px), #000 calc(100% − t px))` com t = max(1.5, size/70). Gira `uniSpin`: 9s parada, 4s ouvindo, 5s falando, 1.2s pensando.
4. **Anel interno**: inset 10%, opacity .55, `conic-gradient(from 180deg, transparent 0 20%, #10B981 40%, #1D4EDB 55%, transparent 72%)`, gira ao contrário a 1.7× o tempo.
5. **Logo** (só se size ≥ 28): inset 18%, SVG `uni-logo.svg` a 78%. Os dois "U" giram no eixo Y em sentidos opostos (`perspective(60px) rotateY`), parando a cada meia volta: keyframes `0%,20%: 0deg · 50%,70%: ±180deg · 100%: ±360deg`, easing `cubic-bezier(.45,0,.55,1)`. Duração: 9s parada, 6s ouvindo, 5s falando, 3.6s pensando. O U interno começa com delay = 12% da duração. O ponto azul pulsa com `uniBreath` na mesma duração.
Keyframes:
```css
@keyframes uniSpin{to{transform:rotate(360deg)}}
@keyframes uniBreath{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.06);opacity:1}}
@keyframes uniRipple{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.9);opacity:0}}
@keyframes uniU1{0%,20%{transform:perspective(60px) rotateY(0)}50%,70%{transform:perspective(60px) rotateY(180deg)}100%{transform:perspective(60px) rotateY(360deg)}}
@keyframes uniU2{0%,20%{transform:perspective(60px) rotateY(0)}50%,70%{transform:perspective(60px) rotateY(-180deg)}100%{transform:perspective(60px) rotateY(-360deg)}}
@keyframes uniBar{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}
```
Tamanhos usados: 18 (inline em cards, sem logo), 22 (avatar de mensagem/dica), 28 (header do chat), 64 (nav), 88 (Open Finance), 120/180 (voz), 132 (login).

### Card da Uni
Cabeçalho 12px violet-text com orb 18 + "Uni · 21:40". Headline 21/500. Apoio 14 neutral-300. Botões: `.btn-primary` + `.btn-ghost`, `white-space:nowrap`.

### Card de rascunho (confirmação)
Borda inset green 30%. "Saída · rascunho" 12 neutral-400 + tag categoria. Valor 26–28/500. Grade rótulo/valor 13px. Botões: Confirmar (`.btn-primary` com `border-color:#10B981; color: green-text`, flex 1) · Editar (`.btn-secondary`) · Cancelar (`.btn-ghost`). **Nada é salvo sem Confirmar.**

### Timeline (Home, Agenda)
Linha vertical 1px a 4px da esquerda, gradiente blue → violet (55%) → green 50% transparente. Itens em grid 44px (hora, 13 neutral-400 tabular) + conteúdo. Marcador: próximo item = 9px sólido na cor + `0 0 10px`; demais = 7px vazado borda 1px na cor clara; concluído = opacity .5 + line-through.

## Interactions & Behavior
- **Nav**: toque no orb → 02; segurar → 03 (voz). Demais abas: rota.
- **03 Voz**: estados Ouvindo (azul; waveform 34 barras 3px, gap 4, alturas 10–48 em envelope senoidal, cores blue/violet/green por terço, `uniBar` 0.55–1.15s com delays negativos) → Entendendo (violeta; orb acelera, sem ondas, transcrição fixa) → Rascunho pronto (verde; orb encolhe para 120 com transição .5s, card de rascunho aparece). Status: dot 6px + glow + rótulo 13px letter-spacing .04em na cor do estado. Transcrição ao vivo entre aspas, 22/500, caret "|" piscando. Botões inferiores: Escrever 48 · Parar 60 (violet, fill) · Conversa 48.
- **05 Sheet**: sobe sobre a tela com backdrop `color-mix(bg 70%)` + blur 6; handle 40×4; radius 28 no topo; borda superior violet 30%. Botão primário "Salvar saída" muda conforme o segmento (Salvar entrada / Salvar transferência).
- **Chips/segmented**: seleção única; transição de 150ms.
- **Hover/pressed/focus**: padrão Nocturne (`:focus-visible` outline 2px accent). Não mexer.
- **Reduced motion**: `animations=false` no orb desliga spin/ripple/U; manter cores.
- **Scroll**: conteúdo rola; header e nav fixos; gradiente de `transparent → bg` nos 24px acima da nav.

## State Management
- Espaço ativo (Pessoal/Empresa): já existe (`workspaces-pf-pj`). Itens "Gestão" do Mais só aparecem em Empresa.
- Orb: `mode` deriva do estado do `uni-instant` (idle/listening/thinking/speaking).
- Rascunho: estado local até Confirmar; Confirmar → chama o serviço de transação existente.
- Mocks de conteúdo nas telas (R$ 6.500 etc.) são ilustrativos; ligar aos dados reais.

## Texto de interface
Todos os textos das telas já seguem `skills/texto-de-interface/SKILL.md` (incluída). Regras principais: um verbo por ação (registrar, ver, criar), um nome por coisa (**Metas**, não Objetivos; **Pessoal/Empresa**, não PF/PJ; **Financeiro**), Uni fala em 1ª pessoa só dentro da conversa/voz, sem travessão emendando frases, botão diz a ação exata. Copiar os textos exatamente como estão nos arquivos. Renomear rotas/labels "Objetivos" → "Metas" no app.

## Assets
- `screens/uni-logo.svg` — marca (dois U + ponto, gradientes blue→violet e violet→green). Usada no header (26px) e dentro do orb.
- Ícones: Phosphor.
- Sem fotos.

## Files
- `screens/00 Mapa de telas.dc.html` — todas as telas num canvas
- `screens/01…18 *.dc.html` — uma tela por arquivo
- `screens/Uni Orb.dc.html` — componente do orb (lógica de animação em JS no fim do arquivo)
- `screens/support.js`, `screens/uni-logo.svg` — necessários para abrir os HTML
- `tokens/nocturne-styles.css` — tokens e classes base (`.btn`, `.tag`, `.seg`, `.card`)
- `skills/texto-de-interface/SKILL.md` — régua de texto
- `PLANO.md` — ordem de implementação sugerida e prompt para o Claude Code
