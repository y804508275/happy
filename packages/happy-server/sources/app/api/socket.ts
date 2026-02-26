import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { buildMachineActivityEphemeral, ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { Server, Socket } from "socket.io";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";
import { decrementWebSocketConnection, incrementWebSocketConnection, websocketEventsCounter } from "../monitoring/metrics2";
import { usageHandler } from "./socket/usageHandler";
import { rpcHandler } from "./socket/rpcHandler";
import { pingHandler } from "./socket/pingHandler";
import { sessionUpdateHandler } from "./socket/sessionUpdateHandler";
import { machineUpdateHandler } from "./socket/machineUpdateHandler";
import { artifactUpdateHandler } from "./socket/artifactUpdateHandler";
import { accessKeyHandler } from "./socket/accessKeyHandler";
import * as crypto from "crypto";

export function startSocket(app: Fastify) {
    const io = new Server(app.server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["*"]
        },
        transports: ['websocket'],
        pingTimeout: 45000,
        pingInterval: 15000,
        path: '/v1/updates',
        allowUpgrades: true,
        upgradeTimeout: 10000,
        connectTimeout: 20000,
        serveClient: false
    });

    // Initialize eventRouter with io reference for room-based emission
    eventRouter.init(io);

    let rpcListeners = new Map<string, Map<string, Socket>>();

    // Cross-instance RPC forwarding via Redis pub/sub
    let forwardRpcCrossInstance: ((userId: string, method: string, params: any) => Promise<any>) | null = null;

    if (process.env.REDIS_URL) {
        // Add Redis adapter for cross-instance Socket.IO broadcasting
        import("@socket.io/redis-streams-adapter").then(({ createAdapter }) => {
            import("ioredis").then(({ default: Redis }) => {
                const adapterClient = new Redis(process.env.REDIS_URL!);
                io.adapter(createAdapter(adapterClient));
                log({ module: 'websocket' }, `Redis streams adapter connected`);
            });
        });

        // Setup Redis pub/sub for cross-instance RPC forwarding
        import("ioredis").then(({ default: Redis }) => {
            const instanceId = crypto.randomUUID();
            const redisPub = new Redis(process.env.REDIS_URL!);
            const redisSub = new Redis(process.env.REDIS_URL!);
            const pendingRpcCalls = new Map<string, { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> }>();

            redisSub.subscribe('rpc-forward', `rpc-response:${instanceId}`);

            redisSub.on('message', async (channel, message) => {
                if (channel === 'rpc-forward') {
                    // Another instance is asking us to forward an RPC call
                    const { userId, method, params, requestId, replyTo } = JSON.parse(message);
                    if (replyTo === instanceId) return; // Skip self

                    const userRpcListeners = rpcListeners.get(userId);
                    const targetSocket = userRpcListeners?.get(method);
                    const methods = userRpcListeners ? Array.from(userRpcListeners.keys()) : [];
                    log({ module: 'websocket-rpc' }, `RPC forward received: method=${method}, userId=${userId}, hasTarget=${!!targetSocket?.connected}, localUsers=[${Array.from(rpcListeners.keys()).join(',')}], userMethods=[${methods.join(',')}]`);

                    if (!targetSocket?.connected) return; // We don't have the target

                    try {
                        log({ module: 'websocket-rpc' }, `RPC forwarding to local daemon: method=${method}`);
                        const response = await targetSocket.timeout(30000).emitWithAck('rpc-request', {
                            method,
                            params
                        });
                        log({ module: 'websocket-rpc' }, `RPC forward success: method=${method}`);
                        redisPub.publish(`rpc-response:${replyTo}`, JSON.stringify({
                            requestId,
                            ok: true,
                            result: response
                        }));
                    } catch (error) {
                        log({ module: 'websocket-rpc', level: 'error' }, `RPC forward to daemon failed: ${error}`);
                        redisPub.publish(`rpc-response:${replyTo}`, JSON.stringify({
                            requestId,
                            ok: false,
                            error: error instanceof Error ? error.message : 'RPC call failed'
                        }));
                    }
                } else if (channel === `rpc-response:${instanceId}`) {
                    // Response to our cross-instance RPC call
                    const { requestId, ...response } = JSON.parse(message);
                    log({ module: 'websocket-rpc' }, `RPC response received: requestId=${requestId}, response=${JSON.stringify(response)}`);
                    const pending = pendingRpcCalls.get(requestId);
                    if (pending) {
                        clearTimeout(pending.timer);
                        pendingRpcCalls.delete(requestId);
                        pending.resolve(response);
                    } else {
                        log({ module: 'websocket-rpc', level: 'warn' }, `RPC response for unknown requestId: ${requestId}`);
                    }
                }
            });

            forwardRpcCrossInstance = (userId: string, method: string, params: any): Promise<any> => {
                return new Promise((resolve) => {
                    const requestId = crypto.randomUUID();
                    const timer = setTimeout(() => {
                        pendingRpcCalls.delete(requestId);
                        resolve(null);
                    }, 30000);

                    pendingRpcCalls.set(requestId, { resolve, timer });
                    redisPub.publish('rpc-forward', JSON.stringify({
                        userId,
                        method,
                        params,
                        requestId,
                        replyTo: instanceId
                    }));
                });
            };

            onShutdown('redis-rpc', async () => {
                redisSub.disconnect();
                redisPub.disconnect();
            });

            log({ module: 'websocket' }, `Redis RPC forwarding ready (instance: ${instanceId.slice(0, 8)})`);
        });
    }

    // Auth middleware: runs BEFORE the connection event fires, so all socket.on()
    // listeners are set up synchronously and no incoming events are lost.
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token as string;
        const clientType = socket.handshake.auth.clientType as string | undefined;
        const sessionId = socket.handshake.auth.sessionId as string | undefined;
        const machineId = socket.handshake.auth.machineId as string | undefined;

        if (!token) {
            return next(new Error('Missing authentication token'));
        }

        if (clientType === 'session-scoped' && !sessionId) {
            return next(new Error('Session ID required for session-scoped clients'));
        }

        if (clientType === 'machine-scoped' && !machineId) {
            return next(new Error('Machine ID required for machine-scoped clients'));
        }

        const verified = await auth.verifyToken(token);
        if (!verified) {
            return next(new Error('Invalid authentication token'));
        }

        socket.data.userId = verified.userId;
        next();
    });

    io.on("connection", (socket) => {
        const userId = socket.data.userId as string;
        const clientType = socket.handshake.auth.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.handshake.auth.sessionId as string | undefined;
        const machineId = socket.handshake.auth.machineId as string | undefined;

        log({ module: 'websocket' }, `Token verified: ${userId}, clientType: ${clientType || 'user-scoped'}, sessionId: ${sessionId || 'none'}, machineId: ${machineId || 'none'}, socketId: ${socket.id}`);

        // Store connection based on type
        const metadata = { clientType: clientType || 'user-scoped', sessionId, machineId };
        let connection: ClientConnection;
        if (metadata.clientType === 'session-scoped' && sessionId) {
            connection = {
                connectionType: 'session-scoped',
                socket,
                userId,
                sessionId
            };
        } else if (metadata.clientType === 'machine-scoped' && machineId) {
            connection = {
                connectionType: 'machine-scoped',
                socket,
                userId,
                machineId
            };
        } else {
            connection = {
                connectionType: 'user-scoped',
                socket,
                userId
            };
        }

        // Set up ALL event handlers SYNCHRONOUSLY before any events can arrive.
        // This prevents race conditions where the daemon sends rpc-register
        // before the listener is ready.
        let userRpcListeners = rpcListeners.get(userId);
        if (!userRpcListeners) {
            userRpcListeners = new Map<string, Socket>();
            rpcListeners.set(userId, userRpcListeners);
        }
        rpcHandler(userId, socket, userRpcListeners, () => forwardRpcCrossInstance);
        usageHandler(userId, socket);
        sessionUpdateHandler(userId, socket, connection);
        pingHandler(socket);
        machineUpdateHandler(userId, socket);
        artifactUpdateHandler(userId, socket);
        accessKeyHandler(userId, socket);

        socket.on('disconnect', (reason) => {
            websocketEventsCounter.inc({ event_type: 'disconnect' });

            // Cleanup connections
            eventRouter.removeConnection(userId, connection);
            decrementWebSocketConnection(connection.connectionType);

            log({ module: 'websocket' }, `User disconnected: ${userId}, reason: ${reason}, socketId: ${socket.id}`);

            // Broadcast daemon offline status
            if (connection.connectionType === 'machine-scoped') {
                const machineActivity = buildMachineActivityEphemeral(connection.machineId, false, Date.now());
                eventRouter.emitEphemeral({
                    userId,
                    payload: machineActivity,
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }
        });

        // Now add connection to router and broadcast (after handlers are ready)
        eventRouter.addConnection(userId, connection);
        incrementWebSocketConnection(connection.connectionType);

        // Broadcast daemon online status
        if (connection.connectionType === 'machine-scoped') {
            const machineActivity = buildMachineActivityEphemeral(machineId!, true, Date.now());
            eventRouter.emitEphemeral({
                userId,
                payload: machineActivity,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        log({ module: 'websocket' }, `User connected: ${userId}`);
    });

    onShutdown('api', async () => {
        await io.close();
    });
}
