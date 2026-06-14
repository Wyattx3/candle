/**
 * Chat streaming types — the single source of truth for the shape of the
 * agent stream as it is accumulated on the client. The backend emits a
 * discriminated `type` field on every WebSocket event (see
 * `.kiro/steering/tech.md`); `handleWsMessage` in `useChatAgent` folds those
 * events into the `AiStreamNode[]` carried by each AI `MessageItem`.
 */

/** Conversation "mode" the agent reported for a given AI turn. */
export type ChatMode = 'normal' | 'reasoning' | 'agent';

/** Lifecycle of a tool node as it streams. */
export type ToolStatus = 'running' | 'done';

/** Lifecycle of an approval node. */
export type ApprovalStatus =
  | 'pending'
  | 'allow_once'
  | 'allow_always'
  | 'reject'
  | 'auto_reject'
  | 'expired';

/** Risk classification for a command approval request. */
export type ApprovalRisk = 'low' | 'medium' | 'high';

/** Severity for an inline security notice. */
export type SecuritySeverity = 'high' | 'medium';

/** Where a security notice was raised. */
export type SecurityWhere = 'prompt' | 'tool';

export interface TextNode {
  type: 'text';
  id: string;
  content: string;
}

export interface ReasoningNode {
  type: 'reasoning';
  id: string;
  content: string;
}

export interface ToolNode {
  type: 'tool';
  id: string;
  actionName: string;
  targetName: string;
  status: ToolStatus;
  output?: string;
  /** Groups tools that ran together in one model step. */
  batchId?: number;
}

export interface ApprovalNode {
  type: 'approval';
  id: string;
  requestId: string;
  command: string;
  riskLevel: ApprovalRisk;
  reason?: string;
  status: ApprovalStatus;
}

export interface SecurityNode {
  type: 'security';
  id: string;
  severity: SecuritySeverity;
  labels: string[];
  where: SecurityWhere;
}

/**
 * Inline generative-UI artifact rendered directly in the chat stream. The
 * backend emits `{ type: "genui", id, kind, data }`; `kind` selects the
 * renderer and `data` is its (optional) payload — renderers fall back to
 * sample data when `data` is absent. See `.kiro/steering/tech.md`.
 */
export type GenUIKind =
  | 'insights'
  | 'table'
  | 'kanban'
  | 'agent_action'
  | 'plan'
  | 'workers'
  | 'locations';

export interface GenUINode {
  type: 'genui';
  id: string;
  kind: GenUIKind;
  data?: unknown;
}

export type AiStreamNode =
  | TextNode
  | ReasoningNode
  | ToolNode
  | ApprovalNode
  | SecurityNode
  | GenUINode;

export interface UserMessage {
  id: string;
  type: 'user';
  content: string;
}

export interface AiMessage {
  id: string;
  type: 'ai';
  mode: ChatMode;
  nodes: AiStreamNode[];
  isProcessing: boolean;
}

export type MessageItem = UserMessage | AiMessage;

/** A single turn of history sent back to the backend with each prompt. */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
