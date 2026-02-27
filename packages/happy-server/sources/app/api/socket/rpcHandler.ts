import { log } from "@/utils/log";
import { Socket } from "socket.io";
import { EventEmitter } from "events";

type RpcForwarder = ((userId: string, method: string, params: any) => Promise<any>) | null;

export function rpcHandler(
    userId: string,
    socket: Socket,
    rpcListeners: Map<string, Socket>,
    getForwarder: () => RpcForwarder,
    registrationEmitter: EventEmitter
) {

    // RPC register - Register this socket as a listener for an RPC method
    socket.on('rpc-register', async (data: any) => {
        try {
            const { method } = data;

            if (!method || typeof method !== 'string') {
                socket.emit('rpc-error', { type: 'register', error: 'Invalid method name' });
                return;
            }

            // Check if method was already registered
            const previousSocket = rpcListeners.get(method);
            if (previousSocket && previousSocket !== socket) {
                // log({ module: 'websocket-rpc' }, `RPC method ${method} re-registered: ${previousSocket.id} -> ${socket.id}`);
            }

            // Register this socket as the listener for this method
            rpcListeners.set(method, socket);
            registrationEmitter.emit(`registered:${userId}:${method}`);
            log({ module: 'websocket-rpc' }, `RPC method registered: ${method} on socket ${socket.id} (user: ${userId}), total methods: ${rpcListeners.size}`);

            socket.emit('rpc-registered', { method });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in rpc-register: ${error}`);
            socket.emit('rpc-error', { type: 'register', error: 'Internal error' });
        }
    });

    // RPC unregister - Remove this socket as a listener for an RPC method
    socket.on('rpc-unregister', async (data: any) => {
        try {
            const { method } = data;

            if (!method || typeof method !== 'string') {
                socket.emit('rpc-error', { type: 'unregister', error: 'Invalid method name' });
                return;
            }

            if (rpcListeners.get(method) === socket) {
                rpcListeners.delete(method);

                if (rpcListeners.size === 0) {
                    rpcListeners.delete(userId);
                }
            }

            socket.emit('rpc-unregistered', { method });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in rpc-unregister: ${error}`);
            socket.emit('rpc-error', { type: 'unregister', error: 'Internal error' });
        }
    });

    // RPC call - Call an RPC method on another socket of the same user
    socket.on('rpc-call', async (data: any, callback: (response: any) => void) => {
        try {
            const { method, params } = data;
            log({ module: 'websocket-rpc' }, `RPC call: method=${method}, userId=${userId}, totalLocalMethods=${rpcListeners.size}, hasLocal=${rpcListeners.has(method)}`);

            if (!method || typeof method !== 'string') {
                if (callback) {
                    callback({
                        ok: false,
                        error: 'Invalid parameters: method is required'
                    });
                }
                return;
            }

            const targetSocket = rpcListeners.get(method);

            // Don't allow calling your own socket
            if (targetSocket === socket) {
                if (callback) {
                    callback({
                        ok: false,
                        error: 'Cannot call RPC on the same socket'
                    });
                }
                return;
            }

            // Try local socket first
            if (targetSocket && targetSocket.connected) {
                log({ module: 'websocket-rpc' }, `RPC call: found local target for ${method}`);
                try {
                    const response = await targetSocket.timeout(30000).emitWithAck('rpc-request', {
                        method,
                        params
                    });

                    if (callback) {
                        callback({
                            ok: true,
                            result: response
                        });
                    }
                    return;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'RPC call failed';
                    if (callback) {
                        callback({
                            ok: false,
                            error: errorMsg
                        });
                    }
                    return;
                }
            }

            // Try cross-instance forwarding via Redis pub/sub
            const forwarder = getForwarder();
            log({ module: 'websocket-rpc' }, `RPC call: no local target for ${method}, forwarder=${forwarder ? 'available' : 'null'}`);
            if (forwarder) {
                try {
                    const response = await forwarder(userId, method, params);
                    log({ module: 'websocket-rpc' }, `RPC forward response: ${JSON.stringify(response)}`);
                    if (response) {
                        if (callback) {
                            callback(response);
                        }
                        return;
                    }
                } catch (e) {
                    log({ module: 'websocket-rpc', level: 'error' }, `RPC forward error: ${e}`);
                }
            }

            // Method not found locally or cross-instance — wait for daemon to reconnect
            const RECONNECT_WAIT_MS = 15000;
            const eventName = `registered:${userId}:${method}`;

            log({ module: 'websocket-rpc' }, `RPC call: waiting up to ${RECONNECT_WAIT_MS}ms for method ${method} to be registered`);

            const registered = await new Promise<boolean>((resolve) => {
                const timer = setTimeout(() => {
                    registrationEmitter.removeListener(eventName, onRegistered);
                    resolve(false);
                }, RECONNECT_WAIT_MS);

                function onRegistered() {
                    clearTimeout(timer);
                    resolve(true);
                }
                registrationEmitter.once(eventName, onRegistered);

                // Check immediately in case it was registered between our last check and now
                const currentSocket = rpcListeners.get(method);
                if (currentSocket && currentSocket.connected) {
                    clearTimeout(timer);
                    registrationEmitter.removeListener(eventName, onRegistered);
                    resolve(true);
                }
            });

            if (registered) {
                const retrySocket = rpcListeners.get(method);
                if (retrySocket && retrySocket.connected) {
                    log({ module: 'websocket-rpc' }, `RPC call: method ${method} now available after waiting, proceeding`);
                    try {
                        const response = await retrySocket.timeout(30000).emitWithAck('rpc-request', {
                            method,
                            params
                        });
                        if (callback) callback({ ok: true, result: response });
                        return;
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'RPC call failed after reconnect';
                        if (callback) callback({ ok: false, error: errorMsg });
                        return;
                    }
                }

                // Try cross-instance one more time after waiting
                const forwarder2 = getForwarder();
                if (forwarder2) {
                    try {
                        const response = await forwarder2(userId, method, params);
                        if (response) {
                            if (callback) callback(response);
                            return;
                        }
                    } catch (e) {
                        log({ module: 'websocket-rpc', level: 'error' }, `RPC forward retry error: ${e}`);
                    }
                }
            }

            log({ module: 'websocket-rpc' }, `RPC call failed: method ${method} not available after ${RECONNECT_WAIT_MS}ms wait`);
            if (callback) {
                callback({
                    ok: false,
                    error: 'RPC method not available (daemon may be offline)'
                });
            }
        } catch (error) {
            if (callback) {
                callback({
                    ok: false,
                    error: 'Internal error'
                });
            }
        }
    });

    socket.on('disconnect', () => {

        const methodsToRemove: string[] = [];
        for (const [method, registeredSocket] of rpcListeners.entries()) {
            if (registeredSocket === socket) {
                methodsToRemove.push(method);
            }
        }

        if (methodsToRemove.length > 0) {
            methodsToRemove.forEach(method => rpcListeners.delete(method));
        }

        if (rpcListeners.size === 0) {
            rpcListeners.delete(userId);
        }
    });
}
