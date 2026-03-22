# OpenCode SDK & Plugin Surface: Option B Findings

> Implementation-oriented audit of OpenCode's plugin/extension API for the
> opencode-minimal-orchestrator "Option B" hybrid runtime.
>
> **Sources examined**: `opencode/packages/plugin/`, `opencode/packages/opencode/src/`,
> `oh-my-openagent/src/`, existing `opencode-minimal-orchestrator/` artifacts.

---

## 1  Supported Extension Points

Every mechanism below is verified against the upstream source and the
oh-my-openagent (OmO) reference implementation.

### 1.1  Plugin Loading

OpenCode resolves plugins in this order (highest priority last):

| Source | Path / Config |
|--------|---------------|
| Global plugin dir | `~/.config/opencode/plugin/*.{ts,js}` |
| Global config | `~/.config/opencode/opencode.jsonc` → `plugin: [...]` |
| Project plugin dir | `.opencode/plugin/*.{ts,js}` |
| Project config | `.opencode/opencode.jsonc` → `plugin: [...]` |
| Env override | `OPENCODE_CONFIG_DIR` |

Plugin specifiers accept **npm packages** (`oh-my-opencode@2.4.3`) or
**local files** (`file:///path/to/plugin.ts`). Bun installs npm packages
to `~/.cache/opencode/node_modules/`.

A plugin is a default-exported async function returning a `Hooks` object:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (ctx) => {
  // ctx: { client, project, directory, worktree, serverUrl, $ }
  return { /* hooks */ }
}
export default MyPlugin
```

**Option B fit:** Ship as a single `.opencode/plugin/orchestrator-runtime.ts`
that is auto-discovered, or reference via `file://` in config. Zero npm
publishing required during development.

### 1.2  Custom Tools (`.opencode/tool/*.ts`)

Files in `.opencode/tool/` (or `tools/`) are auto-discovered and loaded.
Each named export becomes a tool; `default` export uses the filename as ID.

```typescript
import { tool } from "@opencode-ai/plugin"

export const poll_tasks = tool({
  description: "Poll background task status",
  args: { task_id: tool.schema.string().optional() },
  async execute(args, ctx) {
    // ctx: { sessionID, messageID, agent, directory, worktree, abort, metadata(), ask() }
    return JSON.stringify(/* status */)
  },
})
```

**Option B fit:** Register `poll_tasks` as a custom tool so the orchestrator
agent can query background task completions without relying on prompt-only
polling conventions.

### 1.3  `tool.execute.before` — Guard Hook ✅

```typescript
"tool.execute.before"?: (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: any },  // mutable
) => Promise<void>
```

| Capability | Supported |
|------------|-----------|
| See tool name | ✅ `input.tool` (e.g. `"bash"`, `"write"`, `"edit"`) |
| See arguments | ✅ `output.args` (e.g. `{ command, timeout, workdir }` for bash) |
| Modify arguments | ✅ Mutate `output.args` before execution |
| Block execution | ✅ `throw new Error(...)` prevents tool call |

**Option B fit:** Implements **shell command guard** (inspect `bash` tool
`command` arg against deny-list for read-only agents) and
**write-existing-file guard** (inspect `write` tool `filePath` arg, throw
if target exists and session hasn't read it).

OmO proves this pattern at scale: its `createWriteExistingFileGuardHook`
uses per-session LRU read-permission tracking, and its tool-execute-before
dispatcher chains ~12 guards sequentially. Our plugin needs only 2–3.

### 1.4  `tool.execute.after` — Post-Execution Hook ✅

```typescript
"tool.execute.after"?: (
  input: { tool: string; sessionID: string; callID: string; args: any },
  output: { title: string; output: string; metadata: any },  // mutable
) => Promise<void>
```

Can inspect and rewrite tool results. Useful for error classification
(tag retryable errors in output metadata) or truncating noisy results.

### 1.5  `experimental.session.compacting` — Compaction Injection ✅

```typescript
"experimental.session.compacting"?: (
  input: { sessionID: string },
  output: { context: string[]; prompt?: string },  // mutable
) => Promise<void>
```

- Push strings into `output.context[]` → appended to compaction context.
- Set `output.prompt` → **replaces** the default compaction prompt entirely.
- Core code: `const finalPrompt = compacting.prompt ?? defaultPrompt`.

**Option B fit:** On compaction, inject a recovery block:

```
[ORCHESTRATOR RECOVERY]
Agent: orchestrator
Pending delegated tasks: worker(implement auth), scout(map dependencies)
Last 3 plan items: ...
Journal references: .opencode/journal/worker-auth.md, ...
```

This is the most powerful lever for session resilience after context
compaction. The `experimental.` prefix means it could change, but OmO
depends on it heavily, making removal unlikely short-term.

### 1.6  `event` — Session Lifecycle Events ✅

```typescript
event?: (input: { event: Event }) => Promise<void>
```

Observed event types (from OmO usage and upstream `Bus` definitions):

| Event Type | Payload |
|------------|---------|
| `session.created` | `{ info: { id, parentID, title } }` |
| `session.updated` | `{ info: { id, ... } }` |
| `session.deleted` | `{ info: { id } }` |
| `session.diff` | `{ info: { id, summary } }` |
| `session.error` | `{ info: { id, error } }` |
| `message.updated` | `{ info: { role, sessionID, providerID, modelID, finish, tokens } }` |
| `permission.asked` | `{ ... }` |
| `permission.replied` | `{ ... }` |

**Option B fit:** Track session creation/deletion for cleanup. Monitor
`message.updated` with `tokens` for preemptive compaction triggering
(OmO triggers at 78% context usage).

### 1.7  `chat.message` — Message Injection ✅

```typescript
"chat.message"?: (
  input: { sessionID: string; agent?: string; model?: Model; ... },
  output: { message: UserMessage; parts: Part[] },  // mutable
) => Promise<void>
```

Can prepend/append parts to the user message before it reaches the LLM.

**Option B fit:** Inject pending background task notifications into the
next user turn (same pattern OmO uses via
`injectPendingNotificationsIntoChatMessage`).

### 1.8  `experimental.chat.system.transform` — System Prompt Modification ✅

```typescript
"experimental.chat.system.transform"?: (
  input: { sessionID?: string; model: Model },
  output: { system: string[] },  // mutable
) => Promise<void>
```

Push additional system prompt segments. Could dynamically inject
agent-specific runtime instructions based on the active agent.

### 1.9  Agent Configuration (Config-Driven) ✅

Agents defined in `opencode.jsonc` under `agent`:

```jsonc
{
  "agent": {
    "scout": {
      "name": "scout",
      "mode": "subagent",
      "permission": { "write": "deny", "edit": "deny", "apply_patch": "deny" }
    }
  }
}
```

Permission rules per-agent can **deny specific tools** entirely. The
existing orchestrator already uses this for scout/reviewer journal-only
write access.

### 1.10  `tool.definition` — Dynamic Tool Description Modification ✅

```typescript
"tool.definition"?: (
  input: { toolID: string },
  output: { description: string; parameters: any },  // mutable
) => Promise<void>
```

Modify tool descriptions/schemas before they're sent to the LLM. Could
annotate the `bash` tool description for read-only agents with extra
warnings.

### 1.11  SDK Client (Available Inside Plugins)

The `PluginInput.client` is an OpenCode SDK client with full API access:

```typescript
ctx.client.session.messages({ path: { id: sessionID } })
ctx.client.session.promptAsync({ path: { id }, body: { parts, noReply } })
ctx.client.session.summarize({ path: { id }, body: { providerID, modelID } })
ctx.client.session.abort({ path: { id } })
```

**Option B fit:** The SDK client enables programmatic session interaction
(inject messages, trigger compaction, read message history) without
touching OpenCode internals.

---

## 2  Unsupported / Out-of-Bounds Ideas

These were considered in the Option B plan but are **not feasible** within
the plugin API, or carry unacceptable risk.

### 2.1  LLM-Level Automatic Retry with Backoff ⛔

**Plan item:** "Intercept API errors (429, 502, 503), classify as
retryable/fatal, retry with exponential backoff."

**Reality:** There is **no plugin hook** that wraps the LLM provider call.
The `chat.*` hooks run before/after message construction, not around the
actual HTTP request to the provider. OmO solves this with an 1,800-line
`BackgroundManager` that spawns separate sessions with fallback chains —
this is infrastructure-grade code, not a thin runtime hook.

**Recommendation:** Downscope to **error classification only**. Use
`tool.execute.after` or `event` (`session.error`) to detect errors and
surface a clear retry instruction to the user/orchestrator. True automatic
retry is Option C (full plugin) territory.

### 2.2  `permission.ask` Override ⛔

The hook signature exists but the output is **not consumed** by the
core permission engine. Plugin hooks can observe permission requests
but cannot programmatically allow or deny them.

**Workaround:** Use config-level `permission` rules per-agent (already
supported and used) plus `tool.execute.before` throw-to-block for
runtime guards.

### 2.3  Direct Session State Mutation ⛔

No plugin hook exposes mutable session state (pending tasks, agent
context, plan progress). Session state lives in SQLite via Drizzle ORM
inside OpenCode core.

**Workaround:** Track state in-plugin using `Map<sessionID, State>`,
persist to `.opencode/` JSON files if needed. Use `event` hook to sync.

### 2.4  Modifying OpenCode Core ⛔

Explicitly ruled out by project philosophy. No patching `packages/opencode/`.

### 2.5  Intercepting `task` Tool Spawning ⚠️ Partial

There is no hook to intercept sub-session creation itself. However,
`tool.execute.before` can see when `tool === "task"` and inspect/modify
the prompt and agent args before the task tool runs. This enables
prompt injection into delegated tasks but not session lifecycle control.

### 2.6  Automatic Model Fallback ⛔

Requires deep integration with the provider system and session retry
logic. OmO's implementation is 400+ lines with provider reachability
checks, model transformation, and concurrency management. Not viable
at <500 lines.

---

## 3  Recommended Option B Architecture Within the SDK

### 3.1  Delivery Mechanism

**Single-file plugin** at `.opencode/plugin/orchestrator-runtime.ts`,
auto-discovered by OpenCode. No npm package, no build step (Bun runs
TypeScript natively).

Alternatively, for global installation:
`~/.config/opencode/plugin/orchestrator-runtime.ts`.

### 3.2  Guard Architecture

```
tool.execute.before
  ├── shellGuard(input, output)     → if tool==="bash" && agent is read-only
  │                                    → match command against deny patterns
  │                                    → throw Error to block
  ├── writeGuard(input, output)     → if tool==="write" && file exists
  │                                    → check per-session read permissions
  │                                    → throw Error to block
  └── (future guards chain here)
```

**Shell command deny patterns** (from Option B plan):
```typescript
const DENY_PATTERNS = [
  /\brm\s+-rf?\b/, /\bmv\b/, /\bchmod\b/, /\bchown\b/,
  /\bgit\s+push\b/, /\bgit\s+merge\b/, /\bgit\s+rebase\b/,
  />[^>]/, /\bdd\b/, /\bsudo\b/, /\bmkfs\b/,
]
```

Read-only agent detection: inspect `input.sessionID` → resolve agent name
from plugin state (tracked via `event` hook on `session.created`).

### 3.3  Compaction Recovery

```typescript
"experimental.session.compacting": async (input, output) => {
  const state = sessionStates.get(input.sessionID)
  if (!state) return

  output.context.push(`
[ORCHESTRATOR RECOVERY CONTEXT]
Agent: ${state.agentName}
Active delegations: ${state.pendingTasks.map(t => t.description).join(", ") || "none"}
Last plan items: ${state.recentPlanItems.slice(-3).join(" → ")}
Journal references: ${state.journalRefs.join(", ")}
Resume instruction: Continue from where you left off. Check journals for detailed state.
`.trim())
}
```

### 3.4  Background Task Tracking

**Lightweight approach** (not OmO's 1,800-line manager):

1. **`tool.execute.before`**: When `tool === "task"`, record task metadata
   (description, agent, timestamp) in an in-memory `Map`.
2. **`tool.execute.after`**: When `tool === "task"`, capture the returned
   session/task ID and associate with tracked metadata.
3. **`event`**: Listen for `session.deleted` on child sessions to mark
   tasks complete.
4. **Custom `poll_tasks` tool**: Returns current task status from the
   in-memory map. Registered via `.opencode/tool/poll-tasks.ts` or
   the plugin's `tool` record.

This gives the orchestrator agent a way to ask "what's done?" without
relying on prompt conventions alone.

### 3.5  Error Surface (Simplified)

Instead of automatic retry, classify errors in `tool.execute.after`:

```typescript
"tool.execute.after": async (input, output) => {
  if (!output.output.includes("error")) return
  const classification = classifyError(output.output)
  if (classification.retryable) {
    output.output += `\n\n⚠️ RETRYABLE ERROR (${classification.code}): ${classification.hint}`
  }
}
```

The orchestrator agent prompt already instructs retry on transient errors;
this hook just makes the signal clearer.

---

## 4  Minimal File / Package Structure

```
opencode-minimal-orchestrator/
├── agent/                              # (existing) Agent prompt markdown
│   ├── orchestrator.md
│   ├── worker.md
│   ├── scout.md
│   └── reviewer.md
├── opencode.jsonc                      # (existing) Config with agents + permissions
├── plugin/                             # NEW — Auto-discovered by OpenCode
│   └── orchestrator-runtime.ts         # ~300-400 lines, single-file plugin
├── tool/                               # NEW — Auto-discovered custom tools
│   └── poll-tasks.ts                   # ~40 lines, task polling tool
├── shared_context.md                   # (existing)
├── AGENTS.md                           # (existing)
├── README.md                           # (existing, update with runtime docs)
├── opencode-sdk-option-b-findings.md   # This file
└── .gitignore                          # (existing)
```

### `plugin/orchestrator-runtime.ts` Internal Structure

```typescript
// ── Imports ──────────────────────────────────────────
import type { Plugin, Hooks } from "@opencode-ai/plugin"

// ── Types ────────────────────────────────────────────
interface SessionState { agentName: string; pendingTasks: TaskInfo[]; ... }
interface TaskInfo { id: string; description: string; agent: string; startedAt: Date }

// ── State ────────────────────────────────────────────
const sessions = new Map<string, SessionState>()
const taskRegistry = new Map<string, TaskInfo>()

// ── Guards ───────────────────────────────────────────
function shellGuard(input, output): void { ... }       // ~40 lines
function writeGuard(input, output): void { ... }       // ~60 lines

// ── Helpers ──────────────────────────────────────────
function classifyError(output: string): Classification  // ~30 lines
function isReadOnlyAgent(sessionID: string): boolean    // ~10 lines

// ── Plugin ───────────────────────────────────────────
const plugin: Plugin = async (ctx) => ({
  event:                                async (input) => { ... },
  "tool.execute.before":                async (input, output) => { ... },
  "tool.execute.after":                 async (input, output) => { ... },
  "experimental.session.compacting":    async (input, output) => { ... },
  "chat.message":                       async (input, output) => { ... },
  tool: { poll_tasks: { ... } },  // or separate file in tool/
})
export default plugin
```

### Dependency Requirements

```
@opencode-ai/plugin  (types only — already available at runtime)
```

No additional npm dependencies. Bun executes TypeScript natively.
The plugin uses only Node.js/Bun built-ins (`fs`, `path`) plus the
plugin types.

---

## 5  Validation Strategy

### 5.1  Pre-Integration Smoke Tests

| Test | Method |
|------|--------|
| Plugin loads without error | Start OpenCode, check for plugin init log |
| Shell guard blocks `rm -rf` for scout | Send scout a task that triggers `rm -rf`, verify throw |
| Shell guard allows `ls` for scout | Send scout a read task, verify no block |
| Write guard blocks overwrite | Have worker `write` to existing file without prior `read` |
| Write guard allows after read | Have worker `read` then `write` same file |
| Compaction injects recovery | Fill context to trigger compaction, verify recovery block |
| `poll_tasks` returns status | Dispatch a `task`, call `poll_tasks`, check response |

### 5.2  Manual Integration Tests

1. **Full orchestrator flow**: User → orchestrator → delegates to scout →
   scout returns signal → orchestrator delegates to worker → worker
   implements → reviewer reviews. Verify guards don't interfere with
   the happy path.

2. **Guard enforcement**: Instruct scout to `rm -rf /tmp/test`. Verify
   the guard blocks and returns an error message to the LLM.

3. **Compaction recovery**: Run a long session until compaction triggers.
   Verify the orchestrator resumes with correct context.

4. **Disable test**: Set `"plugin": []` in config. Verify the system
   still works in pure prompt-driven mode (graceful degradation).

### 5.3  Regression Check

- All existing agent prompts unchanged (diff check)
- `opencode.jsonc` only gains a `plugin` entry (if using config-based loading)
- Journal system unaffected
- No OpenCode core files modified

---

## 6  Open Questions & Risks

### 6.1  Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|----------------------|
| Q1 | How does OpenCode resolve agent name for a sub-session? The `tool.execute.before` input has `sessionID` but not `agent`. We need agent context to apply role-specific guards. | High — shell guard needs to know if agent is read-only | Track agent-to-session mapping via `event` on `session.created` (OmO does this). Fallback: parse from `chat.message` input which includes `agent` field. |
| Q2 | Does `experimental.session.compacting` fire for sub-agent sessions or only the main session? | Medium — compaction recovery may need to work for long worker sessions too | Test empirically. If sub-sessions compact, the hook should handle both orchestrator and sub-agent recovery contexts. |
| Q3 | Can a plugin's `tool` record register tools visible to all agents, or only the default agent? | Medium — `poll_tasks` must be visible to orchestrator but maybe not scout | Test whether tool visibility follows agent permission rules. If not, register via `.opencode/tool/` directory instead (always visible). |
| Q4 | What is the plugin's lifecycle across OpenCode restarts? Is `init` called once per server start? | Low — affects state persistence | Assume stateless across restarts. Persist critical state (e.g., task registry) to `.opencode/runtime-state.json` if needed. |
| Q5 | Can `tool.execute.before` distinguish between user-initiated and agent-initiated tool calls? | Low — useful for allowing user overrides of guards | Not directly. `callID` and `sessionID` are available but not a user/agent flag. Accept that guards apply uniformly. |

### 6.2  Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | **`experimental.*` hooks removed or changed** in a future OpenCode release | Medium | Pin to a known OpenCode version. The hooks are used extensively by OmO (most popular plugin), making silent removal unlikely. Monitor OpenCode changelog. |
| R2 | **Guard false positives** — shell guard blocks a legitimate command | Medium | Start with a narrow deny-list (destructive-only). Log blocked commands to journal for debugging. Add a `// @allow` escape hatch pattern in the command arg. |
| R3 | **Performance overhead** from synchronous hook chain | Low | Guards are simple string matching (microseconds). No async I/O in the critical path. OmO chains 12+ guards with no reported latency issues. |
| R4 | **State loss on crash** — in-memory task registry lost | Medium | The task registry is supplementary to the prompt-driven system. On state loss, the orchestrator agent falls back to prompt conventions. Optionally persist to disk. |
| R5 | **Plugin loading order** — if another plugin is present, hook execution order is undefined | Low | The orchestrator runtime is designed to be the only plugin for this system. Document incompatibility with OmO (they serve the same purpose). |
| R6 | **Bun-specific APIs** — plugin runs in Bun, not Node.js | Low | Stick to `fs`, `path`, standard APIs. Avoid Bun-specific shell (`$`) in plugin code. The `ctx.$` provides Bun shell if needed. |

### 6.3  Scope Boundaries (What to Defer to Option C)

| Capability | Option B | Option C (Full Plugin) |
|------------|----------|----------------------|
| Shell command guard | ✅ Deny-list in `tool.execute.before` | Configurable per-agent allow/deny with glob patterns |
| Write guard | ✅ Exists-check + read-permission tracking | Full conflict detection, merge support |
| Error retry | ⚠️ Classification only (annotate output) | Automatic retry with backoff + model fallback chains |
| Task tracking | ✅ In-memory registry + `poll_tasks` tool | Persistent queue with priority, concurrency limits |
| Compaction recovery | ✅ Context injection via hook | Full session state serialization/restoration |
| Preemptive compaction | ❌ Defer | Token monitoring + auto-trigger at threshold |
| Model fallback | ❌ Defer | Provider-aware fallback chain with reachability checks |

---

## 7  Implementation Phasing (Updated from Plan)

Based on SDK surface findings, the recommended phasing is:

| Phase | Scope | Lines | Hook(s) Used | Hours |
|-------|-------|-------|-------------|-------|
| **1** | Shell guard + write guard | ~120 | `tool.execute.before`, `event` | 1–2h |
| **2** | Compaction recovery injection | ~50 | `experimental.session.compacting`, `event` | 1h |
| **3** | Task tracking + `poll_tasks` tool | ~100 | `tool.execute.before/after`, `event`, `tool` | 1–2h |
| **4** | Error classification annotations | ~40 | `tool.execute.after` | 30min |
| **5** | Background notification injection | ~50 | `chat.message` | 30min |
| **6** | Docs + validation | ~0 (prose) | — | 30min |
| **Total** | | **~360 lines** | | **~5–7h** |

Phase 1 should be shipped and validated before proceeding. The write
guard alone provides immediate, measurable safety improvement.

---

## 8  Key Reference Files

| What | Path |
|------|------|
| Plugin type definitions | `opencode/packages/plugin/src/index.ts` |
| Tool helper | `opencode/packages/plugin/src/tool.ts` |
| Plugin loader | `opencode/packages/opencode/src/plugin/index.ts` |
| Tool registry | `opencode/packages/opencode/src/tool/registry.ts` |
| Hook trigger sites | `opencode/packages/opencode/src/session/prompt.ts` |
| Compaction trigger | `opencode/packages/opencode/src/session/compaction.ts` |
| OmO write guard | `oh-my-openagent/src/hooks/write-existing-file-guard/hook.ts` |
| OmO tool-execute-before chain | `oh-my-openagent/src/plugin/tool-execute-before.ts` |
| OmO background manager | `oh-my-openagent/src/features/background-agent/manager.ts` |
| OmO compaction hook | `oh-my-openagent/src/hooks/preemptive-compaction.ts` |
| OmO plugin entry | `oh-my-openagent/src/index.ts` |
