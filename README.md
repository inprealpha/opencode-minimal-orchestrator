# OpenCode Minimal Orchestrator

A lightweight orchestration layer for [OpenCode](https://github.com/sst/opencode) that separates signal from noise using focused agent roles and journal-based knowledge sharing.

## The Problem

OpenCode's default flat agent system causes context bloat: a single agent accumulates exploration noise, reasoning traces, and implementation details in one conversation, eating through the context window fast. The more complex the task, the worse it gets.

## The Solution

Four specialized agents with clear roles, a per-project journal system for verbose reasoning, and explicit shared-context handoff through the orchestrator. There are zero source modifications to OpenCode: agents install globally, while project-specific context lives in a few markdown files at the project root.

Inspired by [Oh-My-Pi](https://github.com/nicobailon/oh-my-pi)'s philosophy of focused roles and signal-rich returns, but radically simpler than [Oh-My-OpenAgent](https://github.com/nicobailon/oh-my-openagent)'s approach.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ orchestrator                                                │
│ Primary interface, tech lead, delegation hub                │
│ Prompted to load shared_context.md explicitly at session start │
│ Passes only relevant context into sub-agent task prompts     │
│ Avoids reading journal files directly                        │
└────────┬───────────────┬───────────────┬──────────────────────┘
         │               │               │
       task tool       task tool       task tool
         │               │               │
     ┌────▼────┐     ┌────▼────┐     ┌────▼─────┐
     │ worker  │     │ scout   │     │ reviewer │
     │ writes  │     │ reads   │     │ reviews  │
     │ code    │     │ codebase│     │ changes  │
     └────┬────┘     └────┬────┘     └────┬─────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
                         ▼
         ┌──────────────────────────────────────┐
         │ .opencode/journal/                   │
         │ Per-project working memory for       │
         │ notes, traces, and verbose reasoning │
         └──────────────────────────────────────┘

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

### 3. Set up each project

Copy these files into the target project's root:

```bash
cp AGENTS.md /path/to/project/
cp shared_context.md /path/to/project/
```

Then replace the scaffold in `shared_context.md` with the project's architecture, stack, conventions, domain vocabulary, and any persistent guidance the orchestrator should know.

### 4. Start OpenCode in that project

The orchestrator prompt tells it to read `shared_context.md` explicitly at session start. That is a prompt-level workflow, not a platform guarantee. Sub-agents should not assume the full file was handed to them; the usual flow is for the orchestrator to pass only the relevant context in task prompts. This keeps sub-agent context windows lean without forcing the full file into every task.

## Agents Overview

| Agent | Role | Description |
|-------|------|-------------|
| `orchestrator` | Tech Lead | Breaks down tasks, reads project context, delegates to specialists, and synthesizes results. Handles simple tasks directly. |
| `worker` | Implementer | Executes code changes and runs tests. Writes verbose reasoning to the journal and returns only signal. |
| `scout` | Explorer | Read-focused codebase analysis. Maps dependencies, finds code, and reports compressed findings. The provided `opencode.jsonc` denies normal edit access, while shell discipline remains prompt-driven. |
| `reviewer` | Reviewer | Reviews changes for bugs, security issues, and logic errors. The provided `opencode.jsonc` denies normal edit access, while shell discipline remains prompt-driven. |

## How It Works

1. **Orchestrator receives tasks** from the user and decides how to handle them. Simple tasks stay local; complex ones get delegated.
2. **Orchestrator is prompted to read `shared_context.md` explicitly** at session start and use it as its shared project reference.
3. **Sub-agents receive only relevant context** copied into their task prompts, rather than the full shared context file every time.
4. **Sub-agents write verbose reasoning to `.opencode/journal/{agent}-{topic}.md`**, keeping exploration noise out of the orchestrator's context. In practice that usually means names like `scout-auth-architecture.md`, `worker-api-refactor.md`, or `reviewer-security-pass.md`.
5. **Journal enables cross-agent knowledge sharing** inside the project without forcing every detail into every prompt.

## File Structure

```
opencode-minimal-orchestrator/
├── README.md
├── AGENTS.md                # Copy to project root
├── shared_context.md        # Copy to project root, fill in per-project
├── opencode.jsonc           # Merge into ~/.config/opencode/opencode.jsonc
└── agent/
    ├── orchestrator.md      # Copy to ~/.config/opencode/agents/
    ├── worker.md
    ├── scout.md
    └── reviewer.md
```

In each target project, the journal lives at `.opencode/journal/` and is created on first use.

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
| **Oh-My-OpenAgent** | Multi-agent delegation concept | Large hook systems, prompt builders, and operational complexity |

The result is a system that is simple enough to understand quickly, small enough to audit in one sitting, and flexible enough to adapt to different projects.

## Notes

- **No OpenCode source patches required**: everything is expressed through global agent prompts plus per-project markdown files.
- **Global install, local context**: agents live in `~/.config/opencode/agents/`, while `AGENTS.md`, `shared_context.md`, and `.opencode/journal/` belong to each project.
- **Lean context by design**: shared context is routed through the orchestrator instead of being auto-injected into every sub-agent.
- **Mixed enforcement model**: journal habits and context handoff are prompt conventions; the provided config denies normal edit access for scout/reviewer, but shell discipline is still largely prompt- and permission-driven.
- **Model-agnostic**: configure preferred models in your global `~/.config/opencode/opencode.jsonc`.
