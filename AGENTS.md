# Orchestration System

A minimal orchestration layer for OpenCode: 4 agents with focused roles, journal-based knowledge sharing, and signal/noise separation. The orchestrator delegates, workers execute, and context stays lean.

`AGENTS.md` lives in the project root, is auto-discovered by OpenCode, and is visible to all agents. Custom agent prompt files are installed globally at `~/.config/opencode/agent/`.

## Available Agents

| Agent | Role | When to Use |
|-------|------|-------------|
| `@orchestrator` | Tech lead, primary agent | User talks to this. It reads `shared_context.md` at session start, decides what to do directly, and delegates complex tasks. |
| `@worker` | Implementation | Multi-file changes, code writing, test running |
| `@scout` | Read-only explorer | Finding code, analyzing architecture, mapping dependencies |
| `@reviewer` | Code review | Reviewing changes for bugs, security, logic errors |

## Delegation Guidelines

**When to delegate vs handle directly:**

- **Handle directly**: Simple questions, single-file edits, quick lookups, clarifications.
- **Delegate**: Multi-file changes, tasks requiring deep exploration, code review, anything that would bloat orchestrator context.

**How to delegate:**

Use the `task` tool to call sub-agents:

```
task("@worker", "implement the auth module with JWT tokens in src/auth/")
task("@scout", "map all database query patterns across the codebase")
task("@reviewer", "review the changes in src/auth/ for security issues")
```

When delegating, the orchestrator should include only the relevant project context from `shared_context.md` in the task prompt. Sub-agents do not automatically receive `shared_context.md`; they only see what the orchestrator includes.

**Parallel dispatch** — when tasks are independent, dispatch simultaneously:

```
task("@scout", "find all API route definitions")
task("@scout", "find all database migration files")
```

**Serial dispatch** — when tasks depend on each other, wait for results:

```
result = task("@scout", "find the auth middleware implementation")
task("@worker", "refactor auth middleware based on: {result}")
```

## Shared Context

**File**: `shared_context.md`

- The orchestrator reads this file explicitly at session start.
- It is the single source of truth for project knowledge: tech stack, conventions, architecture decisions, and domain context.
- Relevant pieces should be passed down to sub-agents inside task prompts.
- Sub-agents do not have direct access to `shared_context.md` unless the orchestrator includes that information.
- Keep it concise so delegated prompts stay focused.

## Journal System

**Location**: `.opencode/journal/`

This journal directory is per-project. It is created at the project root the first time it is used.

**Purpose**: Verbose reasoning, exploration notes, and detailed analysis go here, not in agent returns. This keeps orchestrator context lean while preserving full working history.

**Rules**:

- **Naming convention**: `{agent}-{task-summary}.md` (for example, `scout-auth-architecture.md`, `worker-api-refactor.md`)
- **Who writes**: Any sub-agent during task execution
- **Who reads**: Any agent can grep journal files for cross-task context
- **Orchestrator should not read journal files directly**: sub-agents extract and return only what matters
- **Cleanup**: Journal files are working artifacts and can be cleaned periodically without losing critical information

## Signal-Only Returns

Sub-agents return only high-signal information:

- What changed (files modified, functions added or removed)
- Blockers encountered
- Critical decisions made and why
- Verbose reasoning belongs in the journal
- Full file contents are unnecessary if the path is given
- Step-by-step narration belongs in the journal

This keeps the orchestrator's context window focused on decisions and progress, not noise.
