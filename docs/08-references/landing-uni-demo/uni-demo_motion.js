(function (UniDemo) {
    "use strict";

    UniDemo.Motion = {

        /* Dashboard */
        dashboardStay: 4000,
        switchScreen: 1000,
        dashboardReactionDelay: 4500,

        /* Microfone */
        tapMic: 700,
        listening: 2600,
        transcribing: 1000,

        /* Transcrição */
        collapse: 300,
        transcriptWord: 120,
        transcriptEnd: 600,

        /* IA pensando */
        reasoningStep: 900,
        reasoningLast: 1400,

        /* Resposta */
        responseBefore: 400,
        responseParagraph: 1200,
        responseAfter: 800,
        followup: 1800

    };

})(window.UniDemo = window.UniDemo || {});