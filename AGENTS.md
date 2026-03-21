# Orchestration System

A minimal orchestration layer for OpenCode: 4 agents with focused roles, journal-based knowledge sharing, and signal/noise separation. The orchestrator delegates; workers execute; context stays lean.

## Available Agents

| Agent | Role | When to Use |
|-------|------|-------------|
| `@orchestrator` | Tech lead, primary agent | User talks to this. Delegates complex tasks. |
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

## Journal System

**Location**: `.opencode/journal/`

**Purpose**: Verbose reasoning, exploration notes, and detailed analysis go here — not in agent returns. This keeps orchestrator context lean while preserving full working history.

**Rules**:

- **Naming convention**: `{agent}-{task-summary}.md` (e.g., `scout-auth-architecture.md`, `worker-api-refactor.md`)
- **Who writes**: Any sub-agent during task execution
- **Who reads**: Any agent can grep journal files for cross-task context
- **Orchestrator should NOT read journal files directly** — sub-agents extract and return only what matters
- **Cleanup**: Journal files are working artifacts. They can be cleaned periodically without loss of critical information.

## Shared Context

**File**: `shared_context.md`

- Auto-injected into all agents via config
- Single source of truth for project knowledge (tech stack, conventions, architecture decisions)
- Update when project fundamentals change (new dependencies, architectural shifts, convention changes)
- Keep concise — every token here is multiplied across all agent invocations

## Signal-Only Returns

Sub-agents return **only high-signal information**:

- ✅ What changed (files modified, functions added/removed)
- ✅ Blockers encountered
- ✅ Critical decisions made and why
- ❌ Verbose reasoning → journal
- ❌ Full file contents → unnecessary if path is given
- ❌ Step-by-step narration → journal

This keeps the orchestrator's context window focused on decisions and progress, not noise.
