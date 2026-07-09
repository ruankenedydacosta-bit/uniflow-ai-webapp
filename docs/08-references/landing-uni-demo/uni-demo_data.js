/* ==========================================================================
   UNI DEMO — data.js
   Estado financeiro simulado + narrativa sequencial da Uni.
   A sequência conta uma pequena história de negócio:
   Receita → Fornecedor → Investimento → Meta → Planejamento → (repete)
   Nenhuma dependência externa. Namespace global: window.UniDemo
   ========================================================================== */
(function (UniDemo) {
  "use strict";

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const percentFormatter = (value) => `${value.toFixed(1).replace(".", ",")}%`;

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /* ------------------------------------------------------------------
     Estado financeiro — evolui de forma cumulativa a cada transação,
     nunca "reseta", por isso o loop nunca soa repetitivo.
  ------------------------------------------------------------------ */
  class FinanceState {
    constructor() {
      this.balance = 231523.82;
      this.changePercent = 12.45;
      this.allocation = { fixa: 42, variavel: 35, fii: 23 }; // soma 100
      this.rows = { fii: 78780.1, tesouraria: 23048.2 };
      this.goalProgress = 61; // meta trimestral, em %
    }

    snapshot() {
      return JSON.parse(JSON.stringify({
        balance: this.balance,
        changePercent: this.changePercent,
        allocation: this.allocation,
        rows: this.rows,
        goalProgress: this.goalProgress,
      }));
    }

    /**
     * Aplica a transação do passo da narrativa e retorna { before, after, amount }.
     * @param {Object} step
     * @param {number} [fixedAmount] - quando informado, usa exatamente este valor
     *   (garante que o valor falado pelo usuário seja o mesmo aplicado ao estado).
     */
    applyStep(step, fixedAmount) {
      const before = this.snapshot();
      const amount = fixedAmount != null
        ? fixedAmount
        : Math.round(randomBetween(step.amountRange[0], step.amountRange[1]) * 100) / 100;
      const signedAmount = step.type === "receita" ? amount : -amount;

      this.balance = Math.max(this.balance + signedAmount, 18000);

      const drift = step.type === "receita" ? randomBetween(0.15, 0.9) : randomBetween(-0.55, -0.05);
      this.changePercent = clamp(this.changePercent + drift, -9, 24);

      const shift = randomBetween(1, 3.2);
      if (step.type === "receita") {
        this.allocation.variavel = clamp(this.allocation.variavel + shift, 18, 48);
        this.allocation.fixa = clamp(this.allocation.fixa - shift * 0.6, 28, 52);
      } else {
        this.allocation.fixa = clamp(this.allocation.fixa + shift * 0.5, 28, 52);
      }
      this.allocation.fii = clamp(100 - this.allocation.fixa - this.allocation.variavel, 12, 32);

      if (step.rowTarget === "fii") {
        this.rows.fii = Math.max(this.rows.fii + Math.abs(signedAmount) * 0.6, 4000);
      } else {
        this.rows.tesouraria = Math.max(this.rows.tesouraria + signedAmount * 0.5, 2000);
      }

      const goalDelta = step.type === "receita" ? randomBetween(1.2, 4.5) : randomBetween(-0.8, 0.4);
      this.goalProgress = clamp(this.goalProgress + goalDelta, 8, 96);

      return { before, after: this.snapshot(), amount, signedAmount };
    }
  }

  /* ------------------------------------------------------------------
     Narrativa — sequência coerente, não aleatória. Cada passo tem
     variações de frase para nunca soar roteirizado ao repetir o ciclo.
  ------------------------------------------------------------------ */
  const STORY = [
    {
      id: "receita",
      category: "Receita",
      type: "receita",
      rowTarget: "tesouraria",
      amountRange: [8000, 22000],
      user: (v) => pickRandom([
        `Uni, recebi de um cliente ${v}.`,
        `Uni, acabou de cair ${v} de um cliente novo.`,
        `Uni, fechei uma venda importante de ${v}.`,
      ]),
      ai: () => pickRandom([
        [
          "Excelente. Essa entrada fortalece seu fluxo de caixa deste mês.",
          "Mantendo esse ritmo, você fica acima da meta trimestral.",
          "Recomendo reservar parte desse valor para capital de giro ou investimento.",
        ],
        [
          "Receita confirmada, e um dos melhores lançamentos do trimestre.",
          "Seu caixa operacional segue sólido para os próximos meses.",
          "Vale aproveitar esse fôlego para antecipar um pagamento estratégico.",
        ],
      ]),
      followups: [
        "Quer que eu compare esse resultado com o mês passado?",
        "Posso projetar como isso impacta o seu trimestre.",
      ],
    },
    {
      id: "fornecedor",
      category: "Fornecedor",
      type: "despesa",
      rowTarget: "tesouraria",
      amountRange: [2200, 6800],
      user: (v) => pickRandom([
        `Uni, paguei um fornecedor importante hoje: ${v}.`,
        `Uni, saíram ${v} para um fornecedor agora.`,
      ]),
      ai: () => pickRandom([
        [
          "Despesa registrada. Mesmo após esse pagamento, sua margem continua saudável.",
          "Recomendo revisar as condições desse contrato no próximo ciclo.",
        ],
        [
          "Pagamento confirmado. Seu fluxo de caixa absorve bem esse valor este mês.",
          "Vale negociar prazo maior com esse fornecedor para aliviar o caixa futuro.",
        ],
      ]),
      followups: [
        "Deseja que eu monitore esse fornecedor de perto?",
        "Posso analisar seus gastos com fornecedores este mês.",
      ],
    },
    {
      id: "investimento",
      category: "Investimento",
      type: "despesa",
      rowTarget: "fii",
      amountRange: [3500, 9200],
      user: (v) => pickRandom([
        `Uni, quero transferir ${v} para investimentos.`,
        `Uni, separa ${v} para o nosso portfólio.`,
      ]),
      ai: () => pickRandom([
        [
          "Perfeito. Você já possui recursos suficientes para reforçar sua reserva de investimento.",
          "Alocando esse valor no seu portfólio de Fundos Imobiliários.",
          "Recomendo revisar essa posição daqui a 90 dias.",
        ],
        [
          "Feito. Esse aporte melhora o equilíbrio entre renda fixa e variável da sua carteira.",
          "Sugiro manter esse ritmo de aportes mensais para acelerar seus objetivos.",
        ],
      ]),
      followups: [
        "Posso montar um plano para esse objetivo.",
        "Quer que eu acompanhe o rendimento dessa alocação?",
      ],
    },
    {
      id: "meta",
      category: "Meta",
      type: "receita",
      rowTarget: "tesouraria",
      amountRange: [900, 2600],
      user: () => pickRandom([
        "Uni, como está minha meta deste trimestre?",
        "Uni, estou perto de bater a meta do trimestre?",
      ]),
      ai: (progress) => pickRandom([
        [
          `Você está a ${(100 - progress).toFixed(0)}% de distância da meta deste trimestre.`,
          "Reservando o excedente de hoje para acelerar esse objetivo.",
          "Recomendo manter o ritmo atual de receita pelos próximos 30 dias.",
        ],
        [
          `Sua meta trimestral já está em ${progress.toFixed(0)}%.`,
          "No ritmo atual, você deve alcançá-la antes do previsto.",
          "Vale considerar antecipar o próximo investimento planejado.",
        ],
      ]),
      followups: [
        "Quer que eu acompanhe essa meta de perto?",
        "Posso te avisar assim que ela for atingida.",
      ],
    },
    {
      id: "planejamento",
      category: "Planejamento",
      type: "despesa",
      rowTarget: "tesouraria",
      amountRange: [700, 2100],
      user: (v) => pickRandom([
        `Uni, separa ${v} para os impostos do mês.`,
        `Uni, reserva ${v} para as obrigações fiscais.`,
      ]),
      ai: () => pickRandom([
        [
          "Feito. Reservei o valor para seus impostos.",
          "Seu planejamento financeiro deste mês está completo.",
          "Recomendo já separar uma margem extra para o próximo trimestre.",
        ],
        [
          "Valor reservado com sucesso.",
          "Você fecha o mês com o caixa organizado e sem surpresas.",
          "Sugiro revisar seus custos fixos antes do próximo fechamento.",
        ],
      ]),
      followups: [
        "Quer que eu prepare o resumo para o próximo mês?",
        "Deseja registrar outra movimentação?",
      ],
    },
  ];

  /* ------------------------------------------------------------------
     Cadeia de raciocínio — substitui o "carregando" genérico. Cada etapa
     nomeia uma ação real de análise. Duas variações para os ciclos não
     soarem idênticos, mantendo sempre a mesma lógica: organizar → consultar
     histórico → comparar comportamento → calcular impacto → recomendar.
  ------------------------------------------------------------------ */
  const REASONING_CHAINS = [
    [
      "Organizando movimentações…",
      "Consultando histórico financeiro…",
      "Calculando impacto no fluxo de caixa…",
      "Preparando recomendação…",
    ],
    [
      "Organizando movimentações…",
      "Comparando comportamento financeiro…",
      "Calculando impacto na meta trimestral…",
      "Gerando recomendação…",
    ],
  ];

  function getReasoningChain() {
    return pickRandom(REASONING_CHAINS);
  }


  function getStep(index) {
    return STORY[index % STORY.length];
  }

  UniDemo.formatCurrency = (value) => currencyFormatter.format(value);
  UniDemo.formatPercent = percentFormatter;
  UniDemo.FinanceState = FinanceState;
  UniDemo.STORY = STORY;
  UniDemo.getStep = getStep;
  UniDemo.getReasoningChain = getReasoningChain;
})(window.UniDemo = window.UniDemo || {});
