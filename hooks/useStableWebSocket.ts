import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * ============================================================================
 * STABLE WEBSOCKET HOOK
 * ============================================================================
 * Provides a resilient WebSocket connection with:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat ping/pong to detect dead connections
 * - Message queuing while disconnected
 * - App state awareness (reconnect on foreground)
 * - Connection state tracking
 */

export type WsConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface UseStableWebSocketOptions {
  url: string;
  /** Called for every incoming message */
  onMessage: (data: any) => void;
  /** Called when connection state changes */
  onStateChange?: (state: WsConnectionState) => void;
  /** Max reconnect attempts before giving up (0 = infinite). Default: 0 */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms. Default: 1000 */
  initialReconnectDelay?: number;
  /** Max reconnect delay in ms. Default: 30000 */
  maxReconnectDelay?: number;
  /** Heartbeat interval in ms. Default: 25000 */
  heartbeatInterval?: number;
  /** How long to wait for pong before considering connection dead. Default: 10000 */
  heartbeatTimeout?: number;
}

export interface UseStableWebSocketReturn {
  /** Send a JSON message. Queues if not connected. */
  send: (data: any) => void;
  /** Current connection state */
  state: WsConnectionState;
  /** Whether the socket is connected and ready */
  isConnected: boolean;
  /** Force reconnect */
  reconnect: () => void;
  /** Disconnect and stop reconnecting */
  disconnect: () => void;
}

export function useStableWebSocket(options: UseStableWebSocketOptions): UseStableWebSocketReturn {
  const {
    url,
    onMessage,
    onStateChange,
    maxReconnectAttempts = 0,
    initialReconnectDelay = 1000,
    maxReconnectDelay = 30000,
    heartbeatInterval = 25000,
    heartbeatTimeout = 10000,
  } = options;

  const [state, setState] = useState<WsConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueue = useRef<string[]>([]);
  const intentionalClose = useRef(false);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  const onStateChangeRef = useRef(onStateChange);

  // Keep refs up to date without re-triggering effects
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  const updateState = useCallback((newState: WsConnectionState) => {
    if (!mountedRef.current) return;
    setState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
    if (pongTimer.current) {
      clearTimeout(pongTimer.current);
      pongTimer.current = null;
    }
  }, []);

  const flushQueue = useCallback((ws: WebSocket) => {
    while (messageQueue.current.length > 0 && ws.readyState === WebSocket.OPEN) {
      const msg = messageQueue.current.shift()!;
      ws.send(msg);
    }
  }, []);

  const startHeartbeat = useCallback((ws: WebSocket) => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    if (pongTimer.current) clearTimeout(pongTimer.current);

    heartbeatTimer.current = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;

      // Send ping
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Socket might be closing
        return;
      }

      // Wait for pong
      pongTimer.current = setTimeout(() => {
        // No pong received — connection is dead
        console.log('[WS] Heartbeat timeout — closing dead connection');
        ws.close(4000, 'Heartbeat timeout');
      }, heartbeatTimeout);
    }, heartbeatInterval);
  }, [heartbeatInterval, heartbeatTimeout]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    intentionalClose.current = false;
    const isReconnect = reconnectAttempts.current > 0;
    updateState(isReconnect ? 'reconnecting' : 'connecting');
    console.log(`[WS] ${isReconnect ? 'Reconnecting' : 'Connecting'} to ${url} (attempt ${reconnectAttempts.current + 1})`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      console.log('[WS] Connected');
      reconnectAttempts.current = 0;
      updateState('connected');
      flushQueue(ws);
      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // Handle pong (heartbeat response)
      if (data.type === 'pong') {
        if (pongTimer.current) {
          clearTimeout(pongTimer.current);
          pongTimer.current = null;
        }
        return;
      }

      onMessageRef.current(data);
    };

    ws.onerror = (e) => {
      if (!mountedRef.current) return;
      console.warn('[WS] Error:', (e as any)?.message ?? 'unknown');
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      clearTimers();
      wsRef.current = null;
      console.log(`[WS] Closed: code=${event.code} reason=${event.reason || 'none'}`);

      if (intentionalClose.current) {
        updateState('disconnected');
        return;
      }

      updateState('disconnected');
      scheduleReconnect();
    };
  }, [url, updateState, clearTimers, flushQueue, startHeartbeat]);

  const scheduleReconnect = useCallback(() => {
    if (intentionalClose.current || !mountedRef.current) return;
    if (maxReconnectAttempts > 0 && reconnectAttempts.current >= maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      updateState('disconnected');
      return;
    }

    const delay = Math.min(
      initialReconnectDelay * Math.pow(1.5, reconnectAttempts.current),
      maxReconnectDelay
    );
    // Add jitter (±20%)
    const jitter = delay * (0.8 + Math.random() * 0.4);
    console.log(`[WS] Scheduling reconnect in ${Math.round(jitter)}ms`);

    reconnectAttempts.current += 1;
    updateState('reconnecting');

    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current && !intentionalClose.current) {
        connect();
      }
    }, jitter);
  }, [maxReconnectAttempts, initialReconnectDelay, maxReconnectDelay, connect, updateState]);

  const send = useCallback((data: any) => {
    const msg = JSON.stringify(data);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    } else {
      // Queue for when connection is restored
      messageQueue.current.push(msg);
      // Cap queue size
      if (messageQueue.current.length > 20) {
        messageQueue.current.shift();
      }
    }
  }, []);

  const reconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      intentionalClose.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
    reconnectAttempts.current = 0;
    intentionalClose.current = false;
    connect();
  }, [clearTimers, connect]);

  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    clearTimers();
    messageQueue.current = [];
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    updateState('disconnected');
  }, [clearTimers, updateState]);

  // Initial connection
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      intentionalClose.current = true;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
  }, [url]); // Reconnect if URL changes

  // Reconnect when app comes back to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && !intentionalClose.current) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[WS] App foregrounded — reconnecting');
          reconnectAttempts.current = 0;
          connect();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [connect]);

  return {
    send,
    state,
    isConnected: state === 'connected',
    reconnect,
    disconnect,
  };
}
