# Prompts Base para Agentes

Use estes prompts como ponto de partida para agentes futuros. Eles foram escritos a partir das regras e documentos existentes do projeto.

## Prompt 1: leitura inicial obrigatória

```txt
Leia AGENTS.md, docs/00-master, docs/01-arquitetura e a estrutura atual de src.

Antes de responder perguntas sobre código, siga as instruções do Graphify em AGENTS.md.

Não altere arquivos ainda.

Ao final, responda:
- o que a UniFlow AI é;
- quais são as regras absolutas do projeto;
- qual é o estado real de src;
- quais documentos devem guiar a próxima implementação.
```

## Prompt 2: preparar uma implementação pequena

```txt
Leia AGENTS.md, docs/00-master e os arquivos existentes relacionados ao pedido.

Siga as instruções do Graphify em AGENTS.md antes de analisar código.

Não altere Design System sem autorização.
Não crie tokens CSS.
Não instale bibliotecas.
Não recrie arquivos existentes.

Antes de implementar, explique:
- objetivo da alteração;
- arquivos que serão alterados;
- componentes, utils e estilos existentes que serão reutilizados;
- riscos ou dúvidas.
```

## Prompt 3: criar componente base

```txt
Crie um componente base seguindo o padrão atual do projeto.

Leia:
- AGENTS.md;
- docs/00-master/REGRAS_DO_PROJETO.md;
- src/styles;
- src/components/ui/Button.

Regras:
- reutilize tokens de src/styles;
- não use valores hardcoded quando existir token;
- não altere theme.css;
- não altere componentes existentes sem necessidade explícita;
- use CSS Module no padrão do Button;
- mantenha o componente reutilizável e pequeno.

Ao terminar, liste:
- arquivos criados ou alterados;
- como o componente reutiliza o Design System;
- sugestão de commit.
```

## Prompt 4: criar uma tela

```txt
Crie uma tela da UniFlow AI com base nos documentos existentes.

Leia:
- AGENTS.md;
- docs/00-master;
- docs/01-arquitetura/UNIFLOW AI ARQUITETURA FUNCIONAL DO PRODUTO-2.docx;
- docs/01-arquitetura/UX_UI DA UNIFLOW AI-2.docx;
- src/styles;
- componentes existentes em src/components.

Regras:
- cada tela deve responder uma pergunta principal;
- a pessoa deve entender a tela em menos de 5 segundos;
- não criar excesso de botões, cards ou menus;
- reutilizar componentes existentes;
- respeitar o Design System;
- não inventar dados falsos quando o service ainda não existir.

Ao terminar, liste:
- arquivos alterados;
- pergunta principal da tela;
- componentes reutilizados;
- sugestão de commit.
```

## Prompt 5: criar serviço

```txt
Crie ou ajuste um service seguindo a arquitetura do projeto.

Leia:
- AGENTS.md;
- docs/00-master/REGRAS_DO_PROJETO.md;
- docs/01-arquitetura/5.1 Stack Tecnológica Oficial.docx;
- src/services.

Regras:
- toda comunicação externa fica em src/services;
- não espalhar fetch ou lógica de banco em componentes;
- documentar suposições de schema quando o banco ainda não estiver implementado;
- não instalar dependências sem autorização;
- manter métodos pequenos e nomeados por intenção.

Ao terminar, liste:
- arquivos alterados;
- suposições adotadas;
- riscos;
- sugestão de commit.
```

## Prompt 6: criar módulo de produto

```txt
Planeje e implemente um módulo da UniFlow AI em passos pequenos.

Leia:
- AGENTS.md;
- docs/00-master;
- docs/01-arquitetura/UNIFLOW AI ARQUITETURA FUNCIONAL DO PRODUTO-2.docx;
- docs/01-arquitetura/Modelo Conceitual, se o módulo depender de entidades;
- src/features;
- src/services;
- src/components;
- src/styles.

Regras:
- não implementar tudo de uma vez;
- separar UI, hooks e services;
- cada hook resolve um problema;
- cada service concentra comunicação externa;
- cada tela reduz esforço mental;
- a Uni deve transformar dado em orientação;
- não alterar Design System sem autorização.

Ao terminar, liste:
- arquivos criados ou alterados;
- fluxo do usuário;
- decisões de arquitetura;
- pendências;
- sugestão de commit.
```

## Prompt 7: revisar código

```txt
Faça uma revisão de código com foco em riscos.

Leia:
- AGENTS.md;
- docs/00-master/REGRAS_DO_PROJETO.md;
- arquivos alterados;
- arquivos relacionados.

Priorize:
- bugs;
- regressões;
- violações do Design System;
- valores hardcoded;
- duplicação de lógica;
- falta de reutilização de utils, hooks ou componentes;
- riscos de UX que aumentem esforço mental do usuário.

Responda com:
- achados por severidade;
- arquivo e linha;
- perguntas em aberto;
- testes ou verificações recomendadas.
```

## Prompt 8: tom de voz da Uni

```txt
Reescreva textos da UniFlow AI no tom correto da Uni.

Leia:
- docs/00-master/README_MASTER.md;
- docs/01-arquitetura/UNI OS (Sistema Operacional Cognitivo da Uni)-2.docx;
- docs/01-arquitetura/Mapa Cognitivo do Usuário-2.docx.

Regras:
- linguagem simples;
- humana;
- respeitosa;
- didática;
- objetiva;
- acolhedora;
- nunca julgadora;
- nunca alarmista;
- nunca técnica sem necessidade;
- sempre oferecer caminho quando houver problema.

Evite:
- "você gastou demais";
- "você falhou";
- "você está errado";
- qualquer frase que gere culpa ou ansiedade.
```
