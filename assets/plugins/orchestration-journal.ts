import * as fs from "node:fs/promises"
import * as path from "node:path"

const SHARED_TEMPLATE = [
  "# Shared Context",
  "",
  "## Mission",
  "",
  "## Architecture",
  "",
  "## Conventions",
  "",
  "## Decisions",
].join("\n")

const RUN_TEMPLATE = [
  "# <run title>",
  "",
  "- run_id: <run_id>",
  "- agent: orchestrator",
  "- mode: <direct|delegated|switched>",
  "- status: <planned|in_progress|completed|blocked>",
  "- task: <plain-language task>",
  "- files: <comma-separated paths or none>",
  "",
  "## Triage",
  "",
  "## Mode Decision",
  "",
  "## Summary",
  "",
  "## Child Journal Index",
  "",
  "## Decisions",
  "",
  "## Shared Context Promotions",
  "",
  "## Validation",
  "",
  "## Open Questions",
].join("\n")

const CHILD_TEMPLATE = [
  "# <short title>",
  "",
  "- run_id: <run_id>",
  "- entry: <step-01|step-02>",
  "- agent: <explore|worker|reviewer>",
  "- status: <planned|in_progress|completed|blocked>",
  "- task: <plain-language task>",
  "- parent_session: <session id if known>",
  "- child_session: <session id if known>",
  "- tags: <comma-separated tags>",
  "- files: <comma-separated paths or none>",
  "",
  "## Summary",
  "",
  "## Findings",
  "",
  "## Decisions",
  "",
  "## Files",
  "",
  "## Commands",
  "",
  "## Validation",
  "",
  "## Open Questions",
  "",
  "## Proposed Shared Context Updates",
].join("\n")

const SIGNAL_TEMPLATE = [
  "RESULT: completed",
  "JOURNAL: .journal/run-<run_id>-step-<nn>-<agent>-<slug>.md",
  "FILES: path/one, path/two",
  "SIGNAL:",
  "- high-signal finding",
  "BLOCKERS:",
  "- none",
  "NEXT:",
  "- optional next step",
].join("\n")

function is_command(value: string) {
  return value === "work" || value === "research" || value === "review"
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function slug(value: string) {
  const text = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")

  return text.slice(0, 48).replace(/-+$/g, "") || "task"
}

function desc(cmd: string, args: string) {
  const words = `${cmd} ${args}`.trim().split(/\s+/).filter(Boolean).slice(0, 5)
  return words.join(" ") || cmd
}

function body(text: string) {
  return text.trim() || "(no task text was supplied)"
}

function task_body(text: string) {
  const match = text.match(/<task_result>\s*([\s\S]*?)\s*<\/task_result>/)
  return match ? match[1].trim() : text.trim()
}

export const OrchestrationJournal = async (ctx: { worktree: string }) => {
  const roots = new Map<string, any>()
  const runs = new Map<string, any>()
  const assigned = new Map<string, string>()

  function rel(file: string) {
    return path.relative(ctx.worktree, file).split(path.sep).join("/") || path.basename(file)
  }

  async function boot() {
    const dir = path.join(ctx.worktree, ".journal")
    const shared = path.join(dir, "shared-context.md")

    await fs.mkdir(dir, { recursive: true })
    try {
      await Bun.file(shared).text()
    } catch {
      await Bun.write(shared, SHARED_TEMPLATE + "\n")
    }

    return { dir, shared }
  }

  async function make(cmd: "work" | "research" | "review", args: string) {
    const booted = await boot()
    const id = stamp()
    const file =
      cmd === "work"
        ? `run-${id}-orchestrator-${slug(args || cmd)}.md`
        : cmd === "research"
          ? `run-${id}-step-01-explore-${slug(args || cmd)}.md`
          : `run-${id}-step-01-reviewer-${slug(args || cmd)}.md`

    return {
      id,
      cmd,
      dir: booted.dir,
      shared: booted.shared,
      root: path.join(booted.dir, file),
      step: cmd === "work" ? 0 : 1,
      pending: [],
      recent: [],
      mode: undefined as string | undefined,
    }
  }

  function next(run: any, agent: string, task: string) {
    run.step += 1
    const step = String(run.step).padStart(2, "0")
    return path.join(run.dir, `run-${run.id}-step-${step}-${agent}-${slug(task || agent)}.md`)
  }

  function work_prompt(run: any, prompt: string) {
    return [
      "You are running the `/work` command inside a child orchestrator session.",
      "",
      "Journal protocol:",
      `- run_id: ${run.id}`,
      `- journal_dir: ${rel(run.dir)}`,
      `- shared_context: ${rel(run.shared)}`,
      `- assigned_run_journal: ${rel(run.root)}`,
      "",
      "Rules:",
      `- read \`${rel(run.shared)}\` first`,
      `- create \`${rel(run.root)}\` if it does not exist and keep it updated with the template below`,
      "- start with a short triage and an explicit mode decision",
      "- choose direct mode when the target is clear, the change is tightly bounded, and delegation would add more overhead than value",
      "- choose delegated mode when scope is unclear, work crosses boundaries, multiple concerns are entangled, or review separation would keep context smaller",
      "- if a direct run expands, switch to delegated mode and record the switch in the run journal",
      "- delegate only to `explore`, `worker`, and `reviewer`",
      "- child task journal paths will be assigned automatically when you use `task`",
      `- only you may edit \`${rel(run.shared)}\``,
      "- keep detailed notes in journal files and keep the final reply concise",
      "- use relative `.journal/...` paths when writing journal files",
      "",
      "Run journal template:",
      "```md",
      RUN_TEMPLATE,
      "```",
      "",
      "Assignment:",
      body(prompt),
    ].join("\n")
  }

  function entry_prompt(run: any, prompt: string) {
    const label = run.cmd === "research" ? "/research" : "/review"
    const stance = run.cmd === "research" ? "- stay read-heavy apart from the journal file" : "- stay read-only apart from the journal file"

    return [
      `You are running the \`${label}\` command inside a child session.`,
      "",
      "Journal protocol:",
      `- run_id: ${run.id}`,
      `- journal_dir: ${rel(run.dir)}`,
      `- shared_context: ${rel(run.shared)}`,
      `- assigned_journal: ${rel(run.root)}`,
      "",
      "Rules:",
      `- read \`${rel(run.shared)}\` first`,
      stance,
      `- write detailed notes to \`${rel(run.root)}\` using the template below`,
      "- answer the user directly with a concise synthesis after the journal is updated",
      "- do not return a compact signal block for this top-level command",
      `- if something stable should be promoted, put it under \`## Proposed Shared Context Updates\` in \`${rel(run.root)}\` instead of editing \`${rel(run.shared)}\``,
      "- use relative `.journal/...` paths when writing journal files",
      "",
      "Journal template:",
      "```md",
      CHILD_TEMPLATE,
      "```",
      "",
      "Assignment:",
      body(prompt),
    ].join("\n")
  }

  function child_prompt(run: any, journal: string, prompt: string) {
    return [
      "You are working inside a journaled orchestration run.",
      "",
      "Protocol:",
      `- run_id: ${run.id}`,
      `- journal_dir: ${rel(run.dir)}`,
      `- shared_context: ${rel(run.shared)}`,
      `- run_journal: ${rel(run.root)}`,
      `- assigned_journal: ${rel(journal)}`,
      "",
      "Rules:",
      `- read \`${rel(run.shared)}\` before major work`,
      "- grep `.journal/*.md` only when relevant; do not bulk-read the whole journal folder",
      `- write full detail to \`${rel(journal)}\` using the template below`,
      `- if something stable should be promoted, put it under \`## Proposed Shared Context Updates\` in \`${rel(journal)}\` instead of editing \`${rel(run.shared)}\``,
      "- return only the compact signal block shown below and nothing else",
      "- use relative `.journal/...` paths when writing journal files",
      "",
      "Journal template:",
      "```md",
      CHILD_TEMPLATE,
      "```",
      "",
      "Signal contract:",
      "```text",
      SIGNAL_TEMPLATE,
      "```",
      "",
      "Assignment:",
      body(prompt),
    ].join("\n")
  }

  function parse_signal(text: string) {
    const raw = task_body(text)
    if (!raw.includes("RESULT:") || !raw.includes("JOURNAL:")) return

    const groups = {
      SIGNAL: [] as string[],
      BLOCKERS: [] as string[],
      NEXT: [] as string[],
    }

    let result = ""
    let journal = ""
    let files = ""
    let part: "SIGNAL" | "BLOCKERS" | "NEXT" | undefined

    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim()
      if (!text) continue
      if (text.startsWith("RESULT:")) {
        result = text.slice(7).trim()
        part = undefined
        continue
      }
      if (text.startsWith("JOURNAL:")) {
        journal = text.slice(8).trim()
        part = undefined
        continue
      }
      if (text.startsWith("FILES:")) {
        files = text.slice(6).trim()
        part = undefined
        continue
      }
      if (text === "SIGNAL:") {
        part = "SIGNAL"
        continue
      }
      if (text === "BLOCKERS:") {
        part = "BLOCKERS"
        continue
      }
      if (text === "NEXT:") {
        part = "NEXT"
        continue
      }
      if (!part || !text.startsWith("- ")) continue
      groups[part].push(text.slice(2).trim())
    }

    if (!result || !journal) return

    return {
      result,
      journal,
      files,
      signal: groups.SIGNAL,
      blockers: groups.BLOCKERS.filter((item) => item.toLowerCase() !== "none"),
      next: groups.NEXT,
    }
  }

  async function read_mode(run: any) {
    if (run.cmd !== "work") return
    if (run.mode) return run.mode

    const text = await Bun.file(run.root).text().catch(() => "")
    const match = text.match(/^- mode: (.+)$/m)
    if (!match) return
    run.mode = match[1].trim()
    return run.mode
  }

  function compact(run: any, journal: string, mode?: string) {
    const lines = [
      "Orchestration state:",
      `- run_id: ${run.id}`,
      `- journal_dir: ${run.dir}`,
      `- shared_context: ${run.shared}`,
      `- assigned_journal: ${journal}`,
      `- run_journal: ${run.root}`,
    ]

    if (mode) lines.push(`- last_mode: ${mode}`)
    if (!run.recent.length) return lines.join("\n")

    lines.push("", "Recent child signals:")
    for (const item of run.recent) {
      lines.push(`- ${item.result} | ${item.journal}${item.files ? ` | ${item.files}` : ""}`)
      for (const signal of item.signal.slice(0, 4)) {
        lines.push(`  - ${signal}`)
      }
      if (item.blockers.length) {
        lines.push(`  - blockers: ${item.blockers.join("; ")}`)
      }
    }

    return lines.join("\n")
  }

  return {
    event: async ({ event }: any) => {
      if (event.type === "session.created") {
        const info = event.properties.info
        if (!info.parentID) return

        const root = roots.get(info.parentID)
        if (root) {
          roots.delete(info.parentID)
          runs.set(info.id, root)
          assigned.set(info.id, root.root)
          return
        }

        const run = runs.get(info.parentID)
        const next_item = run?.pending.shift()
        if (!run || !next_item) return
        runs.set(info.id, run)
        assigned.set(info.id, next_item.journal)
        return
      }

      if (event.type === "session.deleted") {
        const id = event.properties.info.id
        roots.delete(id)
        runs.delete(id)
        assigned.delete(id)
      }
    },
    "command.execute.before": async (input: any, output: any) => {
      if (!is_command(input.command)) return

      const part = output.parts.find((item: any) => item.type === "subtask")
      if (!part || part.type !== "subtask") return

      const run = await make(input.command, input.arguments)
      roots.set(input.sessionID, run)

      part.description = desc(input.command, input.arguments)
      part.prompt = input.command === "work" ? work_prompt(run, part.prompt) : entry_prompt(run, part.prompt)
    },
    "tool.execute.before": async (input: any, output: any) => {
      if (input.tool !== "task") return
      if (!output.args || typeof output.args.prompt !== "string") return
      if (typeof output.args.subagent_type !== "string") return

      if (
        typeof output.args.command === "string" &&
        is_command(output.args.command) &&
        roots.has(input.sessionID)
      ) {
        return
      }

      const run = runs.get(input.sessionID)
      if (!run) return

      const journal = next(run, output.args.subagent_type, String(output.args.description ?? "task"))
      run.pending.push({ journal })
      output.args.prompt = child_prompt(run, journal, output.args.prompt)
    },
    "tool.execute.after": async (input: any, output: any) => {
      if (input.tool !== "task") return

      const run = runs.get(input.sessionID)
      if (!run) return

      const child = output?.metadata?.sessionId
      if (typeof child !== "string" && run.pending.length > 0) {
        run.pending.shift()
      }

      if (!output?.output || typeof output.output !== "string") return

      const signal = parse_signal(output.output)
      if (!signal) return

      run.recent.unshift(signal)
      run.recent = run.recent.slice(0, 6)
    },
    "experimental.session.compacting": async (input: any, output: any) => {
      const run = runs.get(input.sessionID)
      if (!run) return
      const journal = assigned.get(input.sessionID) ?? run.root
      output.context.push(compact(run, journal, await read_mode(run)))
    },
    "shell.env": async (input: any, output: any) => {
      if (!input.sessionID) return
      const run = runs.get(input.sessionID)
      if (!run) return

      output.env.ORCH_JOURNAL_DIR = run.dir
      output.env.ORCH_SHARED_CONTEXT_FILE = run.shared
      output.env.ORCH_RUN_ID = run.id
      output.env.ORCH_RUN_JOURNAL_FILE = run.root
      output.env.ORCH_ASSIGNED_JOURNAL_FILE = assigned.get(input.sessionID) ?? run.root
    },
  }
}

export default OrchestrationJournal
