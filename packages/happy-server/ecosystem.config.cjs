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
            },
            kill_timeout: 5000,
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
            },
            kill_timeout: 5000,
        }
    ]
};
