# OpenCode Minimal Orchestrator

A lightweight orchestration layer for [OpenCode](https://github.com/sst/opencode) that separates signal from noise using focused agent roles and journal-based knowledge sharing.

## The Problem

OpenCode's default flat agent system causes **context bloat** — a single agent accumulates exploration noise, reasoning traces, and implementation details in one conversation, eating through the context window fast. The more complex the task, the worse it gets.

## The Solution

4 specialized agents with clear roles, a journal system for verbose reasoning, and shared context injection. **Zero source modifications to OpenCode** — everything lives in `.opencode/` config and a couple of markdown files.

Inspired by [Oh-My-Pi](https://github.com/nicobailon/oh-my-pi)'s philosophy of focused roles and signal-rich returns, but radically simpler than [Oh-My-OpenAgent](https://github.com/nicobailon/oh-my-openagent)'s approach (4 agents vs 11, ~10 files vs 1,401).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  @orchestrator (primary)                                     │
│  Delegates tasks, keeps lean context, receives pure signal   │
│  Reads: shared_context.md (auto-injected)                    │
│  Never reads: journal/ (only signal comes back from agents)  │
└────────┬──────────────┬──────────────┬──────────────────────┘
         │              │              │
    task tool       task tool      task tool
         │              │              │
    ┌────▼───┐    ┌────▼───┐    ┌────▼────┐
    │@worker │    │@scout  │    │@reviewer│
    │ impl.  │    │ read-  │    │ code    │
    │ agent  │    │ only   │    │ review  │
    └───┬────┘    └───┬────┘    └───┬─────┘
        │             │             │
        ▼             ▼             ▼
   ┌──────────────────────────────────────┐
   │  .opencode/journal/                   │
   │  Verbose notes, exploration traces,   │
   │  reasoning — greppable by all agents  │
   └──────────────────────────────────────┘
        ▲
        │ (auto-injected into all agent system prompts)
   ┌──────────────────────────────────────┐
   │  shared_context.md                    │
   │  Architecture, conventions, tone,     │
   │  domain knowledge — single source     │
   └──────────────────────────────────────┘
```

## Quick Start

1. **Copy** the `.opencode/` directory and `shared_context.md` into your project root:

   ```bash
   cp -r path/to/opencode-minimal-orchestrator/.opencode your-project/
   cp path/to/opencode-minimal-orchestrator/shared_context.md your-project/
   ```

2. **Edit** `shared_context.md` with your project's architecture, tech stack, conventions, and domain knowledge.

3. **(Optional)** Add the journal directory to your `.gitignore`:

   ```gitignore
   .opencode/journal/*
   !.opencode/journal/.gitkeep
   ```

4. **Start OpenCode** — the orchestrator is now available as `@orchestrator`.

## Agents

| Agent | Role | Description |
|-------|------|-------------|
| `orchestrator` | Tech Lead | Breaks down tasks, delegates to specialists, synthesizes results. Handles simple tasks directly. |
| `worker` | Implementer | Executes code changes, runs tests. Writes reasoning to journal, returns only signal. |
| `scout` | Explorer | Read-only codebase analysis. Maps dependencies, finds code, reports compressed findings. |
| `reviewer` | Reviewer | Reviews changes for bugs, security issues, logic errors. High signal-to-noise output. |

## How It Works

1. **Orchestrator receives tasks** from the user and decides how to handle them — simple tasks are done directly, complex ones are delegated to specialists.

2. **Sub-agents write verbose reasoning to journal** files (`.opencode/journal/{agent}-{topic}.md`), keeping exploration noise out of the orchestrator's context. Only actionable signal is returned.

3. **Shared context is auto-injected** into all agents via OpenCode's `instructions` config. Every agent sees the same project architecture, conventions, and domain knowledge without a tool call.

4. **Journal enables cross-agent knowledge sharing** — any agent can grep `.opencode/journal/` to find context from prior tasks, creating a persistent knowledge base across conversations.

## Customization

- **Edit agent prompts** in `.opencode/agent/*.md` to adjust behavior, tone, or constraints.
- **Modify `shared_context.md`** to keep project context current as your codebase evolves.
- **Adjust permissions** in `.opencode/opencode.jsonc` — e.g., grant or restrict tool access per agent.
- **Add more agents** by creating new `.md` files in `.opencode/agent/`. OpenCode auto-discovers them.

## File Structure

```
your-project/
├── .opencode/
│   ├── opencode.jsonc              # Config: instructions, agent permissions
│   ├── agent/
│   │   ├── orchestrator.md         # Primary orchestrator prompt
│   │   ├── worker.md               # Implementation subagent prompt
│   │   ├── scout.md                # Read-only explorer prompt
│   │   └── reviewer.md            # Code review subagent prompt
│   └── journal/
│       └── .gitkeep                # Subagents write verbose reasoning here
├── shared_context.md               # Project context injected into all agents
└── AGENTS.md                       # Agent catalog & orchestration guidelines
```

## Journal Conventions

- **Naming**: `{agent}-{task-summary}.md` — e.g., `worker-refactor-auth.md`, `scout-api-endpoints.md`
- **Structure**: Exploration → Reasoning → Changes (if applicable) → Open Questions
- **Cleanup**: Journal files are working artifacts, not permanent docs. Clean them up periodically or let `.gitignore` keep them out of version control.

## Design Philosophy

This project borrows the best ideas from two existing orchestration systems and distills them down:

| Source | What We Took | What We Skipped |
|--------|-------------|-----------------|
| **Oh-My-Pi** | Focused roles, signal-rich returns, no ceremonies, read-only scouts | Handlebars templates, JTD schemas, TTSR rules, isolated worktrees |
| **Oh-My-OpenAgent** | Multi-agent delegation concept | 11 agents, 46 hooks, tmux management, dynamic prompt builders, 1,401 files |

The result: a system that's **simple enough to understand in 10 minutes** and **small enough to audit in one sitting**.

## Notes

- **No plugin code needed** — everything works via OpenCode's built-in config, custom agents, and instructions.
- **Model-agnostic** — configure your preferred models in `opencode.jsonc`.
- **Coexists with built-in agents** — `@orchestrator`, `@worker`, `@scout`, and `@reviewer` live alongside OpenCode's default agents.
- **Upgrades independently** — since nothing modifies OpenCode source, the orchestrator upgrades on its own schedule.
