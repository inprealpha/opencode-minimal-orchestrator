/**
 * poll_tasks — Custom tool for querying delegated task status.
 *
 * Reads from the orchestrator runtime's persisted state file to report
 * on running and recently completed tasks. Available to any agent but
 * primarily intended for the orchestrator.
 *
 * Install: copy to <project>/.opencode/tool/poll-tasks.ts
 */

import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const poll_tasks = tool({
  description:
    "Check the status of delegated background tasks tracked by the orchestrator runtime. " +
    "Returns a list of running and recently completed tasks with their agent, description, " +
    "and elapsed time. Use without arguments to see all tasks, or pass a task_id for a specific one.",
  args: {
    task_id: tool.schema
      .string()
      .optional()
      .describe("Optional: specific task ID to query"),
  },
  async execute(
    args: { task_id?: string },
    ctx: { directory: string },
  ) {
    const stateFile = join(ctx.directory, ".opencode/orchestrator-state.json")

    let state: any
    try {
      const raw = readFileSync(stateFile, "utf-8")
      state = JSON.parse(raw)
    } catch {
      return "No task state available. The orchestrator runtime may not have tracked any tasks yet."
    }

    const tasks: any[] = []
    const now = Date.now()

    for (const [sessionID, session] of Object.entries(
      state.sessions || {},
    )) {
      const pendingTasks = (session as any).pendingTasks || {}
      for (const [taskID, task] of Object.entries(pendingTasks)) {
        if (args.task_id && taskID !== args.task_id) continue
        const t = task as any
        tasks.push({
          taskID,
          sessionID,
          agent: t.agent,
          description: t.description,
          status: t.status,
          elapsed: `${Math.round((now - t.startedAt) / 1000)}s`,
          result: t.result ? t.result.slice(0, 200) : undefined,
        })
      }
    }

    if (tasks.length === 0) {
      return args.task_id
        ? `No task found with ID "${args.task_id}".`
        : "No tracked tasks found."
    }

    const running = tasks.filter((t) => t.status === "running")
    const completed = tasks.filter((t) => t.status === "completed")
    const failed = tasks.filter((t) => t.status === "failed")

    const sections: string[] = []

    if (running.length > 0) {
      sections.push(
        `Running (${running.length}):`,
        ...running.map(
          (t) => `  • [${t.agent}] ${t.description} (${t.elapsed})`,
        ),
      )
    }

    if (completed.length > 0) {
      sections.push(
        `Completed (${completed.length}):`,
        ...completed.map(
          (t) => `  ✅ [${t.agent}] ${t.description} (${t.elapsed})`,
        ),
      )
    }

    if (failed.length > 0) {
      sections.push(
        `Failed (${failed.length}):`,
        ...failed.map(
          (t) => `  ❌ [${t.agent}] ${t.description} (${t.elapsed})`,
        ),
      )
    }

    if (sections.length === 0) {
      return "No tracked tasks found."
    }

    return sections.join("\n")
  },
})
