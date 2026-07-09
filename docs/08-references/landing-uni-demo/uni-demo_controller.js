(function (UniDemo) {
    "use strict";

    class DemoController {

        constructor(runCycle) {

    this.runCycle = runCycle;

    this.running = false;

}

        async start() {

            if (this.running) return;

            this.running = true;

            while (true) {
                try {
                    await this.runCycle();
                } catch (err) {
                    console.error("[UniDemo]", err);
                    await UniDemo.sleep(1500);
                }
            }
        }

    }

    UniDemo.DemoController = DemoController;

})(window.UniDemo = window.UniDemo || {});