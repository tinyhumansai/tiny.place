import blessed, { type Widgets } from "blessed";
import { spawn as spawnChild, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, relative, resolve, join, sep } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { IPty } from "node-pty";

import { bridgeLog, createBridgeDiagSink } from "./bridge-debug.js";
import { configPathFor, saveOpenHumanOwner } from "./context.js";
import { listRecentSessions, type RecentSession } from "./session-history.js";
import {
  acquireSessionLock,
  releaseSessionLock,
  type AcquiredSessionLock,
} from "./session-lock.js";
import {
  HarnessSessionTailer,
  InboundMessageReceiver,
  SessionEnvelopePublisher,
  parseHarnessWrapperArgs,
} from "./harness-wrapper.js";
import { createMachineBus, type MachineBus } from "./machine-bus.js";
import {
  OpenCodeEventSource,
  startOpenCodeServer,
  type OpenCodeServerHandle,
} from "./opencode-source.js";
import type {
  CliContext,
  TinyPlaceCliOptions,
  TinyPlaceCliResult,
} from "./types.js";

export type TinyVerseAgentKind = "claude" | "codex" | "opencode";

type TuiView = "welcome" | "settings" | "agent";

interface TuiState {
  activeSessionId?: string;
  autoStartAvailable: boolean;
  autoStartRemainingMs?: number;
  notice?: string;
  openHumanConnected: boolean;
  // True once the real bridge (tailer/receiver) is running — as opposed to an
  // owner that is merely remembered/adopted but not yet bridged (pre-launch).
  bridgeLive?: boolean;
  // Owner entered in the TUI (overrides env); the address/@handle we bridge to.
  openHumanOwner?: string;
  openHumanSessionId?: string;
  selectedIndex: number;
  view: TuiView;
  // Home mode only: which pane holds the cursor (left actions vs the recent-
  // session resume list), and the highlighted row in the sessions pane.
  homeFocus?: "actions" | "sessions";
  sessionIndex?: number;
}

interface AgentLaunch {
  args: Array<string>;
  command: string;
  label: string;
}

interface AgentProfile {
  disabledPtyEnv: string;
  displayName: string;
  kind: TinyVerseAgentKind;
  launch: AgentLaunch;
  pendingSessionId: string;
  sessionPollEnv: string;
  sessionsDir: string;
  // Set when this profile resumes a specific session (home resume pane): drives
  // the `--resume`/`resume` launch arg and a stable per-session OpenHuman scope.
  resumeSessionId?: string;
  // opencode: this harness is observed over a local server's SSE bus rather than
  // per-session files, so the TUI boots `opencode serve` before launch and
  // bridges via `OpenCodeEventSource` instead of the file tailer.
  serverMode?: boolean;
}

interface AgentSessionMeta {
  cwd?: string;
  path: string;
  sessionId: string;
}

/**
 * A selectable welcome-menu row. The list is computed per-render so one screen
 * serves two entry shapes:
 *  - fixed-agent (`tinyplace codex` / `claude` / `tui <kind>`): one launch row.
 *  - home (`tinyplace` with no agent): a launch row PER agent, so a developer
 *    navigates to a session instead of memorizing subcommands.
 */
type TuiAction =
  | "launch"
  | "launch-codex"
  | "launch-claude"
  | "launch-opencode"
  | "connect"
  | "settings"
  | "quit";

const FIXED_ACTIONS: ReadonlyArray<TuiAction> = [
  "launch",
  "connect",
  "settings",
  "quit",
];
const HOME_ACTIONS: ReadonlyArray<TuiAction> = [
  "launch-codex",
  "launch-claude",
  "launch-opencode",
  "connect",
  "settings",
  "quit",
];
const requireForTui = createRequire(import.meta.url);

export async function runTinyPlaceTui(
  ctx: CliContext,
  options: TinyPlaceCliOptions,
  // `undefined` = HOME mode: no agent pre-chosen, so the welcome menu offers a
  // launch row per agent. A concrete kind = fixed-agent mode (today's flow).
  agentKind?: TinyVerseAgentKind,
): Promise<TinyPlaceCliResult> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const homeMode = agentKind === undefined;
  // Home mode still needs a concrete profile for the shared render/agent code;
  // it defaults to codex and is swapped to the picked agent on launch.
  const profile = buildAgentProfile(ctx.env, agentKind ?? "codex");

  if (!isTty(stdin) || !isTty(stdout)) {
    return {
      code: 0,
      stderr: "",
      stdout: homeMode
        ? renderHomeSnapshot(ctx, options.cwd ?? process.cwd())
        : renderStaticSnapshot(ctx, profile),
    };
  }

  await runInteractiveBlessedTui(ctx, options, profile, homeMode);
  return { code: 0, stderr: "", stdout: "" };
}

export function parseTinyVerseAgentKind(
  value: string | undefined,
): TinyVerseAgentKind {
  if (value === undefined || value === "" || value === "codex") {
    return "codex";
  }
  if (value === "claude") {
    return "claude";
  }
  if (value === "opencode") {
    return "opencode";
  }
  throw new Error(
    `unknown tinyverse agent "${value}" (expected codex, claude, or opencode)`,
  );
}

function runInteractiveBlessedTui(
  ctx: CliContext,
  options: TinyPlaceCliOptions,
  profile: AgentProfile,
  homeMode: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const app = new BlessedTinyPlaceTui(
      ctx,
      options,
      profile,
      resolve,
      homeMode,
    );
    app.start();
  });
}

class BlessedTinyPlaceTui {
  private body!: Widgets.BoxElement;
  private agentSessionMonitor?: AgentSessionMonitor;
  private autoStartInterval: ReturnType<typeof setInterval> | undefined;
  private autoStartTimer: ReturnType<typeof setTimeout> | undefined;
  private autoStartUsed = false;
  private child?: ChildProcessWithoutNullStreams;
  private closed = false;
  private footer!: Widgets.BoxElement;
  private nativeHadRawMode: boolean | undefined;
  private nativeInputHandler?: (chunk: Buffer | string) => void;
  private nativeResizeHandler?: () => void;
  private nativeRelayActive = false;
  private pty?: IPty;
  private renderQueued = false;
  private screen!: Widgets.Screen;
  private state: TuiState = {
    activeSessionId: "none",
    autoStartAvailable: true,
    openHumanConnected: false,
    selectedIndex: 0,
    view: "welcome",
  };
  private terminal?: Widgets.TerminalElement;
  private tmuxSession?: string;
  private tmuxSocket?: string;
  // Real OpenHuman bridge (replaces the mock): publisher + outbound tailer +
  // inbound receiver, reused from the harness wrapper.
  private bridgeTailer?: HarnessSessionTailer;
  // opencode's non-file session observer (SSE bus) + the `opencode serve` we
  // launch and attach to; both replace the file tailer for serverMode profiles.
  private bridgeSource?: OpenCodeEventSource;
  private opencodeServer?: OpenCodeServerHandle;
  private bridgeReceiver?: InboundMessageReceiver;
  private bridgeBus?: MachineBus;
  private bridgeBusHeartbeat?: ReturnType<typeof setInterval>;
  // Home-screen resume pane: the recent sessions across both agents, loaded once
  // at start. Empty in fixed-agent mode.
  private recentSessions: Array<RecentSession> = [];
  // Per-launch working directory. A resumed session launches in its own original
  // cwd (so its OpenHuman folder-thread and session-file lookup line up); a fresh
  // launch leaves this undefined and falls back to the process cwd.
  private launchCwd?: string;
  // Resume only: the session's JSONL path, handed to the tailer so it keeps
  // streaming a resumed file that already existed at bridge start.
  private launchSessionFile?: string;
  // Resume only: the per-session exclusive lock held while this instance bridges
  // it, so a second tinyplace can't resume the same session concurrently (which
  // would double-stream into one OpenHuman thread + fight over the JSONL).
  private sessionLock?: AcquiredSessionLock;
  // Loop guard: count consecutive auto-submitted inbound turns with no human
  // keystroke in between. OpenHuman's master auto-replies, so unbounded
  // auto-submit ping-pongs forever; after MAX_AUTO_INJECTS we stop submitting
  // (text still parks) until a human types, which resets the counter.
  private consecutiveAutoInjects = 0;
  private static readonly MAX_AUTO_INJECTS = 6;
  // Serial queue for inbound injection so a batch of DMs typed in one receiver
  // poll keeps its turn boundaries (each body+Enter finishes before the next).
  private injectionQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly ctx: CliContext,
    private readonly options: TinyPlaceCliOptions,
    // Mutable: home mode swaps this to the picked agent before launch.
    private profile: AgentProfile,
    private readonly resolve: () => void,
    private readonly homeMode: boolean = false,
  ) {
    this.createBlessedLayout();
  }

  /** Welcome-menu rows for the current entry shape (home = per-agent pickers). */
  private actions(): ReadonlyArray<TuiAction> {
    return this.homeMode ? HOME_ACTIONS : FIXED_ACTIONS;
  }

  /** The action the cursor is on right now. */
  private selectedAction(): TuiAction {
    return this.actions()[this.state.selectedIndex] ?? "quit";
  }

  /** Home mode: bind the chosen agent, then resolve the owner for THAT agent
   *  (provider-specific recipients only take effect once the agent is known). An
   *  optional `resumeSessionId` binds a resume launch (home resume pane). */
  private setProfile(kind: TinyVerseAgentKind, resumeSessionId?: string): void {
    this.profile = buildAgentProfile(this.ctx.env, kind, resumeSessionId);
    this.adoptRememberedOwner();
  }

  /** Working directory for the current launch: a resumed session runs where it
   *  originally ran; everything else follows the process/option cwd. */
  private effectiveCwd(): string {
    return this.launchCwd ?? this.options.cwd ?? process.cwd();
  }

  private createBlessedLayout(): void {
    this.screen = blessed.screen({
      fullUnicode: true,
      input: (this.options.stdin ?? process.stdin) as never,
      output: (this.options.stdout ?? process.stdout) as never,
      smartCSR: true,
      title: "tiny.place",
      warnings: false,
    });
    this.body = blessed.box({
      bottom: 1,
      height: "100%-1",
      left: 0,
      parent: this.screen,
      style: {
        bg: "black",
        fg: "white",
      },
      tags: true,
      top: 0,
      width: "100%",
    });
    this.footer = blessed.box({
      bottom: 0,
      height: 1,
      left: 0,
      parent: this.screen,
      style: {
        bg: "black",
        fg: "gray",
      },
      tags: true,
      width: "100%",
    });
    this.screen.on("resize", () => {
      this.resizeAgentPty();
      this.queueScreenRender();
    });
  }

  private destroyBlessedLayout(): void {
    this.terminal = undefined;
    this.body.destroy();
    this.footer.destroy();
    this.screen.destroy();
  }

  public start(): void {
    this.registerKeys();
    // Fixed-agent mode: auto-adopt a remembered owner so the footer shows
    // "connected" and the bridge wires on launch — no manual Connect on repeat
    // launches. HOME mode defers this until an agent is picked (setProfile),
    // because the recipient can be provider-specific and the agent isn't chosen
    // yet — adopting a Codex recipient before the user picks Claude would bridge
    // to the wrong owner.
    if (!this.homeMode) {
      this.adoptRememberedOwner();
    } else {
      this.recentSessions = safeListRecentSessions(
        this.ctx.env,
        this.effectiveCwd(),
      );
      this.state = { ...this.state, homeFocus: "actions", sessionIndex: 0 };
    }
    this.render();
    this.scheduleAutoStart();
  }

  /** Adopt a remembered OpenHuman owner (persisted config or env) into state so
   *  the footer reflects it and the bridge wires to it on launch. Resolved
   *  against the *current* profile, so it must run after any home-mode pick. */
  private adoptRememberedOwner(): void {
    const owner = this.resolveOwner();
    if (owner) {
      this.state = {
        ...this.state,
        openHumanConnected: true,
        openHumanOwner: owner,
        openHumanSessionId: owner,
      };
    }
  }

  private registerKeys(): void {
    this.screen.key(["C-c"], () => {
      if (this.state.view === "agent") {
        return;
      }
      this.close();
    });
    this.screen.key(["escape", "q"], () => {
      if (this.state.view === "agent") {
        return;
      }
      if (this.state.view === "settings") {
        this.state = {
          ...this.state,
          autoStartRemainingMs: undefined,
          notice: "Returned to welcome.",
          view: "welcome",
        };
        this.scheduleAutoStart();
        this.render();
        return;
      }
      this.close();
    });
    this.screen.key(["up", "k"], () => {
      this.moveSelection(-1);
    });
    this.screen.key(["down", "j"], () => {
      this.moveSelection(1);
    });
    // Home mode has two panes (actions + recent sessions); Tab and ←/→ move the
    // cursor between them. No-op in fixed-agent mode / non-welcome views.
    this.screen.key(["tab", "S-tab"], () => {
      this.toggleHomeFocus();
    });
    this.screen.key(["right", "l"], () => {
      this.toggleHomeFocus("sessions");
    });
    this.screen.key(["left", "h"], () => {
      this.toggleHomeFocus("actions");
    });
    this.screen.key(["c", "n"], () => {
      // Home mode has no single default agent — force the picker (arrows/Enter)
      // so `c`/`n`/`x` can't silently launch Codex when the user wanted Claude.
      if (this.homeMode || this.state.view === "agent") {
        return;
      }
      void this.startAgent();
    });
    this.screen.key(["s"], () => {
      if (this.state.view !== "welcome") {
        return;
      }
      this.openSettings();
    });
    this.screen.key(["o"], () => {
      if (this.state.view !== "welcome") {
        return;
      }
      this.connectOpenHuman();
    });
    this.screen.key(["x"], () => {
      if (this.homeMode || this.state.view !== "welcome") {
        return;
      }
      void this.startAgent();
    });
    this.screen.key(["enter"], () => {
      this.activateSelection();
    });
  }

  private moveSelection(delta: number): void {
    if (this.state.view !== "welcome") {
      return;
    }
    this.clearAutoStart();
    if (this.homeMode && this.state.homeFocus === "sessions") {
      if (this.recentSessions.length === 0) {
        return;
      }
      this.state = {
        ...this.state,
        notice: undefined,
        sessionIndex: clamp(
          (this.state.sessionIndex ?? 0) + delta,
          0,
          this.recentSessions.length - 1,
        ),
      };
      this.render();
      return;
    }
    this.state = {
      ...this.state,
      notice: undefined,
      selectedIndex: clamp(
        this.state.selectedIndex + delta,
        0,
        this.actions().length - 1,
      ),
    };
    this.render();
  }

  /** Move the home cursor between the actions pane and the resume pane. No-op
   *  outside home/welcome, or into an empty sessions pane. */
  private toggleHomeFocus(target?: "actions" | "sessions"): void {
    if (!this.homeMode || this.state.view !== "welcome") {
      return;
    }
    const next =
      target ??
      ((this.state.homeFocus ?? "actions") === "actions"
        ? "sessions"
        : "actions");
    if (next === "sessions" && this.recentSessions.length === 0) {
      return;
    }
    if (next === (this.state.homeFocus ?? "actions")) {
      return;
    }
    this.clearAutoStart();
    this.state = { ...this.state, homeFocus: next, notice: undefined };
    this.render();
  }

  private activateSelection(): void {
    if (this.state.view === "agent") {
      return;
    }
    if (this.state.view === "settings") {
      this.state = {
        ...this.state,
        autoStartRemainingMs: undefined,
        notice: "Returned to welcome.",
        view: "welcome",
      };
      this.scheduleAutoStart();
      this.render();
      return;
    }
    if (this.homeMode && this.state.homeFocus === "sessions") {
      this.resumeSelectedSession();
      return;
    }
    switch (this.selectedAction()) {
      case "launch":
        void this.startAgent();
        return;
      case "launch-codex":
        this.setProfile("codex");
        void this.startAgent();
        return;
      case "launch-claude":
        this.setProfile("claude");
        void this.startAgent();
        return;
      case "launch-opencode":
        this.setProfile("opencode");
        void this.startAgent();
        return;
      case "connect":
        this.connectOpenHuman();
        return;
      case "settings":
        this.openSettings();
        return;
      case "quit":
        this.close();
        return;
    }
  }

  private openSettings(): void {
    this.clearAutoStart();
    this.state = {
      ...this.state,
      notice: undefined,
      view: "settings",
    };
    this.render();
  }

  /** Resume the highlighted recent session: bind its agent + id (so the launch
   *  carries `--resume`/`resume` and a stable per-session OpenHuman scope), run
   *  it in its original folder, and hand off to the normal agent launch. */
  private resumeSelectedSession(): void {
    const session = this.recentSessions[this.state.sessionIndex ?? 0];
    if (!session) {
      return;
    }
    // Refuse a second concurrent resume of the same session (see session-lock).
    const lock = this.acquireSessionLockOrNotice(session);
    if (!lock) {
      return;
    }
    this.sessionLock = lock;
    this.setProfile(session.agent, session.id);
    this.launchCwd = session.cwd;
    this.launchSessionFile = session.path;
    this.state = {
      ...this.state,
      notice: `Resuming ${session.agent} session…`,
    };
    void this.startAgent();
  }

  /** Claim the per-session lock; on contention leave a notice and return
   *  undefined so the caller stays on the home screen. Never throws — a lock
   *  filesystem hiccup degrades to "allowed" rather than blocking a resume. */
  private acquireSessionLockOrNotice(
    session: RecentSession,
  ): AcquiredSessionLock | undefined {
    let lock: AcquiredSessionLock | undefined;
    try {
      lock = acquireSessionLock(
        join(dirname(configPathFor(this.ctx.env)), "locks"),
        session.agent,
        session.id,
      );
    } catch {
      // Can't touch the lock dir — don't wedge the user; allow the resume.
      return { path: "" };
    }
    if (!lock) {
      this.state = {
        ...this.state,
        notice: `This ${session.agent} session is already live in another tinyplace window.`,
      };
      this.render();
    }
    return lock;
  }

  /** Release the per-session resume lock, if held. */
  private releaseSessionLockIfHeld(): void {
    if (this.sessionLock) {
      if (this.sessionLock.path) {
        releaseSessionLock(this.sessionLock);
      }
      this.sessionLock = undefined;
    }
  }

  /**
   * The owner we bridge to. Priority: entered this session (overrides) → env
   * (explicit per-run override) → persisted config (remembered from a previous
   * "Connect with OpenHuman"). The persisted value makes the next launch
   * auto-connect without re-asking.
   */
  private resolveOwner(): string | undefined {
    return (
      this.state.openHumanOwner ??
      bridgeOwner(this.ctx.env, this.profile.kind) ??
      this.ctx.openHumanOwner
    );
  }

  /** Prompt for the OpenHuman owner (@handle or address), store it, and — if the
   *  agent is already running — (re)start the bridge with it. */
  private connectOpenHuman(): void {
    this.clearAutoStart();
    const current = this.resolveOwner() ?? "";
    // Wrap the prompt + a hint line in a centered container so the hint (and the
    // long "@handle or address / Enter / Esc" guidance) sits *outside* the input
    // box instead of stuffed into the border label, where it overflows and
    // corrupts the border on narrow terminals.
    const modal = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "80%",
      height: 5,
      style: { bg: "black" },
      tags: true,
    });
    const input = blessed.textbox({
      parent: modal,
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      border: { type: "line" },
      inputOnFocus: true,
      keys: true,
      // Deliberately NOT `mouse: true`: enabling mouse on any Blessed element
      // flips the terminal into SGR mouse-capture mode (program.enableMouse()),
      // which Blessed never turns back off when this modal closes. That kills
      // the terminal's native text selection / copy for the rest of the session.
      // The prompt is fully keyboard-driven (type · Enter · Esc), so mouse
      // capture buys nothing and costs the user their selection.
      label: " OpenHuman owner ",
      style: { fg: "white", bg: "black", border: { fg: "cyan" } },
      tags: true,
    });
    blessed.text({
      parent: modal,
      top: 3,
      left: 1,
      height: 1,
      width: "100%-2",
      content: "@handle or address · Enter to save · Esc to cancel",
      style: { fg: "gray", bg: "black" },
      tags: true,
    });
    input.setValue(current);
    input.focus();
    this.screen.render();

    let settled = false;
    const done = (value: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      modal.destroy();
      const inAgent = this.state.view === "agent";
      const owner = value?.trim();
      if (owner) {
        this.state = {
          ...this.state,
          notice: inAgent
            ? `OpenHuman owner set to ${owner}; reconnecting bridge.`
            : `OpenHuman owner set to ${owner}. Launch ${this.profile.displayName} to connect.`,
          openHumanConnected: true,
          openHumanOwner: owner,
          openHumanSessionId: owner,
        };
        // Remember it so the next launch auto-connects without re-asking.
        // Best-effort: a corrupt/unreadable config must not crash the TUI with an
        // unhandled rejection — swallow and keep the in-memory owner for this run.
        void saveOpenHumanOwner(this.ctx.env, owner).catch(() => {});
        // If a session is live, restart the bridge so the new owner takes effect.
        if (inAgent) {
          this.stopBridge();
          this.startBridge();
        }
      } else if (value !== undefined) {
        // Empty SUBMIT (not cancel): forget the remembered owner so it stops
        // auto-connecting. `undefined` here means Esc/cancel — leave it alone.
        void saveOpenHumanOwner(this.ctx.env, undefined).catch(() => {});
        // Also drop the in-context persisted value so resolveOwner() doesn't
        // resurrect it later this session (env overrides are intentionally kept).
        this.ctx.openHumanOwner = undefined;
        this.state = {
          ...this.state,
          notice: "OpenHuman owner cleared.",
          openHumanConnected: false,
          openHumanOwner: undefined,
          openHumanSessionId: undefined,
        };
        if (inAgent) {
          this.stopBridge();
        }
      } else {
        this.state = { ...this.state, notice: "OpenHuman owner unchanged." };
      }
      this.render();
    };
    // `inputOnFocus` makes the textbox call `readInput(null)` on focus, so a
    // second `readInput(callback)` here would be dropped (`_reading` already
    // set) and Enter would never resolve — the box would hang on screen. Wire
    // the outcome through the textbox's own submit/cancel events instead.
    input.on("submit", (value: unknown) =>
      done(typeof value === "string" ? value : input.getValue()),
    );
    input.on("cancel", () => done(undefined));
    input.key(["escape"], () => done(undefined));
  }

  /** Start the real bidirectional OpenHuman bridge alongside the agent: publish
   *  keys, stream the agent's turns out (tailer), and inject inbound DMs into the
   *  live agent (receiver → writeAgentInput). No-op without a configured owner. */
  private startBridge(): void {
    if (this.bridgeTailer || this.bridgeSource || this.bridgeReceiver) {
      return;
    }
    const owner = this.resolveOwner();
    if (!owner) {
      return;
    }
    const config = parseHarnessWrapperArgs(this.profile.kind, [], this.ctx.env);
    // A TUI-entered owner overrides env: bridge both directions to it.
    config.dmRecipient = owner;
    config.receiveFrom = owner;
    config.receiveEnabled = true;
    // Resume: pin the OpenHuman thread to THIS agent session (stable, derived
    // from its id) so re-resuming the same session continues the same thread
    // regardless of folder. Fresh launches keep the default folder scope.
    if (this.profile.resumeSessionId) {
      config.scope = "session";
      config.wrapperSessionId = `tp-${this.profile.kind}-resume-${this.profile.resumeSessionId}`;
      // Keep tailing the resumed file even though it predates the tailer.
      if (this.launchSessionFile) {
        config.resumeSessionFile = this.launchSessionFile;
      }
    }
    const cwd = this.effectiveCwd();
    bridgeLog("bridge.start", {
      owner,
      provider: config.provider,
      cwd,
      captureSession: config.captureSession,
      receiveEnabled: config.receiveEnabled,
      dmRecipient: config.dmRecipient,
      receiveFrom: config.receiveFrom,
      sessionsDir: this.profile.sessionsDir,
      dryRun: config.dryRun,
    });
    // Diagnostics from the bridge would corrupt the Blessed screen if written to
    // the real stderr, so they go to a discarding sink — but when
    // TINYPLACE_BRIDGE_LOG is set, `createBridgeDiagSink` tees them into the log
    // file instead so bridge failures are visible while debugging.
    const sink = createBridgeDiagSink();
    // Machine session bus: this TUI session shares the machine's ONE wallet
    // with every other wrapper session — the bus serializes Signal I/O across
    // processes, spools inbound DMs to their addressed session, and registers
    // this session (live/inactive) on the machine registry.
    this.bridgeBus = createMachineBus({
      env: this.ctx.env,
      wrapperSessionId: config.wrapperSessionId,
      provider: config.provider,
      cwd,
    });
    this.bridgeBus.registerSession();
    this.bridgeBusHeartbeat = setInterval(
      () => this.bridgeBus?.heartbeatSession(),
      10_000,
    );
    const publisher = new SessionEnvelopePublisher(
      config,
      this.options,
      sink,
      this.bridgeBus,
    );
    if (this.profile.serverMode && this.opencodeServer) {
      // opencode: observe the live session over the server's SSE bus.
      this.bridgeSource = new OpenCodeEventSource(config, cwd, sink, publisher);
      this.bridgeSource.start(`${this.opencodeServer.url}/event`);
    } else {
      this.bridgeTailer = config.captureSession
        ? new HarnessSessionTailer(config, cwd, sink, publisher)
        : undefined;
    }
    this.bridgeReceiver = config.receiveEnabled
      ? new InboundMessageReceiver(config, publisher, sink, this.bridgeBus)
      : undefined;
    this.bridgeReceiver?.setSink((text) => {
      bridgeLog("inbound.inject", { chars: text.length });
      // The receiver appends a CR to submit. Writing "text\r" straight to the
      // PTY makes claude's TUI treat the burst as a bracketed paste and swallow
      // the CR, so the prompt parks unsubmitted. In the native tmux relay,
      // inject the literal text and then a DISTINCT Enter keypress (separate
      // send-keys after a short debounce) so the turn actually submits.
      const body = text.endsWith("\r") ? text.slice(0, -1) : text;
      // The receiver can deliver several inbound messages in one poll, calling
      // this sink synchronously per message. Serialize them: each body+Enter
      // pair must complete before the next body types, or two messages land in
      // one prompt and the trailing Enter submits an empty turn (lost boundary).
      this.enqueueInjection(body, this.computeAutoSubmit());
    });
    this.bridgeTailer?.start(new Date());
    void this.bridgeReceiver?.start();
    this.state = {
      ...this.state,
      openHumanConnected: true,
      openHumanSessionId: owner,
      // The bridge is actually up now — distinct from a merely *remembered* owner.
      bridgeLive: true,
    };
    if (!this.nativeRelayActive) {
      this.renderFooter();
      this.queueScreenRender();
    }
  }

  private stopBridge(): void {
    void this.bridgeTailer?.stop();
    void this.bridgeSource?.stop();
    void this.bridgeReceiver?.stop();
    if (this.bridgeBusHeartbeat) {
      clearInterval(this.bridgeBusHeartbeat);
      this.bridgeBusHeartbeat = undefined;
    }
    this.bridgeBus?.endSession();
    this.bridgeBus = undefined;
    this.bridgeTailer = undefined;
    this.bridgeSource = undefined;
    this.bridgeReceiver = undefined;
    this.state = { ...this.state, bridgeLive: false };
  }

  /** Resolve whether this inbound turn should auto-submit, applying the env
   *  switch and the runaway loop guard, and advancing the guard counter. */
  private computeAutoSubmit(): boolean {
    // Auto-submit is ON by default so claude replies to an inbound OpenHuman
    // turn without a human keypress. Because OpenHuman's master also auto-
    // replies, the two can ping-pong; TINYPLACE_<KIND>_AUTOSUBMIT=0 falls back
    // to a human gate (text parks in the prompt; press Enter to send).
    const envAutoSubmit =
      this.ctx.env[
        `TINYPLACE_${this.profile.kind.toUpperCase()}_AUTOSUBMIT`
      ] !== "0";
    const guardTripped =
      this.consecutiveAutoInjects >= BlessedTinyPlaceTui.MAX_AUTO_INJECTS;
    if (envAutoSubmit && guardTripped) {
      bridgeLog("inbound.loopGuard", {
        paused: true,
        consecutive: this.consecutiveAutoInjects,
      });
    }
    const autoSubmit = envAutoSubmit && !guardTripped;
    if (autoSubmit) {
      this.consecutiveAutoInjects += 1;
    }
    return autoSubmit;
  }

  /** Chain an injection onto the serial queue so batched inbound turns keep
   *  their boundaries (body → Enter → next body), never interleaving. */
  private enqueueInjection(body: string, autoSubmit: boolean): void {
    this.injectionQueue = this.injectionQueue
      .then(() => this.injectOne(body, autoSubmit))
      .catch(() => {});
  }

  /** Type one inbound turn and, when auto-submitting, the distinct Enter after a
   *  short debounce (so the agent TUI doesn't swallow the CR as a paste). */
  private async injectOne(body: string, autoSubmit: boolean): Promise<void> {
    if (this.tmuxSocket && this.tmuxSession) {
      const socket = this.tmuxSocket;
      const session = this.tmuxSession;
      const cwd = this.options.cwd ?? process.cwd();
      runTmuxCommand(
        socket,
        ["send-keys", "-t", session, "-l", body],
        this.ctx.env,
        cwd,
      );
      if (autoSubmit) {
        await delay(150);
        runTmuxCommand(
          socket,
          ["send-keys", "-t", session, "Enter"],
          this.ctx.env,
          cwd,
        );
      }
      return;
    }
    this.writeAgentInput(Buffer.from(autoSubmit ? `${body}\r` : body, "utf8"));
  }

  private async startAgent(): Promise<void> {
    this.clearAutoStart();
    if (this.child || this.pty) {
      return;
    }
    // opencode: boot the server we observe + attach to BEFORE anything spawns,
    // then prepend `attach <url>` to its launch. A start failure (e.g. opencode
    // not installed) surfaces as an agent-exit notice instead of a silent hang.
    if (this.profile.serverMode && !this.opencodeServer) {
      try {
        this.opencodeServer = await startOpenCodeServer({
          bin: this.profile.launch.command,
          cwd: this.effectiveCwd(),
          env: childEnv(this.ctx.env),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.finishAgent(`opencode server failed to start: ${message}`);
        return;
      }
      const attachArgs = [
        "attach",
        this.opencodeServer.url,
        ...this.profile.launch.args,
      ];
      this.profile = {
        ...this.profile,
        launch: buildLaunch(this.profile.launch.command, attachArgs),
      };
    }
    const { launch } = this.profile;
    this.state = {
      ...this.state,
      autoStartRemainingMs: undefined,
      activeSessionId: this.profile.pendingSessionId,
      notice: undefined,
      view: "agent",
    };
    // opencode has no per-session files to monitor; its live session id arrives
    // over the SSE bus, so the file-based AgentSessionMonitor is skipped.
    if (!this.profile.serverMode) {
      this.agentSessionMonitor = new AgentSessionMonitor(
        this.ctx,
        // Locate the resumed/fresh session against the folder it runs in.
        { ...this.options, cwd: this.effectiveCwd() },
        this.profile,
        (meta) => {
          this.state = {
            ...this.state,
            activeSessionId: meta.sessionId,
          };
          if (this.nativeRelayActive) {
            this.updateNativeTerminalTitle();
          } else {
            this.renderFooter();
            this.queueScreenRender();
          }
        },
      );
      this.agentSessionMonitor.start(new Date());
    }
    // Start the real OpenHuman bridge; the receiver's sink reads this.pty/this.child
    // lazily, so starting before spawn is safe (first inbound poll is ~1.5s out).
    this.startBridge();
    this.renderFooter();
    this.screen.render();
    this.clearBody();
    if (this.usesNativeRelay() && (await this.startNativeRelay(launch))) {
      return;
    }
    this.terminal = blessed.terminal({
      cursor: "block",
      handler: (input) => {
        // A genuine keystroke (Blessed-widget path, mirroring the native relay's
        // nativeInputHandler) clears the loop-guard streak so auto-submit
        // resumes after the person re-engages. writeAgentInput is also used by
        // inbound injection, so the reset must live here, not inside it.
        this.consecutiveAutoInjects = 0;
        this.writeAgentInput(input);
      },
      height: "100%",
      left: 0,
      parent: this.body,
      screenKeys: true,
      style: {
        bg: "black",
        fg: "white",
      },
      top: 0,
      width: "100%",
    });
    this.terminal.focus();
    this.terminal.write(`Starting ${launch.label}...\r\n`);
    this.renderFooter();
    this.screen.render();

    if (this.ctx.env[this.profile.disabledPtyEnv] !== "1") {
      try {
        fixNodePtyHelperPermissions();
        const { spawn } = await import("node-pty");
        const pty = spawn(launch.command, launch.args, {
          cols: terminalColumns(this.options),
          cwd: this.effectiveCwd(),
          env: childEnv(this.ctx.env),
          name: terminalName(this.ctx.env),
          rows: terminalRows(this.options),
        });
        this.pty = pty;
        pty.onData((chunk) => {
          this.writeAgentOutput(chunk);
        });
        pty.onExit(({ exitCode, signal }) => {
          const detail = signal ? `signal ${signal}` : `exit code ${exitCode}`;
          this.finishAgent(
            `${this.profile.displayName} exited with ${detail}.`,
          );
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.terminal?.write(
          `node-pty unavailable: ${message}\r\nFalling back to pipe mode.\r\n`,
        );
        this.screen.render();
      }
    }

    const spawnFn = this.options.spawn ?? spawnChild;
    const child = spawnFn(launch.command, launch.args, {
      cwd: this.effectiveCwd(),
      env: childEnv(this.ctx.env),
    });
    this.child = child;
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk: Buffer | string) => {
      this.writeAgentOutput(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.writeAgentOutput(chunk);
    });
    child.on("error", (error) => {
      this.finishAgent(
        `${this.profile.displayName} failed to start: ${error.message}`,
      );
    });
    child.on("exit", (code, signal) => {
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
      this.finishAgent(`${this.profile.displayName} exited with ${detail}.`);
    });
  }

  private writeAgentInput(input: Buffer): void {
    if (this.pty) {
      this.pty.write(input.toString("utf8"));
      return;
    }
    this.child?.stdin.write(input);
  }

  private writeAgentOutput(chunk: Buffer | string): void {
    if (this.state.view !== "agent") {
      return;
    }
    if (this.nativeRelayActive) {
      const stdout = this.options.stdout ?? process.stdout;
      stdout.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      return;
    }
    this.terminal?.write(
      Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk,
    );
    this.queueScreenRender();
  }

  private async startNativeRelay(launch: AgentLaunch): Promise<boolean> {
    if (this.ctx.env[this.profile.disabledPtyEnv] === "1") {
      return false;
    }
    const socket = `tinyverse-${process.pid}-${Date.now()}`;
    const session = `tinyverse-${process.pid}`;
    if (!this.createTmuxSession(socket, session, launch)) {
      return false;
    }
    let spawn: typeof import("node-pty").spawn;
    try {
      fixNodePtyHelperPermissions();
      ({ spawn } = await import("node-pty"));
    } catch {
      this.killTmuxSession(socket, session);
      return false;
    }
    this.destroyBlessedLayout();
    try {
      this.tmuxSocket = socket;
      this.tmuxSession = session;
      this.updateNativeTerminalTitle();
      const pty = spawn(
        "tmux",
        ["-L", socket, "attach-session", "-t", session],
        {
          cols: terminalColumns(this.options),
          cwd: this.effectiveCwd(),
          env: tmuxEnv(this.ctx.env),
          name: terminalName(this.ctx.env),
          rows: terminalPhysicalRows(this.options),
        },
      );
      this.pty = pty;
      this.nativeRelayActive = true;
      this.nativeInputHandler = (chunk) => {
        // A real human keystroke clears the loop-guard streak so auto-submit
        // resumes after the person re-engages.
        this.consecutiveAutoInjects = 0;
        pty.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      };
      const stdin = this.options.stdin ?? process.stdin;
      this.nativeHadRawMode = (stdin as { isRaw?: boolean }).isRaw ?? false;
      (stdin as { setRawMode?: (mode: boolean) => void }).setRawMode?.(true);
      stdin.on("data", this.nativeInputHandler);
      stdin.resume();
      this.nativeResizeHandler = () => {
        this.resizeAgentPty();
      };
      addResizeListener(
        this.options.stdout ?? process.stdout,
        this.nativeResizeHandler,
      );
      process.on("SIGWINCH", this.nativeResizeHandler);
      pty.onData((chunk) => {
        this.writeAgentOutput(chunk);
      });
      pty.onExit(({ exitCode, signal }) => {
        const detail = signal ? `signal ${signal}` : `exit code ${exitCode}`;
        this.finishAgent(`${this.profile.displayName} exited with ${detail}.`);
      });
      return true;
    } catch {
      this.nativeRelayActive = false;
      this.cleanupNativeRelay();
      this.killTmuxSession(socket, session);
      this.createBlessedLayout();
      this.registerKeys();
      this.render();
      return false;
    }
  }

  /**
   * Whether to run the agent through the **native tmux relay** rather than the
   * embedded Blessed `terminal` widget. Native relay is the default for BOTH
   * agents: it tears Blessed down and hands the real terminal to the agent (with
   * the tiny.place chrome as a tmux status line), so the terminal's own text
   * selection / copy / scrollback keep working. The Blessed widget owns the
   * screen (alternate buffer + term.js mouse handling) and disables all of that
   * — the "whole pane is inaccessible" symptom. Opt back into it per agent with
   * `TINYPLACE_<KIND>_TERMINAL_MODE=blessed`, or globally with
   * `TINYPLACE_TERMINAL_MODE=blessed`. If tmux/node-pty is missing, the relay
   * fails soft and falls back to the Blessed widget anyway.
   */
  private usesNativeRelay(): boolean {
    const kindMode =
      this.ctx.env[
        `TINYPLACE_${this.profile.kind.toUpperCase()}_TERMINAL_MODE`
      ] ??
      (this.profile.kind === "claude"
        ? this.ctx.env.TINYVERSE_CLAUDE_TERMINAL_MODE
        : undefined);
    const mode = kindMode ?? this.ctx.env.TINYPLACE_TERMINAL_MODE;
    return mode !== "blessed";
  }

  private updateNativeTerminalTitle(): void {
    if (!this.tmuxSocket || !this.tmuxSession) {
      return;
    }
    const activeSession = this.state.activeSessionId ?? "none";
    runTmuxCommand(
      this.tmuxSocket,
      [
        "set-option",
        "-t",
        this.tmuxSession,
        "status-left",
        tmuxFooterContent(this.ctx, activeSession),
      ],
      this.ctx.env,
      this.options.cwd,
    );
  }

  private cleanupNativeRelay(): void {
    const stdin = this.options.stdin ?? process.stdin;
    if (this.nativeInputHandler) {
      stdin.off("data", this.nativeInputHandler);
      this.nativeInputHandler = undefined;
    }
    if (this.nativeResizeHandler) {
      removeResizeListener(
        this.options.stdout ?? process.stdout,
        this.nativeResizeHandler,
      );
      process.off("SIGWINCH", this.nativeResizeHandler);
      this.nativeResizeHandler = undefined;
    }
    if (this.nativeHadRawMode !== undefined) {
      (stdin as { setRawMode?: (mode: boolean) => void }).setRawMode?.(
        this.nativeHadRawMode,
      );
      this.nativeHadRawMode = undefined;
    }
    this.nativeRelayActive = false;
    if (this.tmuxSocket && this.tmuxSession) {
      this.killTmuxSession(this.tmuxSocket, this.tmuxSession);
      this.tmuxSocket = undefined;
      this.tmuxSession = undefined;
    }
  }

  private createTmuxSession(
    socket: string,
    session: string,
    launch: AgentLaunch,
  ): boolean {
    const command = shellCommandFor(launch);
    const cwd = this.effectiveCwd();
    if (
      !runTmuxCommand(
        socket,
        ["new-session", "-d", "-s", session, "-c", cwd, command],
        this.ctx.env,
        cwd,
      )
    ) {
      return false;
    }
    for (const args of [
      ["set-option", "-t", session, "status", "on"],
      ["set-option", "-t", session, "status-position", "bottom"],
      ["set-option", "-t", session, "status-left-length", "200"],
      ["set-option", "-t", session, "status-right", ""],
      ["set-option", "-t", session, "status-style", "bg=black,fg=white"],
      // Capture the mouse so the scroll wheel drives tmux copy-mode (scrollback)
      // instead of leaking past tmux to the agent. The agents run INLINE (no
      // alternate screen), so an uncaptured wheel scrolls the agent's own prompt
      // up and down; `mouse on` routes it to tmux scrollback and anchors the
      // prompt. Trade-off: drag-select becomes tmux's selection (still copies)
      // rather than the host terminal's native selection.
      ["set-option", "-t", session, "mouse", "on"],
      ["set-window-option", "-t", session, "window-status-format", ""],
      ["set-window-option", "-t", session, "window-status-current-format", ""],
      [
        "set-option",
        "-t",
        session,
        "status-left",
        tmuxFooterContent(this.ctx, this.state.activeSessionId ?? "none"),
      ],
    ]) {
      if (!runTmuxCommand(socket, args, this.ctx.env, cwd)) {
        this.killTmuxSession(socket, session);
        return false;
      }
    }
    return true;
  }

  private killTmuxSession(socket: string, session: string): void {
    runTmuxCommand(
      socket,
      ["kill-session", "-t", session],
      this.ctx.env,
      this.options.cwd,
    );
  }

  private queueScreenRender(): void {
    if (this.closed || this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    setTimeout(() => {
      this.renderQueued = false;
      if (!this.closed) {
        this.screen.render();
      }
    }, 16);
  }

  private resizeAgentPty(): void {
    if (!this.pty) {
      return;
    }
    this.pty.resize(
      terminalColumns(this.options),
      this.nativeRelayActive
        ? terminalPhysicalRows(this.options)
        : terminalRows(this.options),
    );
  }

  private finishAgent(notice: string): void {
    void notice;
    this.closed = true;
    this.clearAutoStart();
    this.child = undefined;
    this.agentSessionMonitor?.stop();
    this.agentSessionMonitor = undefined;
    this.stopBridge();
    // Tear down the opencode server we launched (best-effort) after the bridge
    // stops reading its SSE stream.
    if (this.opencodeServer) {
      void this.opencodeServer.stop().catch(() => undefined);
      this.opencodeServer = undefined;
    }
    this.releaseSessionLockIfHeld();
    this.cleanupNativeRelay();
    this.pty = undefined;
    this.terminal?.destroy();
    this.terminal = undefined;
    this.destroyScreenSafely();
    this.resolve();
  }

  private render(): void {
    this.clearBody();
    if (this.state.view === "settings") {
      this.body.setContent(renderSettingsContent(this.ctx, this.profile));
    } else if (this.homeMode && this.state.view === "welcome") {
      // Home welcome is a two-pane layout (actions + resume list) built from
      // child boxes rather than a single content string.
      this.body.setContent("");
      this.renderHomePanes();
    } else {
      this.body.setContent(
        renderWelcomeContent(
          this.ctx,
          this.profile,
          this.state,
          this.actions(),
          this.homeMode,
        ),
      );
    }
    this.renderFooter();
    this.screen.render();
  }

  /** Home welcome: left = actions, right = recent-session resume list. Focused
   *  pane gets the cyan border + the live cursor highlight. */
  private renderHomePanes(): void {
    const focus = this.state.homeFocus ?? "actions";
    const actionsFocused = focus === "actions";
    blessed.box({
      parent: this.body,
      top: 0,
      left: 0,
      width: "42%",
      height: "100%",
      tags: true,
      border: { type: "line" },
      label: " tiny.place ",
      style: {
        bg: "black",
        fg: "white",
        border: { fg: actionsFocused ? "cyan" : "gray" },
      },
      content: this.renderHomeActionsContent(actionsFocused),
    });
    const sessions = blessed.box({
      parent: this.body,
      top: 0,
      left: "42%",
      width: "58%",
      height: "100%",
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      border: { type: "line" },
      label: " resume a session ",
      style: {
        bg: "black",
        fg: "white",
        border: { fg: actionsFocused ? "gray" : "cyan" },
      },
      content: this.renderSessionsContent(!actionsFocused),
    });
    // Keep the highlighted row in view when the list overflows the pane.
    if (!actionsFocused) {
      sessions.setScroll(this.state.sessionIndex ?? 0);
    }
  }

  private renderHomeActionsContent(focused: boolean): string {
    const actions = this.actions();
    const rows = actions.map((action, index) => {
      const [label, colorTag] = actionRow(action, "", this.state);
      const selected = focused && this.state.selectedIndex === index;
      return renderActionRow(selected, label, colorTag);
    });
    const owner = this.state.openHumanSessionId;
    const openHuman = this.state.bridgeLive
      ? renderKeyValue("OpenHuman", `connected ${owner ?? ""}`, "{green-fg}")
      : this.state.openHumanConnected
        ? renderKeyValue(
            "OpenHuman",
            `remembered ${owner ?? ""}`,
            "{yellow-fg}",
          )
        : renderKeyValue("OpenHuman", "disconnected", "{gray-fg}");
    return [
      renderKeyValue("tiny.place", this.ctx.baseUrl, "{cyan-fg}"),
      renderKeyValue("wallet", walletIdFor(this.ctx), "{yellow-fg}"),
      openHuman,
      "",
      ...rows,
      "",
      "{gray-fg}↑↓ move · Tab → sessions{/gray-fg}",
    ].join("\n");
  }

  private renderSessionsContent(focused: boolean): string {
    if (this.recentSessions.length === 0) {
      return [
        "{gray-fg}No recent sessions yet.{/gray-fg}",
        "",
        "{gray-fg}Start one from the left; it{/gray-fg}",
        "{gray-fg}shows up here to resume later.{/gray-fg}",
      ].join("\n");
    }
    const here = this.effectiveCwd();
    return this.recentSessions
      .map((session, index) => {
        const selected = focused && (this.state.sessionIndex ?? 0) === index;
        return renderSessionRow(session, selected, here);
      })
      .join("\n");
  }

  private renderFooter(): void {
    const activeSession = this.state.activeSessionId ?? "none";
    const connected = Boolean(this.ctx.baseUrl);
    const status = connected
      ? "{green-fg}Connected to tiny.place{/green-fg}"
      : "{red-fg}Disconnected{/red-fg}";
    const ownerLabel = blessed.escape(this.state.openHumanSessionId ?? "");
    const openHuman = this.state.bridgeLive
      ? `{green-fg}OpenHuman ${ownerLabel}{/green-fg}`
      : this.state.openHumanConnected
        ? `{yellow-fg}OpenHuman ${ownerLabel} (remembered){/yellow-fg}`
        : "{gray-fg}OpenHuman off{/gray-fg}";
    this.footer.setContent(
      ` ${status} {gray-fg}-{/gray-fg} ${openHuman} {gray-fg}- Chat id:{/gray-fg} {yellow-fg}${blessed.escape(activeSession)}{/yellow-fg}`,
    );
  }

  private clearBody(): void {
    for (const child of [...this.body.children]) {
      child.destroy();
    }
    this.body.setContent("");
  }

  private close(): void {
    this.closed = true;
    this.clearAutoStart();
    if (this.child) {
      this.child.kill();
      this.child = undefined;
    }
    this.stopBridge();
    this.releaseSessionLockIfHeld();
    this.cleanupNativeRelay();
    this.agentSessionMonitor?.stop();
    this.agentSessionMonitor = undefined;
    if (this.pty) {
      this.pty.kill();
      this.pty = undefined;
    }
    this.destroyScreenSafely();
    this.resolve();
  }

  private destroyScreenSafely(): void {
    try {
      this.screen.destroy();
    } catch {
      // The Claude/tmux path destroys Blessed before attaching the inner TUI.
    }
  }

  private scheduleAutoStart(): void {
    this.clearAutoStart();
    if (this.autoStartUsed) {
      return;
    }
    // Home mode has no pre-chosen agent, so never auto-launch — the developer
    // picks Codex or Claude explicitly.
    if (this.homeMode) {
      return;
    }
    if (this.state.view !== "welcome" || this.selectedAction() !== "launch") {
      return;
    }
    const timeoutMs = autoStartMs(this.ctx.env);
    if (timeoutMs <= 0) {
      return;
    }
    this.autoStartUsed = true;
    const deadline = Date.now() + timeoutMs;
    this.state = {
      ...this.state,
      autoStartAvailable: false,
      autoStartRemainingMs: timeoutMs,
    };
    this.render();
    this.autoStartInterval = setInterval(() => {
      const remainingMs = Math.max(0, deadline - Date.now());
      this.state = {
        ...this.state,
        autoStartRemainingMs: remainingMs,
      };
      if (this.state.view === "welcome") {
        this.render();
      }
    }, 100);
    this.autoStartTimer = setTimeout(() => {
      void this.startAgent();
    }, timeoutMs);
  }

  private clearAutoStart(): void {
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = undefined;
    }
    if (this.autoStartInterval) {
      clearInterval(this.autoStartInterval);
      this.autoStartInterval = undefined;
    }
    this.state = {
      ...this.state,
      autoStartRemainingMs: undefined,
    };
  }
}

class AgentSessionMonitor {
  private readonly baselineMtimes: Map<string, number>;
  private lastSessionId: string | undefined;
  private startedAt: Date | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly ctx: CliContext,
    private readonly options: TinyPlaceCliOptions,
    private readonly profile: AgentProfile,
    private readonly onSession: (meta: AgentSessionMeta) => void,
  ) {
    this.baselineMtimes = baselineSessionMtimes(profile);
  }

  public start(startedAt: Date): void {
    this.startedAt = startedAt;
    this.poll(startedAt);
    const pollMs = Number(this.ctx.env[this.profile.sessionPollEnv] ?? 500);
    this.timer = setInterval(
      () => {
        this.poll(startedAt);
      },
      Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 500,
    );
  }

  public stop(): void {
    if (this.startedAt) {
      this.poll(this.startedAt);
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private poll(startedAt: Date): void {
    const meta = locateCodexSession(
      this.profile,
      this.options.cwd ?? process.cwd(),
      this.baselineMtimes,
      startedAt,
    );
    if (!meta || meta.sessionId === this.lastSessionId) {
      return;
    }
    this.lastSessionId = meta.sessionId;
    this.onSession(meta);
  }
}

function renderWelcomeContent(
  ctx: CliContext,
  profile: AgentProfile,
  state: Readonly<TuiState>,
  actions: ReadonlyArray<TuiAction>,
  homeMode: boolean,
): string {
  const timeoutMs = autoStartMs(ctx.env);
  const launchLabel =
    state.autoStartRemainingMs !== undefined
      ? `[ Launch ${profile.displayName} automatically in ${formatDuration(state.autoStartRemainingMs)} ]`
      : state.autoStartAvailable && timeoutMs > 0
        ? `[ Launch ${profile.displayName} automatically in ${formatDuration(timeoutMs)} ]`
        : `[ Launch ${profile.displayName} ]`;
  const header = homeMode
    ? "{gray-fg}Pick a session to start, or connect your OpenHuman. Arrows/j,k move · Enter selects · q quits.{/gray-fg}"
    : `{gray-fg}${profile.displayName} runs inside this shell while tiny.place tracks the active ${profile.displayName} session.{/gray-fg}`;
  const info = [
    renderKeyValue("tiny.place", ctx.baseUrl, "{cyan-fg}"),
    renderKeyValue("wallet", walletIdFor(ctx), "{yellow-fg}"),
    // Fixed-agent mode names the one agent + its sessions dir; home mode hasn't
    // bound one yet, so showing a codex-specific `sessions:` path there is
    // misleading — omit both until the user picks an agent.
    ...(homeMode
      ? []
      : [
          renderKeyValue(profile.kind, profile.launch.label, "{green-fg}"),
          renderKeyValue("sessions", profile.sessionsDir, "{cyan-fg}"),
        ]),
    state.bridgeLive
      ? renderKeyValue(
          "OpenHuman",
          `connected to ${state.openHumanSessionId ?? "openhuman:mock"}`,
          "{green-fg}",
        )
      : state.openHumanConnected
        ? renderKeyValue(
            "OpenHuman",
            `remembered ${state.openHumanSessionId ?? ""} (connects on launch)`,
            "{yellow-fg}",
          )
        : renderKeyValue("OpenHuman", "disconnected", "{gray-fg}"),
  ];
  const rows = actions.map((action, index) => {
    const [label, colorTag] = actionRow(action, launchLabel, state);
    return renderActionRow(state.selectedIndex === index, label, colorTag);
  });
  const lines = [
    "{bold}welcome to tiny.place{/bold}",
    header,
    "",
    ...info,
    "",
    ...rows,
    "",
    state.notice
      ? `{yellow-fg}${state.notice}{/yellow-fg}`
      : "{gray-fg}Enter launches the selected action. Move selection to cancel auto-launch. q quits.{/gray-fg}",
  ];
  return `${lines.join("\n")}\n`;
}

/** Label + color for one welcome-menu action row. */
function actionRow(
  action: TuiAction,
  launchLabel: string,
  state: Readonly<TuiState>,
): [string, string] {
  switch (action) {
    case "launch":
      return [launchLabel, "{green-fg}"];
    case "launch-codex":
      return ["[ Start Codex session ]", "{green-fg}"];
    case "launch-claude":
      return ["[ Start Claude session ]", "{green-fg}"];
    case "launch-opencode":
      return ["[ Start OpenCode session ]", "{green-fg}"];
    case "connect":
      return [
        state.openHumanConnected
          ? "[ Connect with OpenHuman ] connected"
          : "[ Connect with OpenHuman ]",
        state.openHumanConnected ? "{green-fg}" : "{cyan-fg}",
      ];
    case "settings":
      return ["[ Settings ]", "{cyan-fg}"];
    case "quit":
      return ["[ Quit ]", "{gray-fg}"];
  }
}

function renderActionRow(
  selected: boolean,
  label: string,
  colorTag: string,
): string {
  const row = `${selected ? ">" : " "} ${label}`;
  if (selected) {
    return `{inverse}${row}{/inverse}`;
  }
  return `${colorTag}${row}{/${colorTag.slice(1)}`;
}

function renderKeyValue(
  label: string,
  value: string,
  colorTag: string,
): string {
  return `{gray-fg}${label}:{/gray-fg} ${colorTag}${value}{/${colorTag.slice(1)}`;
}

function renderSettingsContent(ctx: CliContext, profile: AgentProfile): string {
  return [
    "{bold}tiny.place settings{/bold}",
    `{gray-fg}These are the runtime settings used by the ${profile.displayName} proxy.{/gray-fg}`,
    "",
    `endpoint: ${ctx.baseUrl}`,
    `wallet: ${walletIdFor(ctx)}`,
    `agent: ${profile.displayName}`,
    `${profile.kind} command: ${profile.launch.label}`,
    `${profile.kind} sessions dir: ${profile.sessionsDir}`,
    "openhuman: mock tiny.place session",
    `auto-launch: ${autoStartMs(ctx.env) > 0 ? formatDuration(autoStartMs(ctx.env)) : "disabled"}`,
    `node-pty: ${ctx.env[profile.disabledPtyEnv] === "1" ? "disabled" : "enabled"}`,
    "",
    `{gray-fg}Environment overrides: ${profileOverrideNames(profile).join(", ")}, TINYPLACE_TUI_AUTOSTART_MS.{/gray-fg}`,
    "",
    "{gray-fg}Press Enter or Esc to return. Press q to quit from the welcome screen.{/gray-fg}",
  ].join("\n");
}

function buildAgentProfile(
  env: Record<string, string | undefined>,
  kind: TinyVerseAgentKind,
  resumeSessionId?: string,
): AgentProfile {
  if (kind === "claude") {
    const command =
      firstEnv(env, ["TINYVERSE_CLAUDE_BIN", "TINYPLACE_CLAUDE_BIN"]) ??
      "claude";
    const args = splitShellWords(
      firstEnv(env, ["TINYVERSE_CLAUDE_ARGS", "TINYPLACE_CLAUDE_ARGS"]) ?? "",
    );
    // `claude --resume <id>` resumes a specific conversation by session id.
    const launchArgs = resumeSessionId
      ? [...args, "--resume", resumeSessionId]
      : args;
    return {
      disabledPtyEnv: "TINYPLACE_CLAUDE_NO_PTY",
      displayName: "Claude",
      kind,
      launch: buildLaunch(command, launchArgs),
      pendingSessionId: resumeSessionId ?? "claude:pending",
      sessionPollEnv: "TINYPLACE_CLAUDE_SESSION_POLL_MS",
      sessionsDir:
        firstEnv(env, [
          "TINYVERSE_CLAUDE_SESSIONS_DIR",
          "TINYPLACE_CLAUDE_SESSIONS_DIR",
        ]) ?? join(homedir(), ".claude", "projects"),
      ...(resumeSessionId ? { resumeSessionId } : {}),
    };
  }
  if (kind === "opencode") {
    const command = env.TINYPLACE_OPENCODE_BIN ?? "opencode";
    const args = splitShellWords(env.TINYPLACE_OPENCODE_ARGS ?? "");
    // opencode has no per-session files and no resume-by-id in the TUI (its
    // bridge attaches to a fresh server session); resume is a documented
    // follow-up, so a resumeSessionId is ignored here. The launch args are the
    // user's extra flags; `attach <url>` is prepended at spawn once the server
    // is up (startAgent), so `serverMode` is the marker that triggers that.
    return {
      disabledPtyEnv: "TINYPLACE_OPENCODE_NO_PTY",
      displayName: "OpenCode",
      kind,
      launch: buildLaunch(command, args),
      pendingSessionId: "opencode:pending",
      sessionPollEnv: "TINYPLACE_OPENCODE_SESSION_POLL_MS",
      sessionsDir:
        env.TINYPLACE_OPENCODE_SESSIONS_DIR ??
        join(homedir(), ".local", "share", "opencode", "sessions"),
      serverMode: true,
    };
  }
  const command = env.TINYPLACE_CODEX_BIN ?? "codex";
  const args = splitShellWords(env.TINYPLACE_CODEX_ARGS ?? "");
  // `codex resume <id>` is a subcommand, so it must lead the arg list.
  const launchArgs = resumeSessionId
    ? ["resume", resumeSessionId, ...args]
    : args;
  return {
    disabledPtyEnv: "TINYPLACE_CODEX_NO_PTY",
    displayName: "Codex",
    kind,
    launch: buildLaunch(command, launchArgs),
    pendingSessionId: resumeSessionId ?? "codex:pending",
    sessionPollEnv: "TINYPLACE_CODEX_SESSION_POLL_MS",
    sessionsDir:
      env.TINYPLACE_CODEX_SESSIONS_DIR ?? join(homedir(), ".codex", "sessions"),
    ...(resumeSessionId ? { resumeSessionId } : {}),
  };
}

function buildLaunch(command: string, args: Array<string>): AgentLaunch {
  return {
    args,
    command,
    label: `${command}${args.length > 0 ? ` ${args.join(" ")}` : ""}`,
  };
}

function firstEnv(
  env: Record<string, string | undefined>,
  names: Array<string>,
): string | undefined {
  return names
    .map((name) => env[name])
    .find((value) => value !== undefined && value !== "");
}

function profileOverrideNames(profile: AgentProfile): Array<string> {
  if (profile.kind === "claude") {
    return [
      "TINYPLACE_CLAUDE_BIN",
      "TINYPLACE_CLAUDE_ARGS",
      "TINYPLACE_CLAUDE_SESSIONS_DIR",
    ];
  }
  if (profile.kind === "opencode") {
    return ["TINYPLACE_OPENCODE_BIN", "TINYPLACE_OPENCODE_ARGS"];
  }
  return [
    "TINYPLACE_CODEX_BIN",
    "TINYPLACE_CODEX_ARGS",
    "TINYPLACE_CODEX_SESSIONS_DIR",
  ];
}

function childEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    TERM: terminalName(env),
  };
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function terminalName(env: Record<string, string | undefined>): string {
  const value = env.TERM ?? process.env.TERM;
  return value && value !== "dumb" ? value : "xterm-256color";
}

function tmuxEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const result = childEnv(env);
  delete result.TMUX;
  return result;
}

function runTmuxCommand(
  socket: string,
  args: Array<string>,
  env: Record<string, string | undefined>,
  cwd: string | undefined,
): boolean {
  const result = spawnSync("tmux", ["-L", socket, ...args], {
    cwd: cwd ?? process.cwd(),
    env: tmuxEnv(env),
    stdio: "ignore",
  });
  return result.status === 0;
}

function shellCommandFor(launch: AgentLaunch): string {
  return [launch.command, ...launch.args]
    .map((part) => shellQuote(part))
    .join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function tmuxFooterContent(ctx: CliContext, activeSession: string): string {
  const status = ctx.baseUrl
    ? "#[fg=green]Connected to tiny.place#[default]"
    : "#[fg=red]Disconnected#[default]";
  return `${status} - Chat id: #[fg=yellow]${tmuxEscape(activeSession)}#[default]`;
}

function tmuxEscape(value: string): string {
  return value.replace(/#/g, "##");
}

function locateCodexSession(
  profile: AgentProfile,
  cwd: string,
  baselineMtimes: ReadonlyMap<string, number>,
  startedAt: Date,
): AgentSessionMeta | undefined {
  const candidates = listAgentSessionFiles(profile)
    .filter((path) => {
      try {
        const mtimeMs = statSync(path).mtimeMs;
        return (
          mtimeMs >= startedAt.getTime() - 2_000 ||
          mtimeMs > (baselineMtimes.get(path) ?? 0)
        );
      } catch {
        return false;
      }
    })
    .map((path) => readAgentSessionMeta(profile, path))
    .filter((meta): meta is AgentSessionMeta => meta !== undefined)
    .sort(
      (left, right) =>
        statSync(right.path).mtimeMs - statSync(left.path).mtimeMs,
    );
  return (
    candidates.find((meta) => meta.cwd === cwd) ??
    candidates.find(
      (meta) => meta.cwd !== undefined && relatedCwd(meta.cwd, cwd),
    ) ??
    (Date.now() - startedAt.getTime() > 2_000 ? candidates[0] : undefined)
  );
}

function baselineSessionMtimes(profile: AgentProfile): Map<string, number> {
  const baseline = new Map<string, number>();
  for (const path of listAgentSessionFiles(profile)) {
    try {
      baseline.set(path, statSync(path).mtimeMs);
    } catch {
      continue;
    }
  }
  return baseline;
}

function listAgentSessionFiles(profile: AgentProfile): Array<string> {
  if (!existsSync(profile.sessionsDir)) {
    return [];
  }
  const out: Array<string> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.isFile() &&
        isAgentSessionFile(profile, path, entry.name)
      ) {
        out.push(path);
      }
    }
  };
  visit(profile.sessionsDir);
  return out;
}

function isAgentSessionFile(
  profile: AgentProfile,
  path: string,
  name: string,
): boolean {
  if (profile.kind === "codex") {
    return name.startsWith("rollout-") && name.endsWith(".jsonl");
  }
  return name.endsWith(".jsonl") && !path.includes(`${sep}subagents${sep}`);
}

function readAgentSessionMeta(
  profile: AgentProfile,
  path: string,
): AgentSessionMeta | undefined {
  return profile.kind === "claude"
    ? readClaudeSessionMeta(path)
    : readCodexSessionMeta(path);
}

function readCodexSessionMeta(path: string): AgentSessionMeta | undefined {
  let latest: AgentSessionMeta | undefined;
  for (const raw of readAllLines(path)) {
    const record = parseJsonObject(raw);
    if (record?.type !== "session_meta") {
      continue;
    }
    const payload = asObject(record.payload);
    if (!payload) {
      continue;
    }
    const sessionId = asString(payload.id) ?? asString(payload.session_id);
    if (!sessionId) {
      continue;
    }
    latest = {
      ...(asString(payload.cwd) ? { cwd: asString(payload.cwd) } : {}),
      path,
      sessionId,
    };
  }
  return latest;
}

function readClaudeSessionMeta(path: string): AgentSessionMeta | undefined {
  let latestCwd: string | undefined;
  let latestSessionId: string | undefined;
  for (const raw of readAllLines(path)) {
    const record = parseJsonObject(raw);
    if (!record) {
      continue;
    }
    latestCwd = asString(record.cwd) ?? latestCwd;
    latestSessionId = asString(record.sessionId) ?? latestSessionId;
  }
  if (!latestSessionId) {
    return undefined;
  }
  return {
    ...(latestCwd ? { cwd: latestCwd } : {}),
    path,
    sessionId: latestSessionId,
  };
}

function relatedCwd(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  const leftToRight = relative(resolvedLeft, resolvedRight);
  const rightToLeft = relative(resolvedRight, resolvedLeft);
  return isRelativeDescendant(leftToRight) || isRelativeDescendant(rightToLeft);
}

function isRelativeDescendant(value: string): boolean {
  return (
    value.length === 0 || (!value.startsWith("..") && !value.startsWith("/"))
  );
}

function readAllLines(path: string): Array<string> {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed);
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function fixNodePtyHelperPermissions(): void {
  let packageDir: string;
  try {
    packageDir = dirname(requireForTui.resolve("node-pty/package.json"));
  } catch {
    return;
  }
  for (const helperPath of [
    join(packageDir, "build", "Release", "spawn-helper"),
    join(
      packageDir,
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper",
    ),
  ]) {
    if (!existsSync(helperPath)) {
      continue;
    }
    chmodSync(helperPath, 0o755);
  }
}

function terminalColumns(options: TinyPlaceCliOptions): number {
  const columns =
    (options.stdout as { columns?: number } | undefined)?.columns ??
    process.stdout.columns ??
    80;
  return Math.max(20, columns);
}

function terminalRows(options: TinyPlaceCliOptions): number {
  return Math.max(4, terminalPhysicalRows(options) - 1);
}

function terminalPhysicalRows(options: TinyPlaceCliOptions): number {
  const rows =
    (options.stdout as { rows?: number } | undefined)?.rows ??
    process.stdout.rows ??
    24;
  return Math.max(5, rows);
}

function addResizeListener(stream: unknown, handler: () => void): void {
  (stream as { on?: (event: "resize", listener: () => void) => void }).on?.(
    "resize",
    handler,
  );
}

function removeResizeListener(stream: unknown, handler: () => void): void {
  (stream as { off?: (event: "resize", listener: () => void) => void }).off?.(
    "resize",
    handler,
  );
}

function splitShellWords(input: string): Array<string> {
  const words: Array<string> = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += "\\";
  }
  if (current) {
    words.push(current);
  }
  return words;
}

function renderStaticSnapshot(ctx: CliContext, profile: AgentProfile): string {
  const timeoutMs = autoStartMs(ctx.env);
  const owner = bridgeOwner(ctx.env, profile.kind) ?? ctx.openHumanOwner;
  const lines = [
    "welcome to tiny.place",
    `${profile.displayName} runs inside this shell while tiny.place tracks the active ${profile.displayName} session.`,
    "",
    `tiny.place: ${ctx.baseUrl}`,
    `wallet: ${walletIdFor(ctx)}`,
    `${profile.kind}: ${profile.launch.label}`,
    `sessions: ${profile.sessionsDir}`,
    owner
      ? `OpenHuman: ${owner} (auto-connect on launch)`
      : "OpenHuman: disconnected",
    "",
    `> ${
      timeoutMs > 0
        ? `[ Launch ${profile.displayName} automatically in ${formatDuration(timeoutMs)} ]`
        : `[ Launch ${profile.displayName} ]`
    }`,
    "  [ Connect with OpenHuman ]",
    "  [ Settings ]",
    "  [ Quit ]",
    "",
    "Enter launches the selected action. Move selection to cancel auto-launch. q quits.",
    `${ctx.baseUrl ? "Connected to tiny.place" : "Disconnected"} - Chat id: none`,
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Non-TTY snapshot for bare `tinyplace` (home mode) — the agent picker. Mirrors
 * the interactive home menu so scripts / `| cat` see the same options.
 */
function renderHomeSnapshot(ctx: CliContext, cwd: string): string {
  const owner = bridgeOwner(ctx.env) ?? ctx.openHumanOwner;
  const lines = [
    "welcome to tiny.place",
    "Pick a session to start, or connect your OpenHuman.",
    "",
    `tiny.place: ${ctx.baseUrl}`,
    `wallet: ${walletIdFor(ctx)}`,
    owner
      ? `OpenHuman: ${owner} (auto-connect on launch)`
      : "OpenHuman: disconnected",
    "",
    "> [ Start Codex session ]",
    "  [ Start Claude session ]",
    owner
      ? "  [ Connect with OpenHuman ] connected"
      : "  [ Connect with OpenHuman ]",
    "  [ Settings ]",
    "  [ Quit ]",
    "",
    ...renderSnapshotSessions(ctx, cwd),
    "Arrows/j,k move · Tab switches panes · Enter selects · q quits.",
    `${ctx.baseUrl ? "Connected to tiny.place" : "Disconnected"} - Chat id: none`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Recent-session lines for the non-TTY home snapshot (scripts / `| cat`). */
function renderSnapshotSessions(ctx: CliContext, cwd: string): Array<string> {
  const sessions = safeListRecentSessions(ctx.env, cwd, { limit: 8 });
  if (sessions.length === 0) {
    return [];
  }
  return [
    "recent sessions (resume):",
    ...sessions.map(
      (session) =>
        `  ${session.agent} ${relativeTime(session.lastActive)} ${session.label}`,
    ),
    "",
  ];
}

function walletIdFor(ctx: CliContext): string {
  return ctx.signer?.agentId ?? "mock-wallet-8Hf3Qp2N";
}

/**
 * The configured OpenHuman owner (whom we bridge to), mirroring the wrapper's
 * provider-scoped recipient resolution. When the agent `kind` is known, only
 * that agent's `TINYPLACE_<KIND>_DM_TO`/`_RECEIVE_FROM` is consulted (never the
 * other agent's) so, e.g., a Claude session never picks up
 * `TINYPLACE_CODEX_DM_TO`. When `kind` is undefined (home menu, before an agent
 * is chosen) only the agent-agnostic vars are used — the per-agent recipient is
 * resolved once the user picks Codex vs Claude.
 */
function bridgeOwner(
  env: Record<string, string | undefined>,
  kind?: TinyVerseAgentKind,
): string | undefined {
  const upper = kind?.toUpperCase();
  return firstEnv(env, [
    ...(upper ? [`TINYPLACE_${upper}_DM_TO`] : []),
    "TINYPLACE_HARNESS_DM_TO",
    "TINYPLACE_OPENHUMAN_OWNER",
    "OPENHUMAN_OWNER_AGENT",
    ...(upper ? [`TINYPLACE_${upper}_RECEIVE_FROM`] : []),
    "TINYPLACE_HARNESS_RECEIVE_FROM",
  ]);
}

/** One row in the home resume pane: agent tag · relative time · prompt · (folder
 *  when it differs from where you're standing). Highlighted when it's the cursor. */
function renderSessionRow(
  session: RecentSession,
  selected: boolean,
  here: string,
): string {
  const tag =
    session.agent === "claude"
      ? "{magenta-fg}claude{/magenta-fg}"
      : "{blue-fg}codex {/blue-fg}";
  const when = relativeTime(session.lastActive).padStart(4, " ");
  const label = blessed.escape(session.label);
  const elsewhere =
    session.cwd !== undefined && safeSameDir(session.cwd, here) === false
      ? ` {gray-fg}· ${blessed.escape(basename(session.cwd))}{/gray-fg}`
      : "";
  const row = `${selected ? ">" : " "} ${tag} {gray-fg}${when}{/gray-fg} ${label}${elsewhere}`;
  return selected ? `{inverse}${row}{/inverse}` : row;
}

function safeSameDir(left: string, right: string): boolean {
  try {
    return resolve(left) === resolve(right);
  } catch {
    return false;
  }
}

/** Compact "time since" for the resume list (now/5m/3h/2d). */
function relativeTime(epochMs: number): string {
  const deltaMs = Date.now() - epochMs;
  if (deltaMs < 60_000) {
    return "now";
  }
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/** Never let a session-scan error crash the TUI — the home screen degrades to
 *  "no recent sessions" instead. */
function safeListRecentSessions(
  env: Record<string, string | undefined>,
  cwd: string,
  options?: Parameters<typeof listRecentSessions>[2],
): Array<RecentSession> {
  try {
    return listRecentSessions(env, cwd, options);
  } catch {
    return [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function autoStartMs(env: Record<string, string | undefined>): number {
  const raw = env.TINYPLACE_TUI_AUTOSTART_MS ?? "2500";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 2500;
  }
  return Math.max(0, parsed);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

function isTty(stream: unknown): boolean {
  return (stream as { isTTY?: boolean }).isTTY === true;
}
