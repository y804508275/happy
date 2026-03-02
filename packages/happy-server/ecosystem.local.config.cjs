const path = require('path');

const cwd = path.resolve(__dirname);
const tsx = path.resolve(__dirname, "../../node_modules/.bin/tsx");

module.exports = {
    apps: [
        {
            name: "happy-local-1",
            script: tsx,
            args: "--env-file=.env --env-file=.env.dev ./sources/main.ts",
            cwd,
            exec_mode: "fork",
            env: {
                PORT: "3005",
                METRICS_ENABLED: "false",
            },
            kill_timeout: 5000,
        },
        {
            name: "happy-local-2",
            script: tsx,
            args: "--env-file=.env --env-file=.env.dev ./sources/main.ts",
            cwd,
            exec_mode: "fork",
            env: {
                PORT: "3006",
                METRICS_ENABLED: "false",
            },
            kill_timeout: 5000,
        }
    ]
};
