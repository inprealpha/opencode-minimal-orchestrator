# OpenCode Minimal Orchestrator

A lightweight orchestration layer for [OpenCode](https://github.com/sst/opencode) that separates signal from noise using focused agent roles and journal-based knowledge sharing — with an optional runtime plugin that enforces safety guards and session resilience through supported OpenCode hooks.

## The Problem

OpenCode's default flat agent system causes context bloat: a single agent accumulates exploration noise, reasoning traces, and implementation details in one conversation, eating through the context window fast. The more complex the task, the worse it gets. Prompt instructions alone can tell agents to be read-only or follow conventions, but they can't enforce those rules at runtime.

## The Solution

Four specialized agents with clear roles, a per-project journal system for verbose reasoning, and explicit shared-context handoff through the orchestrator. A small runtime plugin adds hard enforcement for the safety gaps that prompts alone cannot guarantee. No source modifications to OpenCode: agents install globally, the plugin uses supported hook APIs, and project-specific context lives in markdown files at the project root.

Inspired by [Oh-My-Pi](https://github.com/nicobailon/oh-my-pi)'s philosophy of focused roles and signal-rich returns, but radically simpler than [Oh-My-OpenAgent](https://github.com/nicobailon/oh-my-openagent)'s approach.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ orchestrator                                                │
│ Primary interface, tech lead, delegation hub                │
│ Checks for shared_context.md; reads it when present and useful │
│ Passes only relevant context into sub-agent task prompts     │
│ Avoids reading journal files directly                        │
└────────┬───────────────┬───────────────┬──────────────────────┘
         │               │               │
       task tool       task tool       task tool
         │               │               │       ┌─────────────────────┐
     ┌────▼────┐     ┌────▼────┐     ┌────▼─────┐ │ orchestrator-runtime│
     │ worker  │     │ scout   │     │ reviewer │ │ (plugin hooks)      │
     │ writes  │     │ reads   │     │ reviews  │ │                     │
     │ code    │     │ codebase│     │ changes  │ │ • shell guard       │
     └────┬────┘     └────┬────┘     └────┬─────┘ │ • write guard       │
         │               │               │       │ • compaction recovery│
         └───────────────┴───────────────┘       │ • task tracking     │
                         │                       │ • error annotation  │
                         ▼                       │ • chat injection    │
         ┌──────────────────────────────────┐    └─────────────────────┘
         │ .opencode/journal/              │
         │ Per-project working memory      │
         └──────────────────────────────────┘

shared_context.md is not auto-injected into every sub-agent.
The intended flow is for the orchestrator to load it explicitly, then forward only the context that matters.
```

## Installation

### 1. Install agents globally

```bash
mkdir -p ~/.config/opencode/agents/
cp agent/*.md ~/.config/opencode/agents/
```

### 2. Merge config into your global OpenCode config

Merge the contents of this repository's `opencode.jsonc` into your global OpenCode config, for example `~/.config/opencode/opencode.jsonc` or `~/.config/opencode/opencode.json`.

That file is intentionally minimal and may effectively be empty for many setups. Its main purpose is to document that this orchestrator does not rely on `instructions` auto-injection for shared context, while still allowing config-enforced tool restrictions where you want them. If you want named agent defaults, model selection, or read-only limits in your own setup, add or merge only the `agent` keys you actually need.

If your existing config already defines other OpenCode settings, keep them and merge only the orchestrator-related keys you want.

### 3. Set up each project (optional shared context)

If you want the orchestrator to load project-specific context at session start, copy the shared context template into the target project's root and fill it in:

```bash
cp shared_context.md /path/to/project/
```

Replace the scaffold with the project's architecture, stack, conventions, domain vocabulary, and any persistent guidance the orchestrator should know. This file is optional — the orchestrator and its sub-agents work without it, but it improves quality when present.

### 4. Install the runtime plugin (recommended)

Copy the plugin and custom tool into the project's `.opencode/` directory:

```bash
mkdir -p /path/to/project/.opencode/plugin /path/to/project/.opencode/tool
cp plugin/orchestrator-runtime.ts /path/to/project/.opencode/plugin/
cp tool/poll-tasks.ts /path/to/project/.opencode/tool/
```

OpenCode auto-discovers files in `.opencode/plugin/` and `.opencode/tool/`, so no additional config is needed. The plugin activates on the next OpenCode start.

To disable the runtime without removing files, set `"plugin": []` in your project's `opencode.jsonc`. The system degrades gracefully to pure prompt-driven mode.

### 5. Start OpenCode in that project

The orchestrator prompt tells it to check for `shared_context.md` at session start and read it when present and useful. That is a prompt-level workflow, not a platform guarantee. Sub-agents should not assume the full file was handed to them; the usual flow is for the orchestrator to pass only the relevant context in task prompts. This keeps sub-agent context windows lean without forcing the full file into every task.

## Agents Overview

| Agent | Role | Description |
|-------|------|-------------|
| `orchestrator` | Tech Lead | Breaks down tasks, reads project context, delegates to specialists, and synthesizes results. Handles simple tasks directly. |
| `worker` | Implementer | Executes code changes and runs tests. Writes verbose reasoning to the journal and returns only signal. |
| `scout` | Explorer | Read-focused codebase analysis. Maps dependencies, finds code, and reports compressed findings. Edit access denied by config; shell commands guarded by runtime plugin. |
| `reviewer` | Reviewer | Reviews changes for bugs, security issues, and logic errors. Edit access denied by config; shell commands guarded by runtime plugin. |

## How It Works

1. **Orchestrator receives tasks** from the user and decides how to handle them. Simple tasks stay local; complex ones get delegated.
2. **Orchestrator checks for `shared_context.md` at session start** and reads it when present and useful as supplemental project context.
3. **Sub-agents receive only relevant context** copied into their task prompts, rather than the full shared context file every time.
4. **Sub-agents write verbose reasoning to `.opencode/journal/{agent}-{topic}.md`**, keeping exploration noise out of the orchestrator's context. In practice that usually means names like `scout-auth-architecture.md`, `worker-api-refactor.md`, or `reviewer-security-pass.md`.
5. **Journal enables cross-agent knowledge sharing** inside the project without forcing every detail into every prompt.

### Delegation Guidance

- **Handle directly**: Simple questions, single-file edits, quick lookups, clarifications.
- **Delegate**: Multi-file changes, deep exploration, code review, anything that would bloat orchestrator context.
- **Parallel dispatch**: When tasks are independent, dispatch simultaneously (e.g., two scout lookups).
- **Serial dispatch**: When tasks depend on each other, wait for results before continuing.

## File Structure

```
opencode-minimal-orchestrator/
├── README.md
├── shared_context.md        # Optionally copy to project root, fill in per-project
├── opencode.jsonc           # Merge into ~/.config/opencode/opencode.jsonc
├── agent/
│   ├── orchestrator.md      # Copy to ~/.config/opencode/agents/
│   ├── worker.md
│   ├── scout.md
│   └── reviewer.md
├── plugin/
│   └── orchestrator-runtime.ts  # Copy to <project>/.opencode/plugin/
└── tool/
    └── poll-tasks.ts            # Copy to <project>/.opencode/tool/
```

In each target project, the journal lives at `.opencode/journal/` and is created on first use. The runtime plugin state is persisted at `.opencode/orchestrator-state.json` (gitignored).

## Journal Conventions

- **Location**: `.opencode/journal/` in the project root
- **Naming**: `{agent}-{topic}.md`, for example `scout-api-endpoints.md`, `worker-refactor-auth.md`, or `reviewer-security-pass.md`
- **Structure**: Exploration, reasoning, changes if applicable, open questions
- **Cleanup**: Journal files are working artifacts, not permanent docs. Keep them out of version control if desired.

## Design Philosophy

This project borrows the best ideas from two existing orchestration systems and distills them down:

| Source | What We Took | What We Skipped |
|--------|-------------|-----------------|
| **Oh-My-Pi** | Focused roles, signal-rich returns, simple operating model, read-only exploration patterns | Heavier templating and extra ceremony |
| **Oh-My-OpenAgent** | Multi-agent delegation concept, plugin hook patterns for guards and compaction | Large hook systems, prompt builders, background manager, and operational complexity |

The result is a system that is simple enough to understand quickly, small enough to audit in one sitting, and flexible enough to adapt to different projects.

## Orchestrator Runtime Plugin

The runtime plugin (`plugin/orchestrator-runtime.ts`) bridges the gap between prompt conventions and hard enforcement. It uses only supported OpenCode plugin hooks — no core patches, no unsupported APIs.

### What the Plugin Enforces (Hook-Driven)

| Capability | Hook | What It Does |
|------------|------|-------------|
| **Shell guard** | `tool.execute.before` | Blocks destructive shell commands (`rm -rf`, `mv`, `sudo`, `git push`, etc.) for read-only agents (scout, reviewer). Throws to prevent execution. |
| **Write guard** | `tool.execute.before` | Blocks `write`/`edit`/`apply_patch` to non-journal paths for read-only agents. Journal writes (`.opencode/journal/`) are always allowed. |
| **Task tracking** | `tool.execute.before` + `tool.execute.after` | Records task delegation start/completion in-memory and on disk. Powers the `poll_tasks` custom tool. |
| **Error classification** | `tool.execute.after` | Detects retryable errors (429, 502, 503, timeout, network) and non-retryable errors (disk full, permission denied) in tool output. Appends a clear annotation so the agent can act accordingly. |
| **Compaction recovery** | `experimental.session.compacting` | Injects an `[ORCHESTRATOR RECOVERY CONTEXT]` block into compacted sessions with agent identity, active delegations, journal references, and resume instructions. |
| **Task notifications** | `chat.message` | Injects completed-task notifications into the next chat message so the orchestrator knows when delegated work finishes. |
| **Session tracking** | `event` | Tracks session creation/deletion to maintain agent-to-session mappings and clean up state. |

### What Remains Prompt-Driven

| Capability | Why Not a Hook |
|------------|----------------|
| **Delegation decisions** | Routing logic is the orchestrator agent's core value — prompt instructions handle this well |
| **Journal conventions** | File naming and structure are workflow guidance, not safety-critical |
| **Context handoff** | What context to pass to sub-agents is a judgment call best left to the prompt |
| **Shared context loading** | The orchestrator checks for `shared_context.md` and reads it when present; the prompt drives this |
| **Signal-only returns** | Sub-agent return format is prompt convention, not enforceable by hooks |
| **Automatic retry** | No plugin hook wraps the LLM provider call; error classification is the supported workaround |
| **Model fallback** | Requires deep provider integration not available through plugin hooks |

### Shell Guard Deny Patterns

The following patterns are blocked for read-only agents (`scout`, `reviewer`):

| Pattern | Blocks |
|---------|--------|
| `rm -r` / `rm -rf` | Recursive file deletion |
| `mv` | File move/rename |
| `chmod` / `chown` | Permission and ownership changes |
| `git push` / `git merge` / `git rebase` | Destructive git operations |
| `git reset --hard` / `git clean -f` | Destructive git state changes |
| `> file` (single redirect) | File overwrite via redirect |
| `dd` / `sudo` / `mkfs` | System-level destructive operations |
| `curl ... \| sh` / `wget ... \| sh` | Remote code execution |

**Escape hatch:** Add `# @allow` anywhere in a shell command to bypass the guard. Use sparingly.

### Custom Tool: `poll_tasks`

The `poll_tasks` tool (installed at `.opencode/tool/poll-tasks.ts`) lets any agent query the status of delegated tasks. It reads from the runtime's persisted state file.

Usage (by the orchestrator or any agent):
- Call `poll_tasks` with no arguments to see all tracked tasks
- Call `poll_tasks` with a `task_id` to check a specific task

### Graceful Degradation

The system is designed to work with or without the runtime plugin:

- **With plugin:** Guards are enforced, compaction recovery is injected, task tracking is active, errors are annotated.
- **Without plugin:** Falls back to pure prompt-driven mode. Agent prompts still instruct read-only behavior, but enforcement depends on OpenCode's built-in permission system and agent compliance. Set `"plugin": []` in config to disable.

### Known Limitations

- **`experimental.*` hooks** may change in future OpenCode releases (though OmO's heavy use makes removal unlikely)
- **Agent-to-session mapping** relies on `chat.message` and `event` hooks delivering agent identity; if agent resolution fails, guards default to permissive
- **In-memory state** is supplementary — on crash or restart, the plugin restores from `.opencode/orchestrator-state.json` but some in-flight data may be lost
- **No automatic retry** — the plugin classifies errors but cannot retry LLM calls (that would require provider-level hooks not available in the plugin API)
- **Task tracking is best-effort** — it tracks `task` tool invocations, not the full lifecycle of spawned sub-sessions

## Notes

- **No OpenCode source patches required**: everything is expressed through global agent prompts, per-project markdown files, and supported plugin hooks.
- **No project-level `AGENTS.md` needed**: orchestration behavior is driven by the per-agent prompt files under `~/.config/opencode/agents/`, not by an auto-injected instruction file. This avoids context bloat from duplicate guidance in every prompt.
- **Global install, local context**: agents live in `~/.config/opencode/agents/`, while `shared_context.md` (optional), plugin, tool, and `.opencode/journal/` belong to each project.
- **Lean context by design**: shared context is routed through the orchestrator instead of being auto-injected into every sub-agent.
- **Layered enforcement model**: config-level permission rules deny edit access for scout/reviewer; the runtime plugin enforces shell command guards and write guards via hooks; prompt instructions handle delegation logic and conventions.
- **Model-agnostic**: configure preferred models in your global `~/.config/opencode/opencode.jsonc`.
