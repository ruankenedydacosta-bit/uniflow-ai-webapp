/* ==========================================================================
   UNI DEMO — chat.js
   (Nome de arquivo mantido pela arquitetura aprovada. Conteúdo: motor da
   interface de VOZ — nunca chat/mensageria. Controla mic, ondas sonoras,
   estados de escuta/transcrição/análise e a resposta falada da Uni.)
   ========================================================================== */
(function (UniDemo) {
  "use strict";

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const MOTION = UniDemo.Motion;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, REDUCED_MOTION ? Math.min(ms, 60) : ms));
  }

  class VoiceView {
    /**
     * @param {Object} refs
     *   refs.stage, refs.mic, refs.wave, refs.status,
     *   refs.transcript, refs.transcriptText, refs.transcriptTag,
     *   refs.thinking,
     *   refs.response, refs.responseText, refs.followup
     */
    constructor(refs) {
      this.refs = refs;
      // Reaproveita o <span class="uni-thinking__label"> que já existe no
      // markup (dentro de [data-thinking]) — nenhuma alteração de HTML.
      this.thinkingLabel = refs.thinking.querySelector(".uni-thinking__label");
      this._defaultThinkingLabel = this.thinkingLabel ? this.thinkingLabel.textContent : "";
    }

    /** Limpa tudo e volta ao estado neutro antes de um novo ciclo */
    reset() {
      const r = this.refs;
      r.stage.classList.remove("is-collapsed");
      r.mic.classList.remove("is-listening", "is-muted", "is-tapped");
      r.wave.classList.remove("is-active", "is-scanning");
      r.status.textContent = "";
      r.transcript.classList.remove("is-visible");
      r.transcriptText.innerHTML = "";
      r.transcriptTag.textContent = "";
      r.thinking.classList.remove("is-visible");
      if (this.thinkingLabel) {
        this.thinkingLabel.style.opacity = "1";
        this.thinkingLabel.textContent = this._defaultThinkingLabel;
      }
      r.response.classList.remove("is-visible");
      r.responseText.innerHTML = "";
      r.followup.classList.remove("is-visible");
      r.followup.textContent = "";
    }

    /** Fase 0 — o usuário toca no microfone: um destaque breve antes de escutar */
    async tapMic() {
      const r = this.refs;
      r.mic.classList.add("is-tapped");
      await sleep(MOTION.tapMic);
      r.mic.classList.remove("is-tapped");
    }

    /** Fase 1 — mic pulsa, "Ouvindo..." */
    async listen() {
      const r = this.refs;
      r.mic.classList.add("is-listening");
      r.wave.classList.add("is-active");
      r.status.textContent = "Ouvindo…";
      await sleep(MOTION.listening);
    }

    /** Fase 2 — mic silencia, onda vira "scanner", "Transcrevendo..." */
    async transcribeStatus() {
      const r = this.refs;
      r.mic.classList.remove("is-listening");
      r.mic.classList.add("is-muted");
      r.wave.classList.add("is-scanning");
      r.status.textContent = "Transcrevendo…";
      await sleep(MOTION.transcribing);
    }

    /** Fase 3 — revela a frase reconhecida, palavra por palavra */
    async revealTranscript(text) {
      const r = this.refs;
      r.stage.classList.add("is-collapsed");
      r.wave.classList.remove("is-active", "is-scanning");
      await sleep(MOTION.collapse);

      r.transcript.classList.add("is-visible");
      r.transcriptTag.textContent = "reconhecido por voz";

      if (REDUCED_MOTION) {
        r.transcriptText.textContent = text;
        await sleep(30);
        return;
      }

      const words = text.split(" ");
      r.transcriptText.innerHTML = words
        .map((w, i) => `<span class="uni-word" style="animation-delay:${i * 70}ms">${w}</span>`)
        .join(" ");
      await sleep(
  words.length * MOTION.transcriptWord +
  MOTION.transcriptEnd
);
    }

    /**
     * Fase 4 — cadeia de raciocínio da Uni. Em vez de um "carregando" genérico,
     * cada etapa nomeia uma ação real de análise, uma de cada vez, no mesmo
     * indicador que já existe no HTML ([data-thinking] > .uni-thinking__label).
     */
    async reasoningChain(steps) {
      const r = this.refs;
      const label = this.thinkingLabel;
      r.thinking.classList.add("is-visible");

      for (let i = 0; i < steps.length; i++) {
        if (label) {
          if (i > 0) {
            label.style.opacity = "0";
            await sleep(REDUCED_MOTION ? 10 : 200);
          }
          label.textContent = steps[i];
          label.style.opacity = "1";
        }
        const isLast = i === steps.length - 1;
        await sleep(
  REDUCED_MOTION
    ? 15
    : isLast
      ? MOTION.reasoningLast
      : MOTION.reasoningStep
);
      }
    }

    /**
     * Fase 5 — resposta estratégica da Uni, revelada frase a frase,
     * seguida da pergunta de continuidade.
     */
    async respond(sentences, followupText) {
      const r = this.refs;
      r.thinking.classList.remove("is-visible");
      await sleep(MOTION.responseBefore);

      r.response.classList.add("is-visible");
      r.responseText.innerHTML = sentences.map(() => `<p></p>`).join("");
      const paragraphs = r.responseText.querySelectorAll("p");

      for (let i = 0; i < sentences.length; i++) {
        paragraphs[i].textContent = sentences[i];
        // força reflow antes de animar
        void paragraphs[i].offsetWidth;
        paragraphs[i].classList.add("is-visible");
        await sleep(
  REDUCED_MOTION
    ? 20
    : MOTION.responseParagraph
);
      }

      await sleep(MOTION.responseAfter);
      r.followup.textContent = followupText;
      r.followup.classList.add("is-visible");
      await sleep(
  REDUCED_MOTION
    ? 20
    : MOTION.followup
);
    }
  }

  UniDemo.VoiceView = VoiceView;
  UniDemo.sleep = sleep;
  UniDemo.REDUCED_MOTION = REDUCED_MOTION;
})(window.UniDemo = window.UniDemo || {});
