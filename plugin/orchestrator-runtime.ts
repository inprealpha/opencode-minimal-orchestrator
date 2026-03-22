/**
 * Orchestrator Runtime Plugin
 *
 * Minimal hybrid runtime for opencode-minimal-orchestrator (Option B).
 * Enforces safety guards and session resilience through supported OpenCode
 * plugin hooks — everything else remains prompt-driven.
 *
 * Install: copy to <project>/.opencode/plugin/orchestrator-runtime.ts
 * or reference via opencode.jsonc plugin config.
 *
 * Hooks used:
 *   - tool.execute.before  → shell guard, write guard, file-read tracking, task tracking
 *   - tool.execute.after   → task completion tracking, error classification
 *   - experimental.session.compacting → recovery context injection
 *   - chat.message         → agent identification, completed-task notifications
 *   - event                → session lifecycle (create/delete)
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

// ── Types ────────────────────────────────────────────────────────────

interface SessionState {
  agentName: string
  readFiles: Set<string>
  pendingTasks: Map<string, TaskInfo>
  recentPlanItems: string[]
  journalRefs: string[]
}

interface TaskInfo {
  id: string
  callID: string
  description: string
  agent: string
  startedAt: number
  status: "running" | "completed" | "failed"
  result?: string
}

interface ErrorClassification {
  retryable: boolean
  code: string
  hint: string
}

interface SerializedState {
  sessions: Record<
    string,
    {
      agentName: string
      pendingTasks: Record<string, TaskInfo>
    }
  >
  updatedAt: string
}

// ── Constants ────────────────────────────────────────────────────────

const READ_ONLY_AGENTS = new Set(["scout", "reviewer"])

/**
 * Deny patterns for shell commands run by read-only agents.
 * Each entry is [pattern, human-readable label].
 * Add `# @allow` anywhere in a command to bypass the guard.
 */
const SHELL_DENY_PATTERNS: [RegExp, string][] = [
  [/\brm\s+-rf?\b/, "recursive delete"],
  [/\bmv\b/, "move/rename"],
  [/\bchmod\b/, "permission change"],
  [/\bchown\b/, "ownership change"],
  [/\bgit\s+push\b/, "git push"],
  [/\bgit\s+merge\b/, "git merge"],
  [/\bgit\s+rebase\b/, "git rebase"],
  [/\bgit\s+reset\s+--hard\b/, "destructive git reset"],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, "git clean (force)"],
  [/(?:^|[\s;|&(])\d*>\s*[\/~.a-zA-Z_]/, "file overwrite redirect"],
  [/\bdd\b/, "raw disk write"],
  [/\bsudo\b/, "superuser execution"],
  [/\bmkfs\b/, "filesystem creation"],
  [/\bcurl\b[^|]*\|\s*(ba)?sh/, "remote code execution (curl|sh)"],
  [/\bwget\b[^|]*\|\s*(ba)?sh/, "remote code execution (wget|sh)"],
]

const STATE_FILENAME = ".opencode/orchestrator-state.json"

// ── State ────────────────────────────────────────────────────────────

const sessions = new Map<string, SessionState>()
let projectDir = ""

// ── Helpers ──────────────────────────────────────────────────────────

function getOrCreateSession(
  sessionID: string,
  agentName?: string,
): SessionState {
  let state = sessions.get(sessionID)
  if (!state) {
    state = {
      agentName: agentName || "unknown",
      readFiles: new Set(),
      pendingTasks: new Map(),
      recentPlanItems: [],
      journalRefs: [],
    }
    sessions.set(sessionID, state)
  }
  if (agentName && agentName !== "unknown" && state.agentName === "unknown") {
    state.agentName = agentName
  }
  return state
}

function persistState(): void {
  if (!projectDir) return
  try {
    const serialized: SerializedState = {
      sessions: {},
      updatedAt: new Date().toISOString(),
    }
    for (const [sid, state] of sessions) {
      const tasks: Record<string, TaskInfo> = {}
      for (const [tid, task] of state.pendingTasks) {
        tasks[tid] = { ...task }
      }
      serialized.sessions[sid] = {
        agentName: state.agentName,
        pendingTasks: tasks,
      }
    }
    const dir = join(projectDir, ".opencode")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(projectDir, STATE_FILENAME),
      JSON.stringify(serialized, null, 2),
    )
  } catch {
    // Best-effort — don't break the plugin on write failure
  }
}

function restoreState(): void {
  if (!projectDir) return
  try {
    const raw = readFileSync(join(projectDir, STATE_FILENAME), "utf-8")
    const saved: SerializedState = JSON.parse(raw)
    for (const [sid, data] of Object.entries(saved.sessions)) {
      const state = getOrCreateSession(sid, data.agentName)
      for (const [tid, task] of Object.entries(data.pendingTasks)) {
        state.pendingTasks.set(tid, task)
      }
    }
  } catch {
    // No prior state — start fresh
  }
}

// ── Error Classification ─────────────────────────────────────────────

const ERROR_PATTERNS: [RegExp, ErrorClassification][] = [
  [
    /rate.?limit|429|too many requests/i,
    {
      retryable: true,
      code: "RATE_LIMIT",
      hint: "Wait a moment and retry the request",
    },
  ],
  [
    /502|bad gateway/i,
    {
      retryable: true,
      code: "BAD_GATEWAY",
      hint: "Upstream service temporarily unavailable, retry",
    },
  ],
  [
    /503|service unavailable/i,
    {
      retryable: true,
      code: "SERVICE_UNAVAILABLE",
      hint: "Service temporarily unavailable, retry",
    },
  ],
  [
    /timeout|timed?\s*out|etimedout/i,
    {
      retryable: true,
      code: "TIMEOUT",
      hint: "Operation timed out, retry or simplify the approach",
    },
  ],
  [
    /econnreset|econnrefused|network.?error/i,
    {
      retryable: true,
      code: "NETWORK_ERROR",
      hint: "Network error, retry after a brief pause",
    },
  ],
  [
    /enospc|no space left/i,
    {
      retryable: false,
      code: "DISK_FULL",
      hint: "Disk full — free space before retrying",
    },
  ],
  [
    /permission denied|eacces/i,
    {
      retryable: false,
      code: "PERMISSION_DENIED",
      hint: "Insufficient permissions for this operation",
    },
  ],
]

function classifyError(output: string): ErrorClassification | null {
  for (const [pattern, classification] of ERROR_PATTERNS) {
    if (pattern.test(output)) return classification
  }
  return null
}

// ── Guards ────────────────────────────────────────────────────────────

function shellGuard(
  input: { tool: string; sessionID: string },
  output: { args: any },
): void {
  if (input.tool !== "bash") return

  const state = sessions.get(input.sessionID)
  if (!state || !READ_ONLY_AGENTS.has(state.agentName)) return

  const command: string = output.args?.command || ""
  if (!command) return

  // Escape hatch: annotate a command with `# @allow` to bypass
  if (command.includes("# @allow")) return

  for (const [pattern, label] of SHELL_DENY_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(
        `[orchestrator-runtime] Shell guard blocked: "${command.slice(0, 120)}" ` +
          `(${label}) — agent "${state.agentName}" is read-only. ` +
          `Read-only agents cannot run commands that modify files or repository state.`,
      )
    }
  }
}

function writeGuard(
  input: { tool: string; sessionID: string },
  output: { args: any },
): void {
  if (
    input.tool !== "write" &&
    input.tool !== "edit" &&
    input.tool !== "apply_patch"
  )
    return

  const filePath: string =
    output.args?.filePath || output.args?.file || output.args?.path || ""
  if (!filePath) return

  // Always allow journal writes
  if (filePath.includes(".opencode/journal/")) return

  const state = sessions.get(input.sessionID)
  if (!state) return

  // Read-only agents: block all non-journal writes
  if (READ_ONLY_AGENTS.has(state.agentName)) {
    throw new Error(
      `[orchestrator-runtime] Write guard blocked: agent "${state.agentName}" ` +
        `cannot write to "${filePath}". ` +
        `Read-only agents may only write to .opencode/journal/.`,
    )
  }
}

// ── Plugin Entry ─────────────────────────────────────────────────────

const plugin: Plugin = async (ctx) => {
  projectDir = ctx.directory || ""
  restoreState()

  return {
    // ── Session lifecycle tracking ─────────────────────────────────
    event: async (input) => {
      const event = input.event as any
      const type: string = event?.type || ""
      const info = event?.properties || event?.info || {}

      if (type === "session.created") {
        const sessionID = info.id || info.sessionID
        const agent = info.agent || ""
        if (sessionID) {
          getOrCreateSession(sessionID, agent)
          persistState()
        }
      }

      if (type === "session.deleted") {
        const sessionID = info.id || info.sessionID
        if (sessionID) {
          // Mark child-session tasks as completed in parent sessions
          for (const [, parentState] of sessions) {
            for (const [, task] of parentState.pendingTasks) {
              if (task.id === sessionID) {
                task.status = "completed"
              }
            }
          }
          sessions.delete(sessionID)
          persistState()
        }
      }
    },

    // ── Pre-execution: guards + tracking ───────────────────────────
    "tool.execute.before": async (input, output) => {
      // Safety guards
      shellGuard(input, output)
      writeGuard(input, output)

      // Track file reads (for write-guard read-permission awareness)
      if (input.tool === "read" || input.tool === "view") {
        const filePath =
          output.args?.filePath || output.args?.file || output.args?.path || ""
        if (filePath) {
          const state = getOrCreateSession(input.sessionID)
          state.readFiles.add(filePath)
        }
      }

      // Track journal references
      if (
        input.tool === "write" ||
        input.tool === "edit" ||
        input.tool === "apply_patch"
      ) {
        const filePath =
          output.args?.filePath || output.args?.file || output.args?.path || ""
        if (filePath?.includes(".opencode/journal/")) {
          const state = getOrCreateSession(input.sessionID)
          if (!state.journalRefs.includes(filePath)) {
            state.journalRefs.push(filePath)
          }
        }
      }

      // Track task delegation
      if (input.tool === "task") {
        const state = getOrCreateSession(input.sessionID)
        const description =
          output.args?.prompt?.slice(0, 200) ||
          output.args?.description ||
          "unnamed task"
        const agent = output.args?.agent || "unknown"
        state.pendingTasks.set(input.callID, {
          id: input.callID,
          callID: input.callID,
          description,
          agent,
          startedAt: Date.now(),
          status: "running",
        })
        persistState()
      }
    },

    // ── Post-execution: completion tracking + error annotation ─────
    "tool.execute.after": async (input, output) => {
      // Mark completed tasks
      if (input.tool === "task") {
        const state = sessions.get(input.sessionID)
        if (state) {
          const task = state.pendingTasks.get(input.callID)
          if (task) {
            task.status = "completed"
            task.result = (output.output || "").slice(0, 500)
            persistState()
          }
        }
      }

      // Error classification — annotate tool output with retry guidance
      if (output.output && typeof output.output === "string") {
        const classification = classifyError(output.output)
        if (classification) {
          const tag = classification.retryable
            ? "⚠️ RETRYABLE ERROR"
            : "🛑 NON-RETRYABLE ERROR"
          output.output += `\n\n${tag} (${classification.code}): ${classification.hint}`
        }
      }
    },

    // ── Compaction recovery injection ──────────────────────────────
    "experimental.session.compacting": async (input, output) => {
      const state = sessions.get(input.sessionID)
      if (!state) return

      const running = Array.from(state.pendingTasks.values()).filter(
        (t) => t.status === "running",
      )

      const lines = [
        "[ORCHESTRATOR RECOVERY CONTEXT]",
        `Agent: ${state.agentName}`,
      ]

      if (running.length > 0) {
        lines.push(
          `Active delegations: ${running
            .map((t) => `${t.agent}(${t.description.slice(0, 60)})`)
            .join(", ")}`,
        )
      } else {
        lines.push("Active delegations: none")
      }

      if (state.recentPlanItems.length > 0) {
        lines.push(
          `Recent plan items: ${state.recentPlanItems.slice(-3).join(" → ")}`,
        )
      }

      if (state.journalRefs.length > 0) {
        lines.push(`Journal references: ${state.journalRefs.join(", ")}`)
      }

      lines.push(
        "Resume instruction: Continue from where you left off. Check .opencode/journal/ for detailed state if needed.",
      )

      output.context.push(lines.join("\n"))
    },

    // ── Chat message: agent tracking + task notifications ──────────
    "chat.message": async (input, output) => {
      // Use agent field from chat.message to resolve session→agent mapping
      if (input.agent) {
        const agentName =
          typeof input.agent === "string"
            ? input.agent
            : (input.agent as any)?.name
        if (agentName) {
          getOrCreateSession(input.sessionID, agentName)
        }
      }

      const state = sessions.get(input.sessionID)
      if (!state) return

      // Inject completed-task notifications into the next message
      const completed = Array.from(state.pendingTasks.values()).filter(
        (t) => t.status === "completed",
      )
      if (completed.length === 0) return

      const notifications = completed
        .map(
          (t) =>
            `✅ Task completed: ${t.agent} — ${t.description.slice(0, 100)}`,
        )
        .join("\n")

      output.parts.push({
        type: "text",
        text: `\n[Background Task Updates]\n${notifications}\n`,
      } as any)

      // Clear injected notifications from the registry
      for (const task of completed) {
        state.pendingTasks.delete(task.callID)
      }
      persistState()
    },
  }
}

export default plugin
