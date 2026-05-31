import { describe, expect, it } from "vitest";
import { TodoStore } from "./todo";

describe("TodoStore — write modes", () => {
  it("replaces the whole list by default", () => {
    const store = new TodoStore();
    store.write([{ id: "1", content: "first" }]);
    const items = store.write([{ id: "2", content: "second" }]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("2");
  });

  it("merges by id, updating existing and appending new", () => {
    const store = new TodoStore();
    store.write([
      { id: "1", content: "first", status: "pending" },
      { id: "2", content: "second", status: "pending" },
    ]);
    const items = store.write(
      [
        { id: "1", status: "completed" },
        { id: "3", content: "third" },
      ],
      true
    );
    expect(items).toHaveLength(3);
    expect(items.find((i) => i.id === "1")?.status).toBe("completed");
    expect(items.find((i) => i.id === "1")?.content).toBe("first"); // unchanged
    expect(items.find((i) => i.id === "3")?.content).toBe("third");
  });

  it("defaults invalid/missing status to pending", () => {
    const store = new TodoStore();
    const items = store.write([{ id: "1", content: "x", status: "bogus" }]);
    expect(items[0].status).toBe("pending");
  });

  it("dedupes by id keeping the last occurrence", () => {
    const store = new TodoStore();
    const items = store.write([
      { id: "1", content: "old" },
      { id: "1", content: "new" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].content).toBe("new");
  });
});

describe("TodoStore — summary + injection", () => {
  it("reports accurate counts", () => {
    const store = new TodoStore();
    store.write([
      { id: "1", content: "a", status: "completed" },
      { id: "2", content: "b", status: "in_progress" },
      { id: "3", content: "c", status: "pending" },
      { id: "4", content: "d", status: "cancelled" },
    ]);
    const s = store.summary();
    expect(s).toMatchObject({ total: 4, pending: 1, in_progress: 1, completed: 1, cancelled: 1 });
  });

  it("injection block contains only active (pending/in_progress) items", () => {
    const store = new TodoStore();
    store.write([
      { id: "1", content: "done thing", status: "completed" },
      { id: "2", content: "doing thing", status: "in_progress" },
      { id: "3", content: "todo thing", status: "pending" },
      { id: "4", content: "killed thing", status: "cancelled" },
    ]);
    const block = store.formatForInjection();
    expect(block).toBeTruthy();
    expect(block).toContain("doing thing");
    expect(block).toContain("todo thing");
    expect(block).not.toContain("done thing");
    expect(block).not.toContain("killed thing");
  });

  it("returns null injection when nothing is active", () => {
    const store = new TodoStore();
    store.write([{ id: "1", content: "a", status: "completed" }]);
    expect(store.formatForInjection()).toBeNull();
  });

  it("clear() empties the list", () => {
    const store = new TodoStore();
    store.write([{ id: "1", content: "a" }]);
    expect(store.hasItems()).toBe(true);
    store.clear();
    expect(store.hasItems()).toBe(false);
  });
});
