const fs = require('fs');

// Remove CLAUDECODE env var to prevent "nested session" detection
delete process.env.CLAUDECODE;

// Disable autoupdater (never works really)
process.env.DISABLE_AUTOUPDATER = '1';

// Helper to write JSON messages to fd 3
function writeMessage(message) {
    try {
        fs.writeSync(3, JSON.stringify(message) + '\n');
    } catch (err) {
        // fd 3 not available, ignore
    }
}

// --- SSE stream text delta extraction ---

/**
 * Returns true if this fetch URL targets the Anthropic messages API (streaming).
 */
function isAnthropicStreamingRequest(url, opts) {
    try {
        const u = new URL(url, 'http://localhost');
        // Anthropic API: POST to /v1/messages with stream header
        if (u.pathname.includes('/v1/messages') && opts?.method === 'POST') {
            return true;
        }
    } catch {}
    return false;
}

/**
 * Creates a TransformStream that passes data through unchanged while
 * parsing SSE events and emitting text deltas via fd 3.
 */
function createSSEInterceptor() {
    let buffer = '';

    return new TransformStream({
        transform(chunk, controller) {
            // Always pass data through unchanged
            controller.enqueue(chunk);

            // Decode and parse SSE events
            try {
                const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
                buffer += text;

                // Process complete SSE events (separated by double newlines)
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const eventBlock = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);

                    // Parse SSE fields
                    let eventType = '';
                    let dataStr = '';
                    for (const line of eventBlock.split('\n')) {
                        if (line.startsWith('event:')) {
                            eventType = line.slice(6).trim();
                        } else if (line.startsWith('data:')) {
                            dataStr += line.slice(5).trim();
                        }
                    }

                    if (!dataStr) continue;

                    // Extract text deltas from content_block_delta events
                    if (eventType === 'content_block_delta') {
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.delta?.type === 'text_delta' && data.delta.text) {
                                writeMessage({
                                    type: 'text-delta',
                                    text: data.delta.text,
                                    timestamp: Date.now()
                                });
                            }
                        } catch {}
                    }
                }
            } catch {
                // Never interfere with the original stream
            }
        },
        flush() {
            buffer = '';
        }
    });
}

// Intercept fetch to track thinking state and extract stream deltas
const originalFetch = global.fetch;
let fetchCounter = 0;

global.fetch = function(...args) {
    const id = ++fetchCounter;
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = args[1]?.method || 'GET';

    // Parse URL for privacy
    let hostname = '';
    let path = '';
    try {
        const urlObj = new URL(url, 'http://localhost');
        hostname = urlObj.hostname;
        path = urlObj.pathname;
    } catch (e) {
        // If URL parsing fails, use defaults
        hostname = 'unknown';
        path = url;
    }

    // Send fetch start event
    writeMessage({
        type: 'fetch-start',
        id,
        hostname,
        path,
        method,
        timestamp: Date.now()
    });

    // Check if this is a streaming Anthropic API request
    const shouldInterceptStream = isAnthropicStreamingRequest(url, { method });

    // Execute the original fetch
    const fetchPromise = originalFetch(...args);

    if (!shouldInterceptStream) {
        // Non-streaming: just track start/end as before
        const sendEnd = () => {
            writeMessage({
                type: 'fetch-end',
                id,
                timestamp: Date.now()
            });
        };
        fetchPromise.then(sendEnd, sendEnd);
        return fetchPromise;
    }

    // Streaming: intercept the response body to extract text deltas
    return fetchPromise.then((response) => {
        writeMessage({
            type: 'fetch-end',
            id,
            timestamp: Date.now()
        });

        // If no readable body (shouldn't happen for streaming), return as-is
        if (!response.body) {
            return response;
        }

        // Pipe through our SSE interceptor
        const interceptor = createSSEInterceptor();
        const newBody = response.body.pipeThrough(interceptor);

        return new Response(newBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    }, (err) => {
        writeMessage({
            type: 'fetch-end',
            id,
            timestamp: Date.now()
        });
        throw err;
    });
};

// Preserve fetch properties
Object.defineProperty(global.fetch, 'name', { value: 'fetch' });
Object.defineProperty(global.fetch, 'length', { value: originalFetch.length });

// Import global Claude Code CLI
const { getClaudeCliPath, runClaudeCli } = require('./claude_version_utils.cjs');

runClaudeCli(getClaudeCliPath());
