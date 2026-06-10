import { existsSync, readFileSync } from "node:fs";
import { platform, release } from "node:os";
import { detectWSL } from "./platform.js";

// ---------------------------------------------------------------------------
// Sandbox runtime + agent vendor fingerprinting.
//
// Goal: distinguish "real developer laptop" from "ephemeral managed sandbox
// driving the CLI on someone's behalf" (Codex Cloud, Claude Code Web, Cursor
// Background Agents, etc.) without collecting any PII.
//
// We only read:
//   - well-known kernel strings (release(), /proc/version)
//   - sandbox marker files (/.dockerenv etc.)
//   - the *existence* of vendor environment variables — never the value
//     (some are API keys).
//
// Output is two opaque strings: sandbox_runtime ('gvisor' | 'docker' | ...)
// and agent_runtime ('claude_code' | 'codex' | ...). Both null when unknown.
// ---------------------------------------------------------------------------

export type SandboxRuntime = "gvisor" | "firecracker" | "docker" | "kvm" | "wsl" | null;

export type AgentRuntime =
  | "claude_code"
  | "codex"
  | "cursor"
  | "copilot_agent"
  | "replit"
  | "hermes"
  | "openclaw"
  | "pi"
  | "windsurf"
  | "cline"
  | "gemini_cli"
  | "crush"
  | null;

interface VendorRule {
  name: Exclude<AgentRuntime, null>;
  /** Check returns true when the named agent is driving the CLI. */
  check: (env: NodeJS.ProcessEnv) => boolean;
}

// Ordering matters: the FIRST rule that matches wins. Put more specific rules
// before more generic ones (e.g. copilot_agent before a hypothetical generic
// 'github_actions' rule).
const VENDOR_RULES: VendorRule[] = [
  // Anthropic Claude Code — sets CLAUDECODE=1 on every Bash/PowerShell tool
  // spawn (Shell.ts:321) and CLAUDE_CODE_ENTRYPOINT at startup, inherited by
  // every child (main.tsx:527). Both propagate to spawned subprocesses.
  // Source: confirmed by @magi from Claude Code internal source.
  {
    name: "claude_code",
    check: (env) =>
      typeof env["CLAUDECODE"] === "string" || typeof env["CLAUDE_CODE_ENTRYPOINT"] === "string",
  },
  // OpenAI Codex (https://github.com/openai/codex).
  // - CODEX_THREAD_ID — set unconditionally on every spawned shell command
  //   (codex-rs/protocol/src/shell_environment.rs:6 constant, set by
  //   codex-rs/core/src/unified_exec/process_manager.rs:1010 and
  //   codex-rs/core/src/tools/runtimes/mod.rs:164).
  // - CODEX_CI — hardcoded in the UNIFIED_EXEC_ENV array, always set on
  //   every unified-exec child (process_manager.rs:70).
  // - CODEX_SANDBOX_NETWORK_DISABLED — set when network sandbox is active
  //   (codex-rs/core/src/sandboxing/mod.rs:135-138, default-on).
  // CODEX_HOME is deliberately NOT used — it's a config override read at
  // Codex startup, not propagated to spawned subprocesses.
  {
    name: "codex",
    check: (env) =>
      typeof env["CODEX_THREAD_ID"] === "string" ||
      typeof env["CODEX_CI"] === "string" ||
      typeof env["CODEX_SANDBOX_NETWORK_DISABLED"] === "string",
  },
  // Cursor IDE integrated terminal — exports TERM_PROGRAM=cursor.
  // Cursor Background Agent env vars are not publicly documented; if a
  // canonical marker is identified later, add it here.
  {
    name: "cursor",
    check: (env) => env["TERM_PROGRAM"] === "cursor",
  },
  // Windsurf (Codeium) integrated terminal — exports TERM_PROGRAM=windsurf, the
  // direct analog of the Cursor rule above. Attested across many independent
  // detectors (nx packages/nx/src/native/ide/detection.rs, adonisjs/application,
  // ag-grid git-hooks). Compared case-insensitively because sources disagree on
  // casing ("windsurf" vs "Windsurf"). Like Cursor this marks the editor's
  // integrated terminal, not specifically that the Cascade agent is driving;
  // under WSL/remote it can also fall back to TERM_PROGRAM=vscode.
  {
    name: "windsurf",
    check: (env) => env["TERM_PROGRAM"]?.toLowerCase() === "windsurf",
  },
  // GitHub Copilot Coding Agent — runs inside GitHub Actions and the
  // workflow injects an additional marker to distinguish from generic CI.
  // Not yet verified from a public-source citation in this audit; the var
  // names below match GitHub Copilot Coding Agent documentation but
  // should be confirmed before relying on attribution.
  {
    name: "copilot_agent",
    check: (env) =>
      env["GITHUB_ACTIONS"] === "true" &&
      (typeof env["COPILOT_AGENT_ID"] === "string" || env["RUNNER_NAME"] === "Copilot"),
  },
  // Replit — REPL_ID and REPLIT_USER are long-documented environment
  // variables exposed inside every Replit workspace.
  // Source: https://docs.replit.com/replit-workspace/configuring-the-environment
  {
    name: "replit",
    check: (env) => typeof env["REPL_ID"] === "string" || typeof env["REPLIT_USER"] === "string",
  },
  // Nous Research Hermes Agent — cli.py:50 unconditionally executes
  //   os.environ["HERMES_QUIET"] = "1"
  // at module load, so the marker propagates via os.environ to every
  // subprocess spawned by Hermes. Keying on existence (not the literal
  // "1") so we still match if Hermes ever changes the value.
  // Source: https://github.com/NousResearch/hermes-agent (cli.py:50)
  {
    name: "hermes",
    check: (env) => typeof env["HERMES_QUIET"] === "string",
  },
  // openclaw — multi-channel AI gateway. When openclaw spawns a CLI
  // subprocess it builds the child env with OPENCLAW_STATE_DIR /
  // OPENCLAW_CONFIG_PATH / OPENCLAW_DISABLE_AUTO_UPDATE set explicitly
  // (extensions/qa-matrix/src/runners/contract/scenario-runtime-cli.ts:344-351).
  // We key on OPENCLAW_STATE_DIR since it's a path scope-bound to openclaw.
  // Source: https://github.com/openclaw/openclaw
  {
    name: "openclaw",
    check: (env) =>
      typeof env["OPENCLAW_STATE_DIR"] === "string" ||
      typeof env["OPENCLAW_CONFIG_PATH"] === "string",
  },
  // Pi coding agent (https://pi.dev, https://github.com/earendil-works/pi).
  // packages/coding-agent/src/cli.ts:13 unconditionally executes
  //   process.env.PI_CODING_AGENT = "true";
  // at module entry, so every subprocess Pi spawns sees this marker.
  {
    name: "pi",
    check: (env) => typeof env["PI_CODING_AGENT"] === "string",
  },
  // Cline (cline/cline) VS Code extension — injects CLINE_ACTIVE=true into the
  // integrated terminal via vscode.TerminalOptions.env, which the terminal
  // exports to every shell command run in it
  // (apps/vscode/src/hosts/vscode/terminal/VscodeTerminalRegistry.ts:29).
  // Caveat: present only on the default "vscodeTerminal" exec path — the opt-in
  // backgroundExec/YOLO path spawns via child_process without the marker. Same
  // integrated-terminal-only scope as the Cursor/Windsurf rules above.
  // Source: https://github.com/cline/cline (VscodeTerminalRegistry.ts:29)
  {
    name: "cline",
    check: (env) => typeof env["CLINE_ACTIVE"] === "string",
  },
  // Google Gemini CLI (open-source @google/gemini-cli) — DISTINCT from the
  // Gemini managed-agent sandbox. (If a /.agents/ filesystem detector is
  // present in detectAgentRuntime() it runs ahead of this loop and wins for a
  // managed-agent sandbox, leaving this rule to match only the local CLI.)
  // The shell-execution service
  // sets GEMINI_CLI=1 on the child env of every shell command it spawns, so
  // downstream executables can tell they were launched by Gemini CLI
  // (packages/core/src/services/shellExecutionService.ts:56,486-487 — spread
  // onto baseEnv after sanitizeEnvironment, passed as env: to both the
  // child_process and node-pty spawn paths).
  // Caveat: under STRICT sanitization (when GITHUB_SHA is set / the GitHub
  // Action surface) GEMINI_CLI is not allow-listed and gets stripped — reliable
  // for the local CLI, not inside Gemini's GitHub Action runner.
  // Source: https://github.com/google-gemini/gemini-cli (shellExecutionService.ts:56,486-487)
  {
    name: "gemini_cli",
    check: (env) => typeof env["GEMINI_CLI"] === "string",
  },
  // Crush (charmbracelet/crush) — internal/shell/shell.go:43-48,98
  // unconditionally appends CRUSH=1 (plus generic AGENT=crush / AI_AGENT=crush)
  // to the env of every shell it spawns: both the interactive bash tool and the
  // hook runner. We key on CRUSH since AGENT/AI_AGENT are generic and collide.
  // Source: https://github.com/charmbracelet/crush (internal/shell/shell.go:43-48,98)
  {
    name: "crush",
    check: (env) => typeof env["CRUSH"] === "string",
  },
  // OpenHands was evaluated and DROPPED: the OPENHANDS_BUILD_GIT_SHA / _REF
  // ENV exists in the agent-server Dockerfile (base-image-minimal stage, added
  // 2025-11-09 in PR #1100), but it is empirically ABSENT from the runtime env
  // of every published `ghcr.io/openhands/agent-server` image inspected (12+
  // tags spanning 2025-10 through 2026-01, including the merge commit of the PR
  // that introduced it). The declared ENV does not reach the published image,
  // so a rule keyed on it would never fire. Re-add only if a real published
  // image is confirmed to carry the var in `docker inspect .Config.Env`.
];

/**
 * Identify the managed sandbox runtime hosting this CLI invocation.
 * Returns null on a normal developer machine. Dispatches to runtime-specific
 * detectors that each return a boolean; the priority order encoded here is
 * deliberate (WSL > gVisor > Docker > Firecracker > KVM).
 */
export function detectSandboxRuntime(): SandboxRuntime {
  if (platform() === "win32") return null;
  if (detectWSL()) return "wsl";
  if (isGVisor()) return "gvisor";
  if (isDocker()) return "docker";
  if (isFirecracker()) return "firecracker";
  if (isKVM()) return "kvm";
  return null;
}

/**
 * Identify the coding-agent vendor that spawned this process, if any.
 * Returns null on a regular interactive shell. Only checks for the
 * EXISTENCE of well-known env vars — never reads their values.
 */
export function detectAgentRuntime(): AgentRuntime {
  for (const rule of VENDOR_RULES) {
    if (rule.check(process.env)) return rule.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sandbox runtime detectors — one per runtime, kept small and side-effect-free.
// ---------------------------------------------------------------------------

/**
 * gVisor reports kernel string `4.19.0-gvisor` (current) or `4.4.0` (legacy
 * Sentry kernel).
 *
 * `4.19.0-gvisor` is unambiguous — no real Linux box reports that string.
 * `4.4.0` collides with Ubuntu 16.04 LTS / older real kernels, so we only
 * accept it as a gVisor signal when /proc/version ALSO contains "gVisor".
 */
function isGVisor(): boolean {
  const kernel = release();
  if (kernel.includes("gvisor")) return true;
  if (platform() !== "linux") return false;
  try {
    const procVersion = readFileSync("/proc/version", "utf-8");
    return procVersion.includes("gVisor");
  } catch {
    return false;
  }
}

function isDocker(): boolean {
  if (existsSync("/.dockerenv")) return true;
  if (platform() !== "linux") return false;
  try {
    const cgroup = readFileSync("/proc/1/cgroup", "utf-8");
    return cgroup.includes("docker") || cgroup.includes("containerd");
  } catch {
    return false;
  }
}

/**
 * AWS Firecracker microVMs expose /dev/vsock and report sys_vendor='Amazon EC2'
 * with product_name containing 'Firecracker'. Full EC2 reports a real instance
 * type like 't3.large', so the product_name check distinguishes them.
 */
function isFirecracker(): boolean {
  if (platform() !== "linux") return false;
  if (!existsSync("/dev/vsock")) return false;
  try {
    const sysVendor = readFileSync("/sys/class/dmi/id/sys_vendor", "utf-8").trim();
    if (sysVendor !== "Amazon EC2") return false;
    const productName = readFileSync("/sys/class/dmi/id/product_name", "utf-8").trim();
    return productName.toLowerCase().includes("firecracker");
  } catch {
    return false;
  }
}

function isKVM(): boolean {
  if (platform() !== "linux") return false;
  try {
    const sysVendor = readFileSync("/sys/class/dmi/id/sys_vendor", "utf-8").trim();
    return sysVendor === "QEMU" || sysVendor.includes("KVM");
  } catch {
    return false;
  }
}
