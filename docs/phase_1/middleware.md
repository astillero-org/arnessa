Start with the middleware that changes correctness, safety, and control flow. Everything else is optional polish.

## The important ones

### 1. Runtime context injection

Injects dynamic stuff right before model call:

* current time
* user/session metadata
* thread/workspace info
* mode flags

Why it matters:
Without it, the agent has no stable way to see fresh execution context.

---

### 2. Tool argument parsing

Normalizes model-emitted tool calls into actual typed inputs.

It should handle:

* JSON-ish garbage
* missing wrappers
* strings where dicts are expected
* legacy argument shapes

Why it matters:
A lot of agent failures are just malformed tool args.

---

### 3. Tool error handling

Wrap every tool execution and convert crashes into structured results.

Good output shape:

```python
{"ok": False, "error": "...", "retryable": True}
```

Why it matters:
You want the loop to recover, not explode.

---

### 4. Tool result normalization

Makes every tool result look consistent before it returns to the model.

Normalize:

* text vs dict vs bytes
* success/error envelope
* truncation metadata
* artifact references

Why it matters:
Models reason much better when tool outputs have one predictable format.

---

### 5. Validation / guardrail middleware

Checks tool calls before execution.

Typical checks:

* bad shell commands
* invalid code blocks
* missing required args
* disallowed network/file actions
* recursion/depth limits

Why it matters:
This is your first real safety and sanity layer.

---

### 6. Protected path / capability enforcement

Prevents access outside allowed workspace or capability set.

Examples:

* deny `/etc`, secrets dirs, host mounts
* deny writes outside workspace
* deny dangerous shells unless explicitly enabled

Why it matters:
This is one of the few truly non-optional security layers.

---

### 7. Human-in-the-loop interrupt middleware

Lets tools or policies pause execution for approval or clarification.

Use it for:

* submit plan
* ask user
* approve destructive action
* approve external side effects

Why it matters:
This is how you keep autonomy without losing control.

---

### 8. Subagent delegation middleware

Intercepts delegation actions and runs child agents with scoped context.

It should handle:

* child run creation
* depth limits
* result marshaling back to parent
* optional background execution

Why it matters:
Without this, “subagents” are just prompts, not a runtime structure.

---

### 9. Summarization / context compaction

Compresses history when token budget gets big.

Should preserve:

* goals
* constraints
* unresolved questions
* tool outputs worth keeping
* decisions already made

Why it matters:
Necessary once sessions get longer than toy demos.

---

### 10. Large result eviction

Moves huge tool outputs out of prompt space and replaces them with references.

Example:

```python
{"evicted": True, "path": ".agents/results/r123.json", "summary": "..."}
```

Why it matters:
Massive tool outputs will kill latency and model quality.

---

### 11. Retry middleware

Retries flaky model or tool failures with bounded policy.

Good for:

* transient LLM API errors
* rate limits
* sandbox hiccups
* temporary fetch failures

Why it matters:
Huge improvement in robustness for low complexity cost.

---

### 12. Observability / event emission

Emits structured events around key steps.

Emit:

* model start/end
* tool requested/executed
* tool failed
* subagent spawned/completed
* interrupt raised/resumed
* summary created

Why it matters:
Without this, debugging multi-step agents is miserable.

---

## The first 6 I’d implement first

If you want the smallest serious harness, do these first:

1. `RuntimeContextMiddleware`
2. `ToolArgumentParsingMiddleware`
3. `ToolErrorHandlingMiddleware`
4. `ToolResultNormalizationMiddleware`
5. `ProtectedPathMiddleware`
6. `HumanInTheLoopMiddleware`

That gives you:

* usable context
* reliable tool calling
* crash resistance
* security boundaries
* approval flow

Then add:
7. `SubAgentMiddleware`
8. `SummarizationMiddleware`
9. `LargeResultEvictionMiddleware`
10. `RetryMiddleware`

---

## Suggested ordering

A good default order is:

```text
[outer]
Observability
Retry/Fallback
LargeResultEviction
SubagentDelegation
Validation / Guardrails
ProtectedPath
ToolArgParsing
ToolExecution
ToolErrorHandling
ToolResultNormalization
WorkspaceContext
RuntimeContext
[inner model/tool boundary]
```

For model-call middleware specifically:

```text
WorkspaceContext
RuntimeContext
PromptCaching
ModelRetry/Fallback
```

For tool-call middleware specifically:

```text
ToolArgParsing
Validation
ProtectedPath
Execution
ErrorHandling
ResultNormalization
```

---

## Which ones are actually core vs nice-to-have

### Core

* runtime context
* arg parsing
* error handling
* result normalization
* protected path / capability checks
* HITL
* subagent delegation

### Needed soon after

* summarization
* large result eviction
* retry/fallback
* observability

### Nice later

* prompt caching
* steering
* todo/file SSE
* skill discovery
* leak detection
* empty tool call retry

---

## Minimal interface I’d use

```python
class Middleware:
    async def before_model(self, state): return state
    async def after_model(self, state, output): return output

    async def before_tool(self, state, tool_call): return tool_call
    async def after_tool(self, state, tool_call, result): return result

    async def on_error(self, state, error): raise error
```

Not every middleware uses every hook.

Examples:

* runtime context uses `before_model`
* arg parsing uses `before_tool`
* normalization uses `after_tool`
* error handling uses `on_error`
* subagent middleware may intercept after model and short-circuit the loop

---

## The ones from your snippet that I’d call most important

From your list, these are the high-value ones:

* `RuntimeContextMiddleware`
* `WorkspaceContextMiddleware`
* `ToolArgumentParsingMiddleware`
* `ToolErrorHandlingMiddleware`
* `ToolResultNormalizationMiddleware`
* `ProtectedPathMiddleware`
* `CodeValidationMiddleware`
* `SummarizationMiddleware`
* `LargeResultEvictionMiddleware`
* `AskUserMiddleware`
* `PlanModeMiddleware`
* `SubAgentMiddleware`
* `BackgroundSubagentMiddleware`
* `ToolCallCounterMiddleware`

If I had to cut it down aggressively, I’d keep only:

* `RuntimeContextMiddleware`
* `ToolArgumentParsingMiddleware`
* `ToolErrorHandlingMiddleware`
* `ToolResultNormalizationMiddleware`
* `ProtectedPathMiddleware`
* `AskUserMiddleware`
* `SubAgentMiddleware`
* `SummarizationMiddleware`

That is the smallest “real” stack.

I can also rank your exact middleware list into “must have / should have / optional” and propose an execution order.
