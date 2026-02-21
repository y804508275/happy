// Remove CLAUDECODE env var to prevent "nested session" detection
// When the daemon is started from within a Claude Code session, this env var
// propagates and causes the spawned Claude binary to refuse to start
delete process.env.CLAUDECODE;

// Intercept setTimeout for the Claude Code SDK
const originalSetTimeout = global.setTimeout;

global.setTimeout = function(callback, delay, ...args) {
    // Just wrap and call the original setTimeout
    return originalSetTimeout(callback, delay, ...args);
};

// Preserve setTimeout properties
Object.defineProperty(global.setTimeout, 'name', { value: 'setTimeout' });
Object.defineProperty(global.setTimeout, 'length', { value: originalSetTimeout.length });

// Import global Claude Code CLI
const { getClaudeCliPath, runClaudeCli } = require('./claude_version_utils.cjs');

runClaudeCli(getClaudeCliPath());