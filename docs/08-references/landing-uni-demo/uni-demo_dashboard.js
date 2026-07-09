/* ==========================================================================
   UNI DEMO — dashboard.js
   Anima o dashboard existente (patrimônio, donut de alocação, listas, meta)
   e exibe o toast de confirmação — sempre DEPOIS da resposta da Uni, nunca antes.
   ========================================================================== */
(function (UniDemo) {
  "use strict";

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  const ICONS = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 16l6-8 6 8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 8l6 8 6-8"/></svg>',
  };

  class DashboardView {
    /**
     * @param {Object} refs
     *   refs.balanceValue, refs.balanceChange,
     *   refs.ringSegFixa, refs.ringSegVariavel, refs.ringSegFii,
     *   refs.rowFiiValue, refs.rowFiiPct, refs.rowTesourariaValue, refs.rowTesourariaPct,
     *   refs.goalFill, refs.goalPct,
     *   refs.toast
     */
    constructor(refs) {
      this.refs = refs;
    }

    /** Renderiza o estado inicial sem animação (evita "flash" no load) */
    renderInitial(state) {
      this.refs.balanceValue.textContent = UniDemo.formatCurrency(state.balance);
      this._setChange(state.changePercent);
      this._setRing(state.allocation);
      this._setRow(this.refs.rowFiiValue, this.refs.rowFiiPct, state.rows.fii, state.allocation.fii);
      this._setRow(this.refs.rowTesourariaValue, this.refs.rowTesourariaPct, state.rows.tesouraria, state.allocation.fixa * 0.42);
      this._setGoal(state.goalProgress);
    }

    /** Anima a transição entre "before" e "after" de uma transação — chamado só após a fala da Uni */
    async animateTransaction({ before, after, signedAmount }, step) {
      this._animateCounter(this.refs.balanceValue, before.balance, after.balance);
      this._setChange(after.changePercent);
      this._setRing(after.allocation);

      const fiiPct = after.allocation.fii;
      const tesPct = after.allocation.fixa * 0.42;
      this._swapRow(this.refs.rowFiiValue, this.refs.rowFiiPct, after.rows.fii, fiiPct);
      this._swapRow(this.refs.rowTesourariaValue, this.refs.rowTesourariaPct, after.rows.tesouraria, tesPct);
      this._setGoal(after.goalProgress);

      this._showToast(step, signedAmount);
    }

    _setChange(changePercent) {
      const el = this.refs.balanceChange;
      const isDown = changePercent < 0;
      el.textContent = `${isDown ? "" : "+"}${UniDemo.formatPercent(Math.abs(changePercent))} hoje`;
      el.classList.toggle("is-down", isDown);
    }

    _setRing(allocation) {
      const { fixa, variavel, fii } = allocation;
      this.refs.ringSegFixa.style.strokeDasharray = `${fixa} 100`;
      this.refs.ringSegFixa.style.strokeDashoffset = "0";

      this.refs.ringSegVariavel.style.strokeDasharray = `${variavel} 100`;
      this.refs.ringSegVariavel.style.strokeDashoffset = `${-fixa}`;

      this.refs.ringSegFii.style.strokeDasharray = `${fii} 100`;
      this.refs.ringSegFii.style.strokeDashoffset = `${-(fixa + variavel)}`;
    }

    _setRow(valueEl, pctEl, value, pct) {
      valueEl.textContent = UniDemo.formatCurrency(value);
      pctEl.textContent = `${pct.toFixed(1).replace(".", ",")}%`;
    }

    _swapRow(valueEl, pctEl, value, pct) {
      [valueEl, pctEl].forEach((el) => {
        el.classList.remove("is-updating");
        void el.offsetWidth; // reinicia a animação
        el.classList.add("is-updating");
      });
      setTimeout(() => this._setRow(valueEl, pctEl, value, pct), 175);
    }

    _setGoal(progress) {
      this.refs.goalFill.style.width = `${progress}%`;
      this.refs.goalPct.textContent = `${Math.round(progress)}%`;
    }

    _animateCounter(el, from, to) {
      const duration = UniDemo.REDUCED_MOTION ? 1 : 900;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = easeOutCubic(progress);
        const current = from + (to - from) * eased;
        el.textContent = UniDemo.formatCurrency(current);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    _showToast(step, signedAmount) {
      const toast = this.refs.toast;
      const isIncome = step.type === "receita";
      const amountLabel = `${isIncome ? "+" : "-"}${UniDemo.formatCurrency(Math.abs(signedAmount))}`;

      toast.className = `uni-toast uni-toast--${isIncome ? "income" : "expense"}`;
      toast.innerHTML = `
        <span class="uni-toast__icon">${isIncome ? ICONS.up : ICONS.down}</span>
        <span>${step.category} · ${amountLabel}</span>
      `;

      requestAnimationFrame(() => toast.classList.add("is-visible"));
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
    }
  }

  UniDemo.DashboardView = DashboardView;
})(window.UniDemo = window.UniDemo || {});
