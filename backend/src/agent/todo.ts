/**
 * Per-session task planner (procedural working memory).
 *
 * Ported from Hermes' `tools/todo_tool.py` TodoStore. Two design choices
 * carried over deliberately:
 *
 *  1. **Per-session, in-memory — NOT a global file.** The previous version
 *     wrote a single `data/todo_state.json` shared by every WebSocket
 *     connection, so concurrent users clobbered each other's plans and a
 *     plan from a previous session leaked into the next one. That breaks the
 *     "per-connection RunContext, no global mutable state" contract. Now each
 *     session id (the connection id from `session.ts`) gets its own
 *     `TodoStore`, created on demand and cleared when a fresh conversation
 *     starts or the connection closes.
 *
 *  2. **Survives context compression.** `formatForInjection()` renders ONLY
 *     pending / in_progress items (completed and cancelled ones are dropped so
 *     the model doesn't re-do finished work). The loop re-injects this block
 *     after it compresses old tool results, so the live plan is never lost
 *     when the conversation history is pruned. This is exactly what a
 *     long-horizon ("Manus-grade") agent needs to keep momentum across many
 *     steps.
 */

import { getSessionId } from "./session";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export const VALID_TODO_STATUSES: TodoStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface TodoInput {
  id?: string;
  content?: string;
  status?: string;
}

export interface TodoSummary {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

const STATUS_MARKERS: Record<TodoStatus, string> = {
  completed: "[x]",
  in_progress: "[>]",
  pending: "[ ]",
  cancelled: "[~]",
};

/**
 * Ordered, in-memory task list for a single session. List position is
 * priority. Only one item should be `in_progress` at a time (enforced by
 * guidance in the tool schema, not hard-coded here, so the model keeps
 * control of its own plan).
 */
export class TodoStore {
  private items: TodoItem[] = [];

  /**
   * Write todos. Returns the full current list after writing.
   * - merge=false (default): replace the entire list with a fresh plan.
   * - merge=true: update existing items by id, append any new ones.
   */
  write(todos: TodoInput[], merge = false): TodoItem[] {
    const deduped = TodoStore.dedupeById(todos);

    if (!merge) {
      this.items = deduped.map((t) => TodoStore.validate(t));
      return this.read();
    }

    const existing = new Map<string, TodoItem>();
    for (const item of this.items) existing.set(item.id, item);

    for (const t of deduped) {
      const id = String(t.id ?? "").trim();
      if (!id) continue; // can't merge without an id

      const current = existing.get(id);
      if (current) {
        if (typeof t.content === "string" && t.content.trim()) {
          current.content = t.content.trim();
        }
        if (typeof t.status === "string" && t.status.trim()) {
          const status = t.status.trim().toLowerCase() as TodoStatus;
          if (VALID_TODO_STATUSES.includes(status)) current.status = status;
        }
      } else {
        const validated = TodoStore.validate(t);
        existing.set(validated.id, validated);
        this.items.push(validated);
      }
    }

    // Rebuild preserving order, applying the merged updates.
    const seen = new Set<string>();
    const rebuilt: TodoItem[] = [];
    for (const item of this.items) {
      const current = existing.get(item.id) ?? item;
      if (!seen.has(current.id)) {
        rebuilt.push(current);
        seen.add(current.id);
      }
    }
    this.items = rebuilt;
    return this.read();
  }

  read(): TodoItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  clear(): void {
    this.items = [];
  }

  hasItems(): boolean {
    return this.items.length > 0;
  }

  summary(): TodoSummary {
    return {
      total: this.items.length,
      pending: this.items.filter((i) => i.status === "pending").length,
      in_progress: this.items.filter((i) => i.status === "in_progress").length,
      completed: this.items.filter((i) => i.status === "completed").length,
      cancelled: this.items.filter((i) => i.status === "cancelled").length,
    };
  }

  /**
   * Render active (pending / in_progress) items for re-injection after
   * context compression. Returns null if there's nothing active — so callers
   * can skip injecting an empty block.
   */
  formatForInjection(): string | null {
    const active = this.items.filter(
      (i) => i.status === "pending" || i.status === "in_progress"
    );
    if (active.length === 0) return null;

    const lines = ["[Your active task list — preserved across context compression]"];
    for (const item of active) {
      const marker = STATUS_MARKERS[item.status] ?? "[?]";
      lines.push(`- ${marker} ${item.id}. ${item.content} (${item.status})`);
    }
    return lines.join("\n");
  }

  private static validate(item: TodoInput): TodoItem {
    let id = String(item.id ?? "").trim();
    if (!id) id = "?";

    let content = String(item.content ?? "").trim();
    if (!content) content = "(no description)";

    let status = String(item.status ?? "pending").trim().toLowerCase() as TodoStatus;
    if (!VALID_TODO_STATUSES.includes(status)) status = "pending";

    return { id, content, status };
  }

  private static dedupeById(todos: TodoInput[]): TodoInput[] {
    const lastIndex = new Map<string, number>();
    todos.forEach((item, i) => {
      const id = String(item.id ?? "").trim() || "?";
      lastIndex.set(id, i);
    });
    return [...lastIndex.values()].sort((a, b) => a - b).map((i) => todos[i]);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Per-session registry
// ────────────────────────────────────────────────────────────────────────────

const stores = new Map<string, TodoStore>();

/** Get (or lazily create) the TodoStore for the active session. */
export function getTodoStore(): TodoStore {
  const sessionId = getSessionId();
  let store = stores.get(sessionId);
  if (!store) {
    store = new TodoStore();
    stores.set(sessionId, store);
  }
  return store;
}

/** Wipe the active session's plan — call at the start of a fresh conversation. */
export function resetTodoStore(): void {
  stores.get(getSessionId())?.clear();
}

/** Drop a session's store entirely — call on connection close to avoid leaks. */
export function clearTodosForSession(sessionId: string): void {
  stores.delete(sessionId);
}
