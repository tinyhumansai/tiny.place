/**
 * Serialized inbox plumbing for the daemon.
 *
 * The Signal `FileSessionStore` is a read-modify-write of one JSON file plus a
 * double ratchet, so every operation on a single agent — sends, destructive
 * inbox reads, contact accepts — must go through one {@link Lock}; overlapping
 * calls corrupt session state and silently drop messages. Reads are destructive
 * (the ratchet advances per message), so exactly one {@link Mailbox} owns an
 * agent and fans each decoded message out to registered handlers.
 *
 * Adapted from medulla's `tui/tinyplace.ts` mailbox/lock/contact machinery.
 */
import type { Agent } from "../../agent/agent.js";
import type { ReadMessage } from "../../agent/messaging.js";
import { decodeTaskFrame, type TaskFrame } from "./protocol.js";

/** Serializes async work into one chain (one per agent). */
export type Lock = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLock(): Lock {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export interface ContactAutoAccepter {
  start(): void;
  stop(): void;
}

/**
 * Poll for incoming contact requests and accept them. Staging gates DMs behind
 * an ACCEPTED contact relationship, so a daemon must auto-accept for any agent
 * to open a channel to it. Never pre-emptively DMs a non-contact (which would
 * poison the ratchet); it only accepts inbound requests.
 */
export function createContactAutoAccepter(
  agent: Agent,
  options: {
    intervalMs?: number;
    lock: Lock;
    onAccept?: (agentId: string) => void;
    onError?: (error: unknown) => void;
  },
): ContactAutoAccepter {
  const intervalMs = options.intervalMs ?? 2_000;
  let running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function tick(): Promise<void> {
    try {
      const { incoming } = await options.lock(() =>
        agent.client.contacts.requests(),
      );
      for (const contact of incoming) {
        try {
          await options.lock(() =>
            agent.client.contacts.accept(contact.agentId),
          );
          options.onAccept?.(contact.agentId);
        } catch (error) {
          options.onError?.(error);
        }
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      if (running) {
        timer = setTimeout(() => void tick(), intervalMs);
      }
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setTimeout(() => void tick(), 0);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** A decoded inbound message: a structured protocol `frame` when the body is
 *  `medulla-tinyplace/1`, otherwise plain-text `message.text`. */
export type MailboxHandler = (
  from: string,
  message: ReadMessage,
  frame: TaskFrame | undefined,
) => void;

export interface Mailbox {
  onMessage(handler: MailboxHandler): () => void;
  /** Run one poll pass (used by `--once`); resolves when the pass completes. */
  tickOnce(): Promise<void>;
  start(): void;
  stop(): void;
}

export interface MailboxOptions {
  lock: Lock;
  intervalMs?: number;
  limit?: number;
  onError?: (error: unknown) => void;
}

export function createMailbox(agent: Agent, options: MailboxOptions): Mailbox {
  const handlers = new Set<MailboxHandler>();
  const intervalMs = options.intervalMs ?? 2_000;
  const limit = options.limit ?? 50;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function poll(): Promise<void> {
    const messages = await options.lock(() => agent.readMessages({ limit }));
    for (const message of messages) {
      const frame = decodeTaskFrame(message.text);
      for (const handler of handlers) {
        // Reads are destructive, so a throwing handler must not abort dispatch
        // of the rest of the batch — those messages would be lost forever.
        try {
          handler(message.from, message, frame);
        } catch (error) {
          options.onError?.(error);
        }
      }
    }
  }

  async function tick(): Promise<void> {
    try {
      await poll();
    } catch (error) {
      options.onError?.(error);
    } finally {
      if (running) {
        timer = setTimeout(() => void tick(), intervalMs);
      }
    }
  }

  return {
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async tickOnce() {
      // Same reporting as the loop, but rethrow so a one-shot caller fails loud.
      try {
        await poll();
      } catch (error) {
        options.onError?.(error);
        throw error;
      }
    },
    start() {
      if (running) return;
      running = true;
      timer = setTimeout(() => void tick(), 0);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
