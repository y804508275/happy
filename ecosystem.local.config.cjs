const path = require('path');
const fs = require('fs');
const HOME = require('os').homedir();

function loadEnvFile(filePath) {
    const env = {};
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
            }
        }
    } catch {}
    return env;
}

const serverDir = path.join(HOME, "happy/packages/happy-server");
const dotEnv = loadEnvFile(path.join(serverDir, '.env'));
const dotEnvDev = loadEnvFile(path.join(serverDir, '.env.dev'));

module.exports = {
    apps: [
        {
            name: "happy-server-local",
            script: "./sources/standalone.ts",
            args: "serve",
            cwd: serverDir,
            interpreter: path.join(HOME, "happy/node_modules/.bin/tsx"),
            exec_mode: "fork",
            env: {
                ...dotEnv,
                ...dotEnvDev,
                DATA_DIR: path.join(HOME, ".happy/local-server"),
            },
            kill_timeout: 5000,
            wait_ready: true,
            listen_timeout: 15000,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
        },
        {
            name: "happy-web-local",
            script: "./node_modules/.bin/expo",
            args: "start --web --port 8082 --non-interactive",
            cwd: path.join(HOME, "happy/packages/happy-app"),
            interpreter: "node",
            exec_mode: "fork",
            env: {
                NODE_ENV: "development",
                EXPO_PUBLIC_HAPPY_SERVER_URL: "http://localhost:3005",
            },
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
        },
        {
            name: "happy-daemon",
            script: "./dist/index.mjs",
            args: "daemon start-sync",
            cwd: path.join(HOME, "happy/packages/happy-cli"),
            interpreter: "node",
            interpreter_args: "--no-warnings --no-deprecation",
            exec_mode: "fork",
            env: {
                HAPPY_HOME_DIR: path.join(HOME, ".happy-dev"),
                HAPPY_SERVER_URL: "http://localhost:3005",
                HAPPY_WEBAPP_URL: "http://localhost:8082",
                DEBUG: "1",
                NODE_NO_WARNINGS: "1",
                OPENROUTER_API_KEY: "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",
            },
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
        }
    ]
};
