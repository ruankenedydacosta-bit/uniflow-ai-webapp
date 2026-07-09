(function (UniDemo) {
    "use strict";

    class VoiceTimeline {

    constructor(view, state) {
    this.view = view;
    this.state = state;
}


async play(step) {

    const amount =
    Math.round(
        (Math.random() *
        (step.amountRange[1] - step.amountRange[0]) +
        step.amountRange[0]) * 100
    ) / 100;

const heard =
    step.user(UniDemo.formatCurrency(amount));

const result =
    this.state.applyStep(step, amount);

    await this.view.tapMic();

    await this.view.listen();

    await this.view.transcribeStatus();

    await this.view.revealTranscript(heard);

    await this.view.reasoningChain(
    UniDemo.getReasoningChain()
);

    await this.view.respond(
    step.ai(result.after.goalProgress),
    pickFollowup(step)
);
 
    return result;
}

}

function pickFollowup(step) {

    if (!step.followups || !step.followups.length) {
        return "";
    }

    return step.followups[
        Math.floor(
            Math.random() * step.followups.length
        )
    ];

}

    UniDemo.VoiceTimeline = VoiceTimeline;

})(window.UniDemo = window.UniDemo || {});