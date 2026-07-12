/**
 * Daemon task runtime: the provider-agnostic core that turns inbound messages
 * into coding-agent runs and streams the protocol responses back.
 *
 * It is decoupled from the transport (it takes a lock-serialized `send`) and the
 * executor (an injectable `runTask`), so the task protocol can be tested against
 * fakes. The CLI (`daemon.ts`) wires the real Agent send + `runProviderTask`.
 *
 * Task lifecycle (`medulla-tinyplace/1`):
 *   task  → ack → status* → reply | error   (echoing taskId + correlationId +
 *                                             harness on every response)
 *   input → forwarded into the running session (best-effort) + ack
 * Plain-text DMs run through the default provider and get a plain-text reply.
 */
import {
  encodeTaskFrame,
  type TaskFrame,
  type TaskFrameKind,
} from "./protocol.js";
import {
  runProviderTask,
  type RunTaskOptions,
  type RunTaskResult,
} from "./providers.js";
import type { HarnessSemanticEvent } from "../harness-events.js";
import type { HarnessProvider } from "../../types/harness.js";

export type RunTaskFn = (options: RunTaskOptions) => Promise<RunTaskResult>;

export interface DaemonRuntimeDeps {
  /** Providers the daemon will run tasks with (detected + allow-listed). */
  providers: ReadonlyArray<HarnessProvider>;
  /** Provider used for plain-text DMs and tasks that name none. */
  defaultProvider: HarnessProvider;
  workspace: string;
  env: Record<string, string | undefined>;
  taskTimeoutMs: number;
  concurrency: number;
  /** Minimum gap between status frames per task (default 4s). */
  statusThrottleMs?: number;
  model?: string;
  agent?: string;
  extraArgs?: ReadonlyArray<string>;
  /** Lock-serialized encrypted send (the daemon never sends concurrently). */
  send: (to: string, body: string) => Promise<void>;
  /** Injectable executor (tests). Defaults to the real headless runner. */
  runTask?: RunTaskFn;
  now?: () => number;
  log?: (line: string) => void;
}

interface RunningTask {
  provider: HarnessProvider;
  correlationId?: string;
  controller: AbortController;
  stdin?: (text: string) => void;
  /** Inputs that arrived before the session's stdin sink was ready. */
  pendingInput: Array<string>;
}

export class DaemonRuntime {
  private readonly deps: DaemonRuntimeDeps;
  private readonly runTask: RunTaskFn;
  private readonly now: () => number;
  private readonly statusThrottleMs: number;
  private readonly running = new Map<string, RunningTask>();
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(deps: DaemonRuntimeDeps) {
    this.deps = deps;
    this.runTask = deps.runTask ?? runProviderTask;
    this.now = deps.now ?? Date.now;
    this.statusThrottleMs = deps.statusThrottleMs ?? 4_000;
  }

  /** Number of tasks currently executing. */
  activeCount(): number {
    return this.active;
  }

  /** MailboxHandler-shaped entry point. Never throws to the caller. */
  handleMessage(
    from: string,
    message: { text: string },
    frame: TaskFrame | undefined,
  ): void {
    if (frame) {
      void this.handleFrame(from, frame);
    } else {
      void this.handlePlainText(from, message.text);
    }
  }

  /** Abort every in-flight task (clean shutdown). */
  shutdown(): void {
    for (const task of this.running.values()) {
      task.controller.abort();
    }
  }

  private async handleFrame(from: string, frame: TaskFrame): Promise<void> {
    if (frame.kind === "task") {
      await this.handleTask(from, frame);
      return;
    }
    if (frame.kind === "input") {
      this.handleInput(from, frame);
      return;
    }
    // status/reply/error/ack are responses we (or another daemon) emit; ignore.
  }

  private handleInput(from: string, frame: TaskFrame): void {
    const task = this.running.get(frame.taskId);
    if (task) {
      if (task.stdin) {
        task.stdin(frame.text);
      } else {
        // The session's stdin sink is not registered yet — buffer and flush it
        // when the run starts, so an input racing the ack is never dropped.
        task.pendingInput.push(frame.text);
      }
    }
    void this.reply(from, "ack", frame.taskId, "input received", {
      ...(frame.correlationId ? { correlationId: frame.correlationId } : {}),
      harness: task?.provider ?? this.deps.defaultProvider,
    });
  }

  private async handleTask(from: string, frame: TaskFrame): Promise<void> {
    const provider = this.selectProvider(frame.provider);
    const correlationId = frame.correlationId;
    if (!provider) {
      await this.reply(
        from,
        "error",
        frame.taskId,
        `no available provider${
          frame.provider ? ` for requested "${frame.provider}"` : ""
        }; daemon offers: ${this.deps.providers.join(", ") || "(none)"}`,
        { ...(correlationId ? { correlationId } : {}) },
      );
      return;
    }

    // Register the task BEFORE acking so an `input` frame arriving right after
    // the ack always finds the record (its stdin buffers until the run starts).
    const controller = new AbortController();
    const record: RunningTask = {
      provider,
      controller,
      pendingInput: [],
      ...(correlationId ? { correlationId } : {}),
    };
    this.running.set(frame.taskId, record);

    await this.reply(from, "ack", frame.taskId, "task accepted", {
      ...(correlationId ? { correlationId } : {}),
      harness: provider,
    });

    await this.withSlot(async () => {
      let lastStatusAt = 0;
      this.log(`task ${frame.taskId} → ${provider}`);
      try {
        const result = await this.runTask({
          provider,
          prompt: frame.text,
          cwd: this.deps.workspace,
          env: this.deps.env,
          timeoutMs: this.deps.taskTimeoutMs,
          ...(this.deps.model ? { model: this.deps.model } : {}),
          ...(this.deps.agent ? { agent: this.deps.agent } : {}),
          ...(this.deps.extraArgs ? { extraArgs: this.deps.extraArgs } : {}),
          signal: controller.signal,
          onStdin: (write) => {
            record.stdin = write;
            for (const buffered of record.pendingInput.splice(0)) {
              write(buffered);
            }
          },
          onEvent: (event) => {
            const detail = statusDetail(event);
            if (!detail) return;
            const now = this.now();
            if (now - lastStatusAt < this.statusThrottleMs) return;
            lastStatusAt = now;
            void this.reply(from, "status", frame.taskId, detail, {
              ...(correlationId ? { correlationId } : {}),
              harness: provider,
            });
          },
        });
        await this.reply(from, "reply", frame.taskId, result.reply, {
          ...(correlationId ? { correlationId } : {}),
          harness: provider,
        });
        this.log(`task ${frame.taskId} ✓ (${result.events} events)`);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await this.reply(from, "error", frame.taskId, messageText, {
          ...(correlationId ? { correlationId } : {}),
          harness: provider,
        });
        this.log(`task ${frame.taskId} ✗ ${messageText}`);
      } finally {
        this.running.delete(frame.taskId);
      }
    });
  }

  private async handlePlainText(from: string, text: string): Promise<void> {
    const provider = this.deps.defaultProvider;
    if (!this.deps.providers.includes(provider)) {
      await this.sendRaw(from, "No coding agent is available on this daemon.");
      return;
    }
    await this.withSlot(async () => {
      const controller = new AbortController();
      this.log(`plaintext DM → ${provider}`);
      try {
        const result = await this.runTask({
          provider,
          prompt: text,
          cwd: this.deps.workspace,
          env: this.deps.env,
          timeoutMs: this.deps.taskTimeoutMs,
          ...(this.deps.model ? { model: this.deps.model } : {}),
          ...(this.deps.agent ? { agent: this.deps.agent } : {}),
          ...(this.deps.extraArgs ? { extraArgs: this.deps.extraArgs } : {}),
          signal: controller.signal,
        });
        await this.sendRaw(from, result.reply);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await this.sendRaw(from, `Task failed: ${messageText}`);
      }
    });
  }

  private selectProvider(
    requested: HarnessProvider | undefined,
  ): HarnessProvider | undefined {
    if (requested) {
      return this.deps.providers.includes(requested) ? requested : undefined;
    }
    return this.deps.providers.includes(this.deps.defaultProvider)
      ? this.deps.defaultProvider
      : this.deps.providers[0];
  }

  private async withSlot(fn: () => Promise<void>): Promise<void> {
    if (this.active >= this.deps.concurrency) {
      await new Promise<void>((resolveSlot) => this.queue.push(resolveSlot));
    }
    this.active += 1;
    try {
      await fn();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }

  private async reply(
    to: string,
    kind: TaskFrameKind,
    taskId: string,
    text: string,
    extra: { correlationId?: string; harness?: HarnessProvider } = {},
  ): Promise<void> {
    const body = encodeTaskFrame({
      kind,
      taskId,
      text,
      ...(extra.correlationId ? { correlationId: extra.correlationId } : {}),
      ...(extra.harness ? { harness: extra.harness } : {}),
    });
    await this.sendRaw(to, body);
  }

  private async sendRaw(to: string, body: string): Promise<void> {
    try {
      await this.deps.send(to, body);
    } catch (error) {
      this.log(
        `send to ${to} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private log(line: string): void {
    this.deps.log?.(line);
  }
}

/** Derive a short status string from a semantic event (or none). */
export function statusDetail(event: HarnessSemanticEvent): string | undefined {
  const inner = event.event;
  switch (inner.kind) {
    case "tool_call":
      return `running ${inner.payload.tool_name}: ${inner.payload.display}`.slice(
        0,
        200,
      );
    case "tool_result":
      return inner.payload.is_error ? "tool failed" : "tool completed";
    case "agent_thinking":
      return "thinking";
    case "agent_message":
      return "writing response";
    case "status":
      return inner.payload.detail || inner.payload.state;
    case "error":
      return `error: ${inner.payload.message}`.slice(0, 200);
    default:
      return undefined;
  }
}
