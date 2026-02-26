module.exports = {
    apps: [
        {
            name: "happy-server-1",
            script: "./sources/main.ts",
            cwd: "/opt/happy-coder/packages/happy-server",
            interpreter: "/opt/happy-coder/node_modules/.bin/tsx",
            exec_mode: "fork",
            env: {
                NODE_ENV: "production",
                HOME: "/root",
                PORT: "3001",
                METRICS_PORT: "9091",
                REDIS_URL: "redis://127.0.0.1:6379",
            },
            kill_timeout: 5000,
            wait_ready: true,
            listen_timeout: 15000,
        },
        {
            name: "happy-server-2",
            script: "./sources/main.ts",
            cwd: "/opt/happy-coder/packages/happy-server",
            interpreter: "/opt/happy-coder/node_modules/.bin/tsx",
            exec_mode: "fork",
            env: {
                NODE_ENV: "production",
                HOME: "/root",
                PORT: "3002",
                METRICS_PORT: "9092",
                REDIS_URL: "redis://127.0.0.1:6379",
            },
            kill_timeout: 5000,
            wait_ready: true,
            listen_timeout: 15000,
        }
    ]
};
