/**
 * useChatAgent — owns the streaming chat state for the Candle main screen.
 *
 * It wires `useStableWebSocket` (the reconnect/heartbeat transport) to the
 * agent's discriminated WebSocket contract and folds every incoming event into
 * a list of `MessageItem`s. Each AI turn carries an `AiStreamNode[]` (text /
 * reasoning / tool / approval / security) that the UI renders directly.
 *
 * The hook is the single source of truth for chat state; screens consume
 * `messages`, drive new turns through `sendPrompt`, and resolve command
 * approvals through `decideApproval` (also exposed via `ApprovalContext`).
 */
import { createContext, useCallback, useMemo, useRef, useState } from 'react';

import {
    buildHistory,
    getWebSocketUrl,
    isRecursionNoise,
    nextId,
    normalizeRisk,
    stringifyOutput,
    toolActionName,
    toolTargetName,
} from './chat-format';
import type {
    AiMessage,
    AiStreamNode,
    ApprovalNode,
    ApprovalStatus,
    ChatMode,
    GenUINode,
    MessageItem,
    ReasoningNode,
    SecurityNode,
    TextNode,
    ToolNode
} from './chat-types';
import { useStableWebSocket, type WsConnectionState } from './useStableWebSocket';

/** Decision a user can make on a command-approval request. */
export type ApprovalUserDecision = 'allow_once' | 'allow_always' | 'reject';

export interface ApprovalContextValue {
  decide: (requestId: string, command: string, decision: ApprovalUserDecision) => void;
}

/** React context exposing the approval resolver to nested approval cards. */
export const ApprovalContext = createContext<ApprovalContextValue>({
  decide: () => {},
});

export interface UseChatAgentReturn {
  messages: MessageItem[];
  sendPrompt: (text: string) => void;
  decideApproval: (
    requestId: string,
    command: string,
    decision: ApprovalUserDecision,
  ) => void;
  wsState: WsConnectionState;
  reconnect: () => void;
  scrollRef: React.RefObject<{ scrollToEnd: (opts?: { animated?: boolean }) => void } | null>;
}

function isAi(message: MessageItem | undefined): message is AiMessage {
  return message?.type === 'ai';
}

/** Shallow-clone an AI message + its node array so React sees a new reference. */
function cloneAi(message: AiMessage): AiMessage {
  return { ...message, nodes: [...message.nodes] };
}

export function useChatAgent(): UseChatAgentReturn {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  // Mirror of `messages` for synchronous reads inside send/handlers.
  const messagesRef = useRef<MessageItem[]>([]);
  const scrollRef = useRef<{ scrollToEnd: (opts?: { animated?: boolean }) => void } | null>(null);

  const url = useMemo(() => getWebSocketUrl(), []);

  const commit = useCallback((next: MessageItem[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  /** Replace the trailing AI message via a producer that gets a fresh clone. */
  const updateTrailingAi = useCallback(
    (producer: (ai: AiMessage) => void) => {
      const current = messagesRef.current;
      const last = current[current.length - 1];
      if (!isAi(last)) return;
      const clone = cloneAi(last);
      producer(clone);
      commit([...current.slice(0, -1), clone]);
    },
    [commit],
  );

  const handleWsMessage = useCallback(
    (data: any) => {
      if (!data || typeof data.type !== 'string') return;
      const type = data.type as string;

      // ── Agent start ────────────────────────────────────────────────────
      if (type === 'status' && data.content === 'Agent started...') {
        const current = messagesRef.current;
        const last = current[current.length - 1];
        if (!isAi(last)) {
          const aiMsg: AiMessage = {
            id: nextId('ai'),
            type: 'ai',
            mode: 'normal',
            nodes: [],
            isProcessing: true,
          };
          commit([...current, aiMsg]);
        }
        return;
      }

      // ── Agent finished ─────────────────────────────────────────────────
      if (type === 'status' && data.content === 'Agent finished.') {
        updateTrailingAi((ai) => {
          ai.isProcessing = false;
        });
        return;
      }

      switch (type) {
        case 'mode': {
          const mode = data.mode as ChatMode;
          if (mode === 'normal' || mode === 'reasoning' || mode === 'agent') {
            updateTrailingAi((ai) => {
              ai.mode = mode;
            });
          }
          break;
        }

        case 'reasoning_chunk': {
          const content = typeof data.content === 'string' ? data.content : '';
          if (!content) break;
          updateTrailingAi((ai) => {
            const last = ai.nodes[ai.nodes.length - 1];
            if (last && last.type === 'reasoning') {
              const updated: ReasoningNode = { ...last, content: last.content + content };
              ai.nodes[ai.nodes.length - 1] = updated;
            } else {
              ai.nodes.push({ type: 'reasoning', id: nextId('reason'), content });
            }
          });
          break;
        }

        case 'thought_chunk': {
          const content = typeof data.content === 'string' ? data.content : '';
          if (!content || isRecursionNoise(content)) break;
          updateTrailingAi((ai) => {
            const last = ai.nodes[ai.nodes.length - 1];
            if (last && last.type === 'text') {
              const updated: TextNode = { ...last, content: last.content + content };
              ai.nodes[ai.nodes.length - 1] = updated;
            } else {
              ai.nodes.push({ type: 'text', id: nextId('text'), content });
            }
          });
          scrollToEnd();
          break;
        }

        case 'answer_reset': {
          updateTrailingAi((ai) => {
            ai.nodes = ai.nodes.filter((node) => node.type !== 'text');
          });
          break;
        }

        case 'tool_start': {
          const toolName = typeof data.toolName === 'string' ? data.toolName : '';
          updateTrailingAi((ai) => {
            // Reuse the running batch if a tool is still in flight, else start
            // a new batch keyed on time.
            const runningBatch = ai.nodes.find(
              (node): node is ToolNode => node.type === 'tool' && node.status === 'running',
            );
            const batchId = runningBatch?.batchId ?? Date.now();
            const node: ToolNode = {
              type: 'tool',
              id: nextId('tool'),
              actionName: toolActionName(toolName),
              targetName: toolTargetName(data.input),
              status: 'running',
              batchId,
            };
            ai.nodes.push(node);
          });
          scrollToEnd();
          break;
        }

        case 'tool_end': {
          updateTrailingAi((ai) => {
            for (let i = ai.nodes.length - 1; i >= 0; i -= 1) {
              const node = ai.nodes[i];
              if (node.type === 'tool' && node.status === 'running') {
                const updated: ToolNode = {
                  ...node,
                  status: 'done',
                  output: stringifyOutput(data.output),
                };
                ai.nodes[i] = updated;
                break;
              }
            }
          });
          break;
        }

        case 'approval_request': {
          const requestId = String(data.requestId ?? '');
          if (!requestId) break;
          updateTrailingAi((ai) => {
            const exists = ai.nodes.some(
              (node) => node.type === 'approval' && node.requestId === requestId,
            );
            if (exists) return;
            const node: ApprovalNode = {
              type: 'approval',
              id: nextId('approval'),
              requestId,
              command: String(data.command ?? ''),
              riskLevel: normalizeRisk(data.riskLevel),
              reason: typeof data.reason === 'string' ? data.reason : undefined,
              status: 'pending',
            };
            ai.nodes.push(node);
          });
          scrollToEnd();
          break;
        }

        case 'approval_decision': {
          const command = String(data.command ?? '');
          const decision = String(data.decision ?? '');
          const source = String(data.source ?? '');
          let status: ApprovalStatus;
          if (source === 'auto') status = 'auto_reject';
          else if (source === 'timeout') status = 'expired';
          else if (decision === 'allow_once') status = 'allow_once';
          else if (decision === 'allow_always') status = 'allow_always';
          else status = 'reject';

          updateTrailingAi((ai) => {
            for (let i = ai.nodes.length - 1; i >= 0; i -= 1) {
              const node = ai.nodes[i];
              if (
                node.type === 'approval' &&
                node.status === 'pending' &&
                node.command === command
              ) {
                ai.nodes[i] = { ...node, status };
                break;
              }
            }
          });
          break;
        }

        case 'security_notice': {
          const severity = data.severity === 'high' ? 'high' : 'medium';
          const where = data.where === 'tool' ? 'tool' : 'prompt';
          const labels = Array.isArray(data.labels)
            ? data.labels.filter((l: unknown): l is string => typeof l === 'string').slice(0, 8)
            : [];
          updateTrailingAi((ai) => {
            const last = ai.nodes[ai.nodes.length - 1];
            if (
              last &&
              last.type === 'security' &&
              last.severity === severity &&
              last.where === where &&
              last.labels.join('|') === labels.join('|')
            ) {
              return; // dedup identical consecutive notice
            }
            const node: SecurityNode = {
              type: 'security',
              id: nextId('security'),
              severity,
              labels,
              where,
            };
            ai.nodes.push(node);
          });
          break;
        }

        case 'genui': {
          const kindRaw = typeof data.kind === 'string' ? data.kind : '';
          const validKinds: GenUINode['kind'][] = [
            'insights',
            'table',
            'kanban',
            'agent_action',
            'plan',
            'workers',
            'locations',
          ];
          if (!validKinds.includes(kindRaw as GenUINode['kind'])) break;
          updateTrailingAi((ai) => {
            const node: GenUINode = {
              type: 'genui',
              id: nextId('genui'),
              kind: kindRaw as GenUINode['kind'],
              data: data.data,
            };
            ai.nodes.push(node);
          });
          scrollToEnd();
          break;
        }

        case 'error': {
          const raw = typeof data.content === 'string' ? data.content : 'Something went wrong.';
          const content = isRecursionNoise(raw)
            ? 'The agent hit its step limit before finishing.'
            : raw;
          updateTrailingAi((ai) => {
            ai.isProcessing = false;
            ai.nodes.push({ type: 'text', id: nextId('text'), content });
          });
          scrollToEnd();
          break;
        }

        default:
          break;
      }
    },
    [commit, scrollToEnd, updateTrailingAi],
  );

  const { send, state, reconnect } = useStableWebSocket({
    url,
    onMessage: handleWsMessage,
    heartbeatInterval: 25000,
    heartbeatTimeout: 10000,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
  });

  const sendPrompt = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content) return;

      const history = buildHistory(messagesRef.current);

      const userMsg: MessageItem = { id: nextId('user'), type: 'user', content };
      const aiPlaceholder: AiMessage = {
        id: nextId('ai'),
        type: 'ai',
        mode: 'normal',
        nodes: [],
        isProcessing: true,
      };
      commit([...messagesRef.current, userMsg, aiPlaceholder]);
      scrollToEnd();

      send({ type: 'prompt', content, history });
    },
    [commit, scrollToEnd, send],
  );

  const decideApproval = useCallback(
    (requestId: string, command: string, decision: ApprovalUserDecision) => {
      updateTrailingAi((ai) => {
        for (let i = ai.nodes.length - 1; i >= 0; i -= 1) {
          const node = ai.nodes[i];
          if (
            node.type === 'approval' &&
            node.requestId === requestId &&
            node.status === 'pending'
          ) {
            ai.nodes[i] = { ...node, status: decision };
            break;
          }
        }
      });
      send({ type: 'approval_response', requestId, decision });
    },
    [send, updateTrailingAi],
  );

  return {
    messages,
    sendPrompt,
    decideApproval,
    wsState: state,
    reconnect,
    scrollRef,
  };
}

// Re-export node types for convenience so screens can import from one place.
export type { AiStreamNode, MessageItem };
