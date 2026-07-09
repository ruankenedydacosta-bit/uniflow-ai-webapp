# Regras do Projeto

Este documento consolida regras já existentes em `AGENTS.md`, documentos de arquitetura e estrutura atual do projeto.

## Regras absolutas

- Não apagar arquivos sem autorização.
- Não mover arquivos sem autorização.
- Não alterar o Design System sem autorização.
- Não criar novos tokens CSS sem autorização.
- Não alterar `theme.css` sem autorização.
- Não instalar novas bibliotecas sem autorização.
- Não alterar estrutura de pastas sem autorização.
- Não recriar arquivos já existentes.
- Não usar valores hardcoded quando existir token CSS.
- Sempre reutilizar `src/styles`.
- Sempre reutilizar `src/utils`.
- Sempre trabalhar em passos pequenos.
- Sempre explicar quais arquivos foram alterados.

## Regra do Graphify

O projeto possui instruções para Graphify em `AGENTS.md`.

Antes de responder perguntas sobre o código, quando existir `graphify-out/graph.json`, deve-se rodar:

```bash
graphify query "<pergunta>"
```

Se `graphify-out/wiki/index.md` existir, use esse índice para navegação ampla.

`graphify-out/GRAPH_REPORT.md` deve ser lido apenas em revisão ampla de arquitetura ou quando `query`, `path` e `explain` não forem suficientes.

Após modificar código, rode:

```bash
graphify update .
```

No estado atual observado, existe `graphify-out/cache/stat-index.json`, mas não existe `graphify-out/graph.json`.

## Filosofia de desenvolvimento

- O MVP precisa ser pequeno.
- Cada tela resolve apenas um problema.
- A IA é o centro do produto.
- Tudo precisa reduzir esforço mental.
- O usuário nunca deve sentir culpa.
- A interface deve desaparecer.
- Dados devem virar decisão.
- Toda funcionalidade deve melhorar a vida do usuário.
- O código deve durar anos.
- Qualidade é mais importante que quantidade.

## Fluxo recomendado antes de implementar

Antes de escrever código, uma funcionalidade deve passar por:

1. Ideia.
2. Objetivo.
3. Problema que resolve.
4. Fluxo do usuário.
5. Wireframe.
6. UX.
7. Componentes.
8. Banco.
9. API.
10. Código.
11. Revisão.
12. GitHub.
13. Deploy.

## Regras de UI e UX

- A pessoa deve entender a tela em menos de 5 segundos.
- Nenhuma função essencial deve exigir mais de 3 cliques.
- O usuário não deve precisar de tutorial para funções básicas.
- Nada de dashboards gigantes.
- Nada de 40 botões.
- Nada de menus infinitos.
- A interface deve transmitir calma, clareza, segurança e progresso.
- Textos nunca devem culpar o usuário.

## Regras para a Uni

A Uni deve:

- explicar, não apenas responder;
- perguntar quando não houver contexto suficiente;
- reduzir esforço manual;
- nunca perguntar algo que já sabe;
- aprender com padrões, não com eventos isolados;
- priorizar informações críticas, importantes, relevantes e curiosas;
- interromper somente quando houver valor real.

A Uni nunca deve:

- ser arrogante;
- ser técnica sem necessidade;
- ser alarmista;
- ser julgadora;
- prometer retornos;
- criar urgência artificial;
- manipular emoções.

## Regras de Design System

O Design System fica em `src/styles`.

Camadas existentes:

- `theme.css`;
- `reset.css`;
- `globals.css`;
- `animations.css`;
- `utilities.css`;
- `index.css`.

Tokens e padrões documentados:

- fonte: Poppins;
- cor primária: azul `#104ED8`;
- cor secundária/IA: roxo `#7C3AED`;
- sucesso: verde `#10B981`;
- fundo de marca: cinza escuro `#0F172A`;
- texto principal: branco `#FFFFFF`;
- grid: 12 colunas desktop, 8 tablet, 4 mobile;
- espaçamentos permitidos: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120, 160;
- radius permitidos: 8, 12, 16, 20, 24, 32, 999;
- sombras oficiais: small, medium, large, glow IA;
- ícones sempre outline, com mesmo peso e tamanho;
- animações calmas: fade, scale, slide, glow, voice pulse, loading wave, hover smooth.

## Regras de código React

Dos documentos atuais:

- usar Functional Components;
- usar Hooks;
- separar lógica da interface;
- evitar arquivos gigantes;
- serviços concentram comunicação externa;
- componentes devem ser reutilizáveis;
- hooks devem resolver apenas um problema;
- Context API deve ser usada para estado global quando fizer sentido.

## Padrão de componentes

O padrão documentado para componentes é:

```txt
components/
  NomeDoComponente/
    NomeDoComponente.jsx
    NomeDoComponente.module.css
    index.js
```

Testes são citados na documentação de planejamento, mas a estrutura atual ainda não contém testes.

## Commits

Ao terminar uma etapa, sempre sugerir uma mensagem de commit.
