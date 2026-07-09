/* ==========================================================================
   UNI DEMO — app.js
   Máquina de estados que orquestra o loop infinito da demonstração.
   Sequência: Dashboard (idle) → Voz (ouvindo → transcrevendo → transcrição →
   analisando → resposta + convite de continuidade) → Dashboard reage → repete.
   O dashboard NUNCA reage antes da resposta da Uni ser concluída.
   ========================================================================== */
(function (UniDemo) {
  "use strict";

  const sleep = UniDemo.sleep;

  function qs(root, sel) {
    return root.querySelector(sel);
  }

  function mount(root) {
    if (!root) return;

    /* -------------------- referências do dashboard -------------------- */
    const dashboardScreen = qs(root, '[data-screen="dashboard"]');
    const voiceScreen = qs(root, '[data-screen="voice"]');

    const dashboardRefs = {
      balanceValue: qs(root, "[data-balance-value]"),
      balanceChange: qs(root, "[data-balance-change]"),
      ringSegFixa: qs(root, "[data-ring-fixa]"),
      ringSegVariavel: qs(root, "[data-ring-variavel]"),
      ringSegFii: qs(root, "[data-ring-fii]"),
      rowFiiValue: qs(root, "[data-row-fii-value]"),
      rowFiiPct: qs(root, "[data-row-fii-pct]"),
      rowTesourariaValue: qs(root, "[data-row-tesouraria-value]"),
      rowTesourariaPct: qs(root, "[data-row-tesouraria-pct]"),
      goalFill: qs(root, "[data-goal-fill]"),
      goalPct: qs(root, "[data-goal-pct]"),
      toast: qs(root, "[data-toast]"),
    };

    /* -------------------- referências da interface de voz -------------------- */
    const voiceRefs = {
      stage: qs(root, "[data-voice-stage]"),
      mic: qs(root, "[data-mic]"),
      wave: qs(root, "[data-wave]"),
      status: qs(root, "[data-voice-status]"),
      transcript: qs(root, "[data-transcript]"),
      transcriptText: qs(root, "[data-transcript-text]"),
      transcriptTag: qs(root, "[data-transcript-tag]"),
      thinking: qs(root, "[data-thinking]"),
      response: qs(root, "[data-response]"),
      responseText: qs(root, "[data-response-text]"),
      followup: qs(root, "[data-followup]"),
    };

    const state = new UniDemo.FinanceState();
    const dashboard = new UniDemo.DashboardView(dashboardRefs);
    const voice = new UniDemo.VoiceView(voiceRefs);

    const timeline =
    new UniDemo.VoiceTimeline(
        voice,
        state
    );

    dashboard.renderInitial(state.snapshot());

    /** Alterna qual tela ocupa o centro do viewport */
    async function switchScreen(target) {
      const showingVoice = target === "voice";
      dashboardScreen.dataset.pos = showingVoice ? "left" : "center";
      voiceScreen.dataset.pos = showingVoice ? "center" : "right";
      dashboardScreen.dataset.hidden = showingVoice ? "true" : "false";
      voiceScreen.dataset.hidden = showingVoice ? "false" : "true";
      dashboardScreen.setAttribute("aria-hidden", String(showingVoice));
      voiceScreen.setAttribute("aria-hidden", String(!showingVoice));
      await sleep(UniDemo.Motion.switchScreen);
    }

    let stepIndex = 0;
    let stopped = false;

    async function showVoice() {

    voice.reset();

    await switchScreen("voice");

}

async function showDashboard(result, step) {

    await switchScreen("dashboard");

    await dashboard.animateTransaction(
        result,
        step
    );

}

    async function runCycle() {

      const step = UniDemo.getStep(stepIndex++);

      // 1) Dashboard visível por alguns segundos antes de ouvir de novo
      await sleep(UniDemo.Motion.dashboardStay);

      // 2) Vai para a tela de voz: o usuário toca no microfone, que ganha destaque, e então escuta
      await showVoice();


const result =
    await timeline.play(step);

      await sleep(UniDemo.Motion.dashboardReactionDelay);

      // 5) Volta ao dashboard — SÓ AGORA ele reage
      await showDashboard(
    result,
    step
);

}


    // Pausa discretamente quando a aba não está visível (economiza recursos)
    document.addEventListener("visibilitychange", () => {

    stopped = document.hidden;

    if (!stopped) {

        controller.start();

    }

});

    const controller =
    new UniDemo.DemoController(runCycle);

controller.start();

} // fecha mount()

document.addEventListener("DOMContentLoaded", () => {
    mount(document.getElementById("uniDemo"));
});

})(window.UniDemo = window.UniDemo || {});