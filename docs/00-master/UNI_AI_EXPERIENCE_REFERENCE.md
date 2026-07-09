# Uni AI Experience Reference

Este documento define como a animacao da Landing Page em `docs/08-references/landing-uni-demo` deve ser adaptada para a experiencia da Uni AI dentro do WebApp.

A referencia deve orientar agentes futuros, Codex e decisoes de produto. Ela nao descreve uma implementacao pronta; descreve o comportamento, o ritmo e a arquitetura desejada para transformar a demo visual em uma experiencia real controlada pelo usuario.

## 1. Objetivo da referencia

Usar a Landing Page como referencia de sensacao, narrativa e ritmo para a Uni AI no WebApp.

O WebApp deve parecer uma continuacao natural da Landing Page: escuro, premium, tecnologico, financeiro e calmo. A diferenca central e que, no WebApp, a experiencia deixa de ser uma demonstracao automatica e passa a ser uma interacao real, iniciada e controlada pelo usuario.

A Uni AI deve transmitir que:

- entende o contexto financeiro;
- escuta o usuario com baixo atrito;
- organiza informacoes dispersas;
- analisa antes de responder;
- recomenda proximos passos;
- nao decide pelo usuario.

## 2. Diferenca entre Landing Page e WebApp

A Landing Page e uma narrativa de produto. Ela mostra, de forma automatica, como a Uni pode ouvir, interpretar, responder e atualizar o dashboard. O objetivo e vender a ideia em poucos segundos.

O WebApp e uma experiencia operacional. Ele precisa permitir que o usuario controle a acao, veja estados claros, interrompa fluxos quando necessario e confie que nada acontece sem consentimento.

Principais diferencas:

- Na Landing, o loop e automatico; no WebApp, o usuario inicia a captura.
- Na Landing, o estado financeiro e simulado; no WebApp, o estado deve vir do contexto real ou mockado temporario.
- Na Landing, o microfone e demonstrativo; no WebApp, microfone exige permissao e fallback.
- Na Landing, a transcricao e encenada; no WebApp, deve refletir entrada real quando a API do navegador permitir.
- Na Landing, o dashboard reage como parte da animacao; no WebApp, a reacao deve representar uma mudanca de contexto, insight ou recomendacao.
- Na Landing, o ritmo pode ser teatral; no WebApp, o ritmo deve ser util, acessivel e controlavel.

## 3. Arquitetura atual da animacao da Landing Page

A demo da Landing Page esta organizada em arquivos independentes:

- `index.html`: define a estrutura visual da demo dentro do mockup de celular, com duas telas principais: dashboard e voz.
- `style.css`: define base visual da Landing Page, hero, telefone, cards financeiros, badges, fundos e estilos globais da landing.
- `uni-demo.css`: define o palco da demo, transicoes entre dashboard e voz, microfone, ondas, transcricao, raciocinio, resposta e toast.
- `uni-demo_app.js`: monta a demo, coleta referencias DOM, cria estado, views e timeline, e executa o ciclo infinito.
- `uni-demo_controller.js`: executa continuamente o ciclo da demonstracao.
- `uni-demo_data.js`: concentra estado financeiro simulado, formatadores, narrativa, frases da Uni e cadeias de raciocinio.
- `uni-demo_chat.js`: apesar do nome, controla a interface de voz: microfone, ondas, status, transcricao, raciocinio e resposta.
- `uni-demo_dashboard.js`: renderiza e anima o dashboard, incluindo saldo, alocacao, linhas, meta e toast.
- `uni-demo_motion.js`: centraliza tempos da animacao.
- `uni-demo_timeline.js`: orquestra a sequencia: tocar microfone, ouvir, transcrever, revelar texto, analisar, responder e devolver resultado.

O ciclo oficial da landing e:

1. Dashboard parado.
2. Transicao para tela de voz.
3. Microfone ganha destaque.
4. Estado de escuta.
5. Estado de transcricao.
6. Transcricao revelada palavra por palavra.
7. Uni mostra etapas de analise.
8. Uni responde em frases.
9. Dashboard volta e reage.

Uma regra importante da landing deve ser preservada: o dashboard nunca reage antes da resposta da Uni terminar.

## 4. Fluxo oficial da experiencia

### Dashboard parado

O dashboard deve comecar em estado estavel. Ele representa a realidade atual do usuario: saldo, fluxo de caixa, metas, alertas e atividades relevantes.

No WebApp, esse estado nao deve parecer uma animacao decorativa. Ele deve parecer um painel vivo, mas confiavel. A animacao deve ser discreta e ocorrer apenas quando houver uma acao, resposta ou atualizacao contextual.

### Microfone

O microfone e a acao de menor atrito da Uni Quick Capture. Ele deve ser uma escolha explicita do usuario.

Regras:

- nunca iniciar automaticamente;
- pedir permissao apenas depois de clique ou toque;
- indicar que a captura e local quando ainda nao houver backend;
- oferecer fallback por texto;
- permitir encerrar a escuta.

### Escuta

Durante a escuta, a interface deve mostrar que a Uni esta presente sem pressionar o usuario.

Estado esperado:

- botao muda para "Ouvindo..." ou "Parar escuta";
- ondas ou barras ficam ativas;
- texto acolhedor informa que o usuario pode falar naturalmente;
- nenhuma classificacao agressiva de volume;
- nenhuma mensagem que soe como bronca.

### Transcricao

A transcricao deve aparecer enquanto o usuario fala, quando o navegador oferecer `interimResults`.

Se houver transcricao parcial:

- mostrar "Ouvindo: [texto parcial]";
- atualizar suavemente;
- enviar apenas a transcricao final para o chat.

Se nao houver texto:

- mostrar uma mensagem neutra, como "Estou ouvindo... fale naturalmente."

Se a captura vier vazia:

- mostrar algo acolhedor, como "Se quiser, repita com calma."

### Analise/raciocinio

A analise substitui um loading generico. Ela deve mostrar que a Uni esta organizando o contexto antes de responder.

Etapas recomendadas:

- "Organizando movimentacoes..."
- "Consultando seu contexto financeiro..."
- "Calculando impacto no fluxo de caixa..."
- "Preparando recomendacao..."

Essas etapas nao devem revelar cadeia interna de pensamento do modelo. Elas devem ser rotulos de produto, explicando de forma simples quais tipos de verificacao estao acontecendo.

### Resposta da Uni

A resposta deve ser consultiva, calma e acionavel.

Ela deve:

- reconhecer o contexto;
- explicar o que mudou;
- apontar risco ou oportunidade sem alarmismo;
- sugerir uma proxima acao;
- deixar claro que a decisao final e do usuario.

Ela nao deve:

- prometer retorno;
- decidir pelo usuario;
- usar urgencia artificial;
- culpar;
- dramatizar.

### Reacao do dashboard

Apos a resposta, o dashboard pode reagir para mostrar impacto, registro ou novo insight.

Exemplos:

- saldo projetado atualiza;
- meta ganha progresso;
- item de atividade recente aparece;
- badge muda de "Em analise" para "Saudavel" ou "Atencao";
- card de insight destaca uma recomendacao;
- toast confirma uma movimentacao registrada.

Regra: a reacao deve acontecer depois da resposta da Uni, nunca antes.

## 5. Estados principais da experiencia

Estados recomendados para o WebApp:

- `idle`: dashboard e chat estao parados.
- `ready`: Uni pronta para receber texto ou voz.
- `requestingPermission`: permissao de microfone foi solicitada.
- `listening`: microfone ativo e capturando voz.
- `transcribing`: fala sendo convertida em texto.
- `thinking`: Uni organizando contexto e preparando resposta.
- `responding`: resposta sendo exibida.
- `speaking`: resposta sendo lida por `speechSynthesis`.
- `dashboardReacting`: dashboard aplicando reacao visual.
- `error`: permissao negada, navegador sem suporte ou captura vazia.

Esses estados devem ser simples, previsiveis e visiveis apenas quando ajudam o usuario.

## 6. Papel do microfone

O microfone nao e apenas um icone. Ele representa a promessa de capturar informacoes financeiras com minimo atrito.

No WebApp, ele deve servir para:

- registrar receitas;
- registrar despesas;
- perguntar sobre fluxo de caixa;
- pedir priorizacao;
- organizar metas;
- capturar lembretes financeiros;
- iniciar simulacoes futuras.

O microfone deve estar sempre associado a controle do usuario. A Uni deve escutar somente apos acao explicita.

## 7. Papel das ondas/animacao de audio

As ondas mostram presenca e confirmam que a escuta esta ativa.

Elas devem:

- reagir ao volume quando `getUserMedia`, `AudioContext` e `AnalyserNode` estiverem disponiveis;
- funcionar com animacao CSS padrao quando medicao real nao estiver disponivel;
- ser suaves e pouco invasivas;
- reforcar calma, nao urgencia.

Elas nao devem:

- parecer alerta;
- piscar agressivamente;
- mostrar classificacoes como baixo, medio ou alto;
- expor informacoes tecnicas do audio.

## 8. Papel da transcricao palavra por palavra

Na Landing Page, a transcricao palavra por palavra cria encanto e demonstra entendimento.

No WebApp, esse efeito deve ser adaptado com cuidado:

- durante a fala, mostrar transcricao parcial quando seguro;
- apos a fala, consolidar a transcricao final;
- usar revelacao suave em mensagens finais, se nao atrapalhar leitura;
- respeitar `prefers-reduced-motion`;
- nunca transformar a transcricao em obstaculo para enviar a mensagem.

O objetivo nao e impressionar com animacao. O objetivo e dar confianca de que a Uni ouviu corretamente.

## 9. Papel da analise em etapas

A analise em etapas deve substituir spinners genericos.

Ela comunica que a Uni esta trabalhando com contexto financeiro, nao respondendo aleatoriamente.

Boas etapas:

- organizar movimentacoes;
- consultar historico;
- comparar comportamento;
- calcular impacto;
- preparar recomendacao.

Cuidados:

- nao simular acesso a dados que o produto ainda nao possui;
- nao prometer precisao que ainda nao existe;
- nao expor raciocinio interno do modelo;
- manter frases curtas.

## 10. Papel da resposta consultiva da Uni

A resposta da Uni e o centro da experiencia.

Estrutura recomendada:

1. Contexto: "Entendi. Isso afeta seu fluxo de caixa desta semana."
2. Leitura: "O impacto parece administravel dentro do saldo projetado."
3. Orientacao: "Eu priorizaria revisar despesas variaveis antes de assumir novo compromisso."
4. Proxima acao: "Posso montar um plano simples para os proximos 7 dias."

A resposta deve soar humana, profissional e calma. A Uni orienta, mas nao decide pelo usuario.

## 11. Papel do dashboard reagindo apos a resposta

O dashboard reagindo e a ponte entre conversa e produto financeiro.

Ele deve mostrar que a conversa gerou clareza ou acao concreta.

Reacoes possiveis:

- atualizar um resumo financeiro;
- marcar uma meta como impactada;
- adicionar atividade recente;
- destacar um card de proximo passo;
- exibir confirmacao discreta;
- mostrar uma mudanca em fluxo de caixa projetado.

No WebApp, essa reacao deve ser baseada em estado React, nao em manipulacao direta do DOM como na Landing Page.

## 12. Ritmo e tempos da experiencia

A Landing Page usa tempos definidos em `uni-demo_motion.js`, como:

- dashboard parado por alguns segundos;
- transicao entre telas;
- escuta curta;
- transcricao;
- raciocinio por etapas;
- resposta em frases;
- atraso antes de reacao do dashboard.

No WebApp, esses tempos devem virar diretrizes, nao travas.

Recomendacao:

- microinteracoes entre 150ms e 400ms;
- transicoes de cards entre 300ms e 700ms;
- etapas de analise com ritmo entre 700ms e 1200ms quando mockadas;
- resposta exibida sem lentidao artificial em uso real;
- dashboard reagindo somente apos resposta ou confirmacao.

Sempre respeitar `prefers-reduced-motion`.

## 13. O que deve ser preservado no WebApp

Preservar:

- sensacao premium, escura e financeira;
- microfone como acao central da captura rapida;
- ondas de escuta;
- transcricao clara;
- analise em etapas;
- resposta consultiva da Uni;
- dashboard reagindo apos a resposta;
- linguagem humana, calma e objetiva;
- foco em clareza e proximo passo;
- regra de que dados viram decisao;
- ausencia de culpa e alarmismo.

## 14. O que nao deve ser copiado cegamente

Nao copiar sem adaptacao:

- loop infinito automatico;
- mockup de celular dentro do WebApp;
- badges flutuantes de marketing;
- orbs e efeitos decorativos da Landing;
- manipulacao direta do DOM por `data-*`;
- scripts globais em `window.UniDemo`;
- tempos teatrais que atrasem o usuario;
- promessas de automacao que ainda nao existem;
- dashboard reagindo sem acao real ou sem explicacao;
- texto que pareca decisoes tomadas automaticamente pela Uni.

## 15. Componentes React propostos

Componentes sugeridos para evolucao da Uni AI:

- `UniAIPage`: orquestra estado geral da experiencia.
- `UniAIHero`: apresenta a Uni, status e chamadas principais.
- `UniChatPanel`: concentra conversa por texto e voz.
- `UniMessageBubble`: renderiza mensagens do usuario e da Uni.
- `UniVoiceCapture`: mostra microfone, ondas, status e transcricao parcial.
- `UniVoiceMeter`: renderiza barras/ondas reativas ao volume.
- `UniTranscript`: exibe transcricao parcial e final.
- `UniThinkingSteps`: mostra analise em etapas.
- `UniResponseCard`: destaca resposta consultiva da Uni quando necessario.
- `UniContextPanel`: mostra contexto usado pela Uni.
- `UniDashboardReaction`: encapsula a reacao visual do dashboard.
- `UniQuickSuggestions`: oferece perguntas de baixo atrito.

Esses componentes devem usar os componentes base existentes quando fizer sentido: `Card`, `Button`, `Badge`, `Avatar`, `Input`, `Tooltip`, `Loader` e `Modal`.

## 16. Hooks propostos

Hooks sugeridos:

- `useUniChat`: controla mensagens, envio manual, sugestoes e resposta mockada ou real.
- `useVoiceCapture`: controla permissao, Speech Recognition, transcricao parcial/final e limpeza.
- `useAudioMeter`: controla `getUserMedia`, `AudioContext`, `AnalyserNode`, volume normalizado e encerramento de tracks.
- `useSpeechSynthesis`: fala a ultima resposta da Uni com `speechSynthesis`.
- `useUniExperienceState`: centraliza estados como `idle`, `listening`, `thinking` e `dashboardReacting`.
- `useThinkingSteps`: simula ou controla etapas de analise.
- `useDashboardReaction`: aplica reacoes visuais a partir de eventos da conversa.
- `useReducedMotion`: respeita preferencias de movimento do sistema.

Cada hook deve resolver apenas um problema e limpar recursos no desmontar.

## 17. Roadmap de implementacao

Fase 1: Documentacao e alinhamento

- Consolidar este documento como referencia oficial.
- Garantir que agentes futuros entendam a diferenca entre demo e WebApp.

Fase 2: Estrutura React local

- Separar componentes internos da Uni AI.
- Manter chat local e respostas mockadas.
- Evitar mudancas grandes de visual.

Fase 3: Voz local segura

- Isolar captura de voz em hook.
- Garantir permissao apenas apos clique.
- Garantir limpeza de tracks, `requestAnimationFrame` e `AudioContext`.
- Manter fallback para navegadores sem suporte.

Fase 4: Transcricao e analise

- Melhorar transcricao parcial.
- Criar componente de etapas de analise.
- Preservar tom humano e sem culpa.

Fase 5: Reacao do dashboard

- Criar eventos locais para atualizar cards, badges ou atividades recentes.
- Garantir que a reacao aconteca apos a resposta da Uni.

Fase 6: Integracao real futura

- Conectar Supabase quando autorizado.
- Conectar API de IA quando autorizado.
- Substituir respostas mockadas por respostas baseadas em contexto real.
- Manter controle, privacidade e transparencia.

## 18. Regras de UX e tom da Uni

A Uni deve ser:

- humana;
- calma;
- didatica;
- sem culpa;
- sem alarmismo;
- orientativa, nao decisoria.

Regras praticas:

- A Uni deve explicar o que percebeu.
- A Uni deve recomendar caminhos, nao impor decisoes.
- A Uni deve pedir confirmacao antes de executar acoes sensiveis.
- A Uni deve tratar risco com serenidade.
- A Uni deve transformar dados em clareza.
- A Uni deve reduzir esforco mental.
- A Uni nunca deve constranger o usuario.
- A Uni nunca deve prometer resultado financeiro.
- A Uni nunca deve criar urgencia artificial.

Frase guia:

"A Uni pode recomendar o melhor proximo passo, mas a decisao final continua sendo do usuario."
