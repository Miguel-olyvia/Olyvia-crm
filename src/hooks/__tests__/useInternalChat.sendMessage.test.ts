/**
 * Regression tests for the internal chat send path.
 *
 * Reported symptoms: "só consegues receber algo se fizeres refresh" and
 * "só aparece o que recebes e não aparece o que envias".
 *
 * sendMessage used to insert the row and then rely entirely on the realtime
 * INSERT echo to put it on screen. Whenever the conversation channel was not
 * delivering, the sender's own message never appeared at all — the message was
 * in the database, just invisible until a page reload.
 *
 * These tests lock down:
 *
 *  1. sendMessage puts the sent message into state without any realtime event.
 *  2. The realtime echo for that same row does not duplicate it.
 *  3. A realtime message from someone else is still appended.
 *  4. A failed insert is surfaced (thrown), never swallowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const ANEW_USER = "user-me";
const CONVERSATION = "conv-1";

/** Result the mocked internal_chat_messages insert resolves to. */
let insertResult: { data: unknown; error: unknown } = { data: null, error: null };

/** Realtime callback registered by the per-conversation channel. */
let conversationHandler: ((payload: unknown) => void) | null = null;

vi.mock("@/contexts/CompanyContext", () => {
  const activeCompany = { id: "org-1" };
  return { useCompany: () => ({ activeCompany }) };
});

vi.mock("@/integrations/supabase/client", () => {
  type Op = "select" | "insert" | "update";
  type Call = { table: string; op: Op; single: boolean };

  function resultFor(call: Call): { data: unknown; error: unknown } {
    if (call.table === "anew_users" && call.single) {
      return { data: { id: "user-me" }, error: null };
    }
    if (call.table === "internal_chat_messages" && call.op === "insert") {
      return insertResult;
    }
    // Everything else: an empty, successful response. The hook's bootstrap
    // (colleagues, conversations, message history) is not under test here.
    return { data: [], error: null };
  }

  function buildChain(table: string) {
    const call: Call = { table, op: "select", single: false };
    const chain: any = {
      select: () => chain,
      insert: () => {
        call.op = "insert";
        return chain;
      },
      update: () => {
        call.op = "update";
        return chain;
      },
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      or: () => chain,
      order: () => chain,
      single: () => {
        call.single = true;
        return Promise.resolve(resultFor(call));
      },
      maybeSingle: () => {
        call.single = true;
        return Promise.resolve(resultFor(call));
      },
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(resultFor(call)).then(onFulfilled, onRejected),
      catch: () => chain,
    };
    return chain;
  }

  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: { user: { id: "auth-me" } } } }),
      },
      from: (table: string) => buildChain(table),
      channel: () => {
        const channel: any = {
          on: (_event: string, config: any, cb: any) => {
            // Only the per-conversation channel carries a row filter; the
            // global unread channel listens to every insert.
            if (config?.filter) conversationHandler = cb;
            return channel;
          },
          subscribe: () => channel,
        };
        return channel;
      },
      removeChannel: () => {},
    },
  };
});

import { useInternalChat } from "@/hooks/useInternalChat";

const SENT_ROW = {
  id: "msg-sent-1",
  sender_id: ANEW_USER,
  content: "ola",
  created_at: "2026-08-17T10:00:00.000Z",
  is_read: false,
};

async function mountWithOpenConversation() {
  const { result } = renderHook(() => useInternalChat());
  await waitFor(() => expect(result.current.anewUserId).toBe(ANEW_USER));
  await act(async () => {
    result.current.setActiveConversation(CONVERSATION);
  });
  await waitFor(() => expect(result.current.loadingMessages).toBe(false));
  return result;
}

beforeEach(() => {
  insertResult = { data: SENT_ROW, error: null };
  conversationHandler = null;
});

describe("useInternalChat — sending a message", () => {
  it("shows the sent message without waiting for a realtime echo", async () => {
    const result = await mountWithOpenConversation();

    await act(async () => {
      await result.current.sendMessage("ola");
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      id: SENT_ROW.id,
      sender_id: ANEW_USER,
      content: "ola",
    });
  });

  it("does not duplicate the message when the realtime echo arrives", async () => {
    const result = await mountWithOpenConversation();

    await act(async () => {
      await result.current.sendMessage("ola");
    });
    expect(result.current.messages).toHaveLength(1);

    // The server echoes the very row we just inserted.
    await act(async () => {
      conversationHandler?.({ new: SENT_ROW });
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it("still appends a message that arrives from the other participant", async () => {
    const result = await mountWithOpenConversation();

    await act(async () => {
      conversationHandler?.({
        new: {
          id: "msg-received-1",
          sender_id: "user-them",
          content: "boas",
          created_at: "2026-08-17T10:01:00.000Z",
          is_read: false,
        },
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].sender_id).toBe("user-them");
  });

  it("surfaces a failed insert instead of swallowing it", async () => {
    insertResult = { data: null, error: { message: "row-level security" } };
    const result = await mountWithOpenConversation();

    await expect(
      act(async () => {
        await result.current.sendMessage("ola");
      })
    ).rejects.toBeDefined();

    expect(result.current.messages).toHaveLength(0);
  });
});
