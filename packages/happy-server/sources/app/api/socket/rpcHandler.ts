import { log } from "@/utils/log";
import { Socket } from "socket.io";

type RpcForwarder = ((userId: string, method: string, params: any) => Promise<any>) | null;

export function rpcHandler(
    userId: string,
    socket: Socket,
    rpcListeners: Map<string, Socket>,
    getForwarder: () => RpcForwarder
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
            if (forwarder) {
                try {
                    const response = await forwarder(userId, method, params);
                    if (response) {
                        if (callback) {
                            callback(response);
                        }
                        return;
                    }
                } catch (e) {
                    // Cross-instance forwarding failed, fall through
                }
            }

            if (callback) {
                callback({
                    ok: false,
                    error: 'RPC method not available'
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
