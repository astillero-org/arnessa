Apply the fix, then write the protocol spec RFC.

---

## Arnessa

A toolkit for building highly interactive AI harnesses on top of PydanticAI. Arnessa consists of a Python library (`arnessa`) and a React/TypeScript SDK (`@arnessa/react`). Together they provide a full-stack harness layer with first-class support for deferred tool calls, dynamic UI injection, and synchronized agent state.

Arnessa is AG-UI-compatible where that protocol fits, and extends it with patterns AG-UI does not standardize well in practice: deferred tool calls that require later client-side resolution, agent-directed UI mounting into developer-defined slots, and a structured state layer that both agent and frontend can observe, and selectively mutate.

---

### The Stack

```
Your code
  │
  ├── pydantic_ai.Agent
  │     └── capabilities=[AgentState(...), DeferredCalls(), DynamicUI()]
  │
  ├── arnessa.pydanticai.capabilities   ← AbstractCapability subclasses
  │     ├── AgentState                  ← typed state tools + state_changed events
  │     ├── DeferredCalls              ← suspend/resume tool calls via client
  │     └── DynamicUI                  ← mount/update/unmount components in slots
  │
  ├── arnessa.pydanticai.deps           ← ArnessaDeps (StateHandler subclass)
  │     └── subclass with your own fields (state, db, current_user, etc.)
  │
  └── arnessa.pydanticai.publish        ← ASGI/FastAPI publish adapters
        └── AG-UI-compatible SSE + Arnessa event extensions
              │
              │   (over HTTP / SSE)
              │
              └── @arnessa/react
                    ├── <ArnessaProvider>      ← session + event stream
                    ├── useAgentState()        ← live typed state subscriptions
                    ├── useDeferredTool()      ← resolve pending tool calls
                    └── <DynamicSlot>          ← mount agent-injected components
```

---

### `arnessa.pydanticai.deps`

`ArnessaDeps` is the typed dependency base that Arnessa capabilities operate against. It is deliberately coupled to PydanticAI's deps model and `StateHandler`. It is not a service container — it is a small, extendable, state-aware base class that capabilities depend on and applications subclass.

```python
# arnessa/pydanticai/deps.py

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic_ai.ui import StateHandler


@dataclass
class ArnessaEvent:
    kind: str
    payload: dict[str, Any]
    session_id: str | None = None
    seq: int | None = None
    timestamp: float | None = None


class EventSink(Protocol):
    async def emit(self, event: ArnessaEvent) -> None: ...


class NullEventSink:
    async def emit(self, event: ArnessaEvent) -> None:
        return None


@dataclass
class ArnessaDeps(StateHandler):
    state: Any = None
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    events: EventSink = field(default_factory=NullEventSink)
    metadata: dict[str, Any] = field(default_factory=dict)
```

`state` is `Any` in the base because its type is owned by the application. Users subclass `ArnessaDeps` and define `state` with their concrete type:

```python
from dataclasses import dataclass, field
from arnessa.pydanticai import ArnessaDeps

@dataclass
class EditorDeps(ArnessaDeps):
    state: DocumentState = field(default_factory=DocumentState)
    current_user_id: str | None = None
    db: DocumentDatabase | None = None
```

The publish layer assumes only `Agent[ArnessaDeps | Subclass]` and depends only on the base contract. Application-specific fields are invisible to Arnessa capabilities unless a capability explicitly declares it requires them.

---

### `arnessa.pydanticai.capabilities`

Each Arnessa capability is an `AbstractCapability` subclass. They compose like any PydanticAI capability: they provide tools, hook into the lifecycle, inject instructions, and access `RunContext[Deps]`.

#### `AgentState`

`AgentState(T)` declares the expected structured type of `deps.state`, provides tools for reading and patching it, and emits `state_changed` events for client synchronization. It does not modify or rewrite the deps class. The application owns the `state` field type by subclassing `ArnessaDeps`; `AgentState(T)` validates that expectation at agent construction and operates against it at runtime.

`state_changed` events carry a full snapshot of the current state. Patch-based diffing is reserved for a future `state_patch` event type.

`patch_state` applies a shallow partial update to the current structured state.

```python
AgentState(DocumentState)
```

Tools provided: `read_state`, `patch_state`.

Hooks used: `get_toolset`, `wrap_run_event_stream` (emits `state_changed` after mutations).

Deps contract: `state`, `events`.

#### `DeferredCalls`

`DeferredCalls()` enables tools whose resolution is suspended pending a client-side response. The lifecycle is explicit:

1. The agent calls a deferred tool during a run.
2. The capability emits a `tool_deferred` event carrying a `call_id` and the tool arguments.
3. The publish adapter persists enough run continuation state to resume execution for the session and `call_id`, then returns an HTTP response. The SSE stream closes normally.
4. The client resolves the call by submitting a `tool_resolution` request carrying `call_id` and the result payload.
5. The publish adapter retrieves the continuation and resumes execution with the resolved payload injected as the deferred tool result.

This model is intentionally checkpoint-based rather than a long-lived suspended coroutine. The publication layer owns pending-call persistence; the agent run itself does not hold open connections while waiting.

```python
DeferredCalls()
```

Hooks used: `get_toolset` (deferred tool stubs), `wrap_run_event_stream` (emits `tool_deferred`), `before_run` / `after_run` (session continuity).

Deps contract: `state`, `session_id`, `events`.

#### `DynamicUI`

`DynamicUI()` enables the agent to mount, update, and unmount registered React components in named frontend slots. The agent never emits JSX — it selects a registered component name, a target slot, typed props, and a stable `component_id`. The React SDK owns the render tree; the agent owns the decision to mount.

```python
mount_component(slot="sidebar", component="StatusBadge", props={...}, component_id="status-1")
update_component(component_id="status-1", props={...})
unmount_component(component_id="status-1")
```

These emit `ui_mount`, `ui_update`, and `ui_unmount` events carrying `slot`, `component`, `props`, `component_id`, and optionally `mode` (`replace` | `append`). `component_id` is the stable identity for updates and unmounts across the session.

Hooks used: `get_toolset`, `wrap_run_event_stream`.

Deps contract: `state`, `events`.

---

### Capability–Deps Contract

| Capability | Base deps required | User deps (opt-in) |
|---|---|---|
| `AgentState` | `state`, `events` | — |
| `DeferredCalls` | `state`, `session_id`, `events` | — |
| `DynamicUI` | `state`, `events` | — |

Capabilities beyond the base three can declare additional requirements. Arnessa does not enforce these statically beyond what the Python type system provides, but capabilities may validate required fields at runtime during initialization or first use.

---

### Authoring

```python
from pydantic_ai import Agent
from arnessa.pydanticai.capabilities import AgentState, DeferredCalls, DynamicUI
from myapp.deps import EditorDeps
from myapp.state import DocumentState

agent = Agent[EditorDeps](
    "openai:gpt-5.2",
    deps_type=EditorDeps,
    instructions="Help the user edit the document.",
    capabilities=[
        AgentState(DocumentState),
        DeferredCalls(),
        DynamicUI(),
    ],
)
```

---

### Publishing

**Mountable ASGI:**

```python
from fastapi import FastAPI
from arnessa.pydanticai.publish import ArnessaApp

app = FastAPI()
app.mount("/harness", ArnessaApp(agent))
```

**Endpoint helper:**

```python
from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import Response
from arnessa.pydanticai.publish import dispatch_arnessa_request

app = FastAPI()

@app.post("/harness")
async def harness(request: Request) -> Response:
    return await dispatch_arnessa_request(request, agent=agent)
```

**FastAPI sugar:**

```python
from arnessa.pydanticai.publish.fastapi import mount_arnessa

mount_arnessa(app, "/harness", agent)
```

---

### `@arnessa/react`

The React SDK connects to an Arnessa endpoint, handles the event stream, and provides hooks for each capability surface.

**Public API surface:**

| Export | Kind | Purpose |
|---|---|---|
| `<ArnessaProvider>` | component | Session root, event stream, context |
| `useHarness()` | hook | Send messages, connection status, message log |
| `useAgentState<T>()` | hook | Live state subscription, selective write |
| `useDeferredTool(name)` | hook | Pending call access, resolution dispatch |
| `<DynamicSlot>` | component | Named mount point for agent-injected components |
| `registerComponent(name, component)` | function | Register a component as a valid mount target |

#### `<ArnessaProvider>`

```tsx
<ArnessaProvider endpoint="/harness" sessionId={sessionId}>
  <YourApp />
</ArnessaProvider>
```

#### `useHarness`

```tsx
const { send, status, messages } = useHarness();
```

#### `useAgentState`

Subscribes to `state_changed` events and exposes the current agent state. `patchState` is only available for fields the server marks as client-editable — agent-owned fields are read-only from the client.

```tsx
const { state, patchState } = useAgentState<DocumentState>();
```

#### `useDeferredTool`

Listens for `tool_deferred` events for a named tool. Returns the pending call (if any) and a `resolve` function that posts a `tool_resolution` back to the server with the `call_id` and result payload to resume the run.

```tsx
const { pending, resolve } = useDeferredTool("confirm_action");

if (pending) {
  return (
    <ConfirmDialog
      message={pending.args.message}
      onConfirm={() => resolve({ confirmed: true })}
      onCancel={() => resolve({ confirmed: false })}
    />
  );
}
```

#### `<DynamicSlot>` and `registerComponent`

Components must be registered before the agent can mount them. Only registered components are valid mount targets. `component_id` provides stable identity for updates and unmounts within a session.

```tsx
import { registerComponent, DynamicSlot } from "@arnessa/react";

registerComponent("StatusBadge", StatusBadge);
registerComponent("ConfirmForm", ConfirmForm);

<DynamicSlot name="sidebar" />
<DynamicSlot name="inline" />
```

---
---

## Arnessa Protocol Spec

This document defines the wire protocol between `arnessa.pydanticai.publish` and `@arnessa/react`. All events flow over Server-Sent Events (SSE). Client-to-server messages use HTTP POST. All payloads are JSON.

---

### Event Envelope

Every server-sent event is an `ArnessaEvent`. The `kind` field determines the payload schema.

```typescript
interface ArnessaEvent {
  kind: string;           // discriminant
  session_id: string;     // session this event belongs to
  seq: number;            // monotonically increasing per session
  timestamp: number;      // unix epoch seconds (float)
  payload: object;        // kind-specific, see below
}
```

SSE wire format:

```
data: {"kind":"state_changed","session_id":"abc","seq":1,"timestamp":1745000000.123,"payload":{...}}
```

---

### Publish Endpoints

All endpoints are mounted under the configured base path (e.g. `/harness`).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/run` | Start a new agent run |
| `GET` | `/run/{session_id}` | Reconnect to an existing session's event stream |
| `POST` | `/run/{session_id}/resolve` | Submit a `tool_resolution` to resume a deferred call |
| `POST` | `/run/{session_id}/patch` | Submit a client-side state patch |

#### `POST /run` — Start a run

Request:

```typescript
interface RunRequest {
  message: string;
  session_id?: string;   // omit to create a new session
  deps?: object;         // serializable deps fields, merged into ArnessaDeps
}
```

Response: SSE stream of `ArnessaEvent` objects for the duration of the run. The stream closes when the run completes or suspends on a deferred call.

#### `POST /run/{session_id}/resolve` — Resume a deferred call

Request:

```typescript
interface ToolResolutionRequest {
  call_id: string;
  result: unknown;       // must match the deferred tool's return schema
}
```

Response: SSE stream resuming from the point of suspension. Closes again on run completion or another deferred call.

#### `POST /run/{session_id}/patch` — Client state patch

Request:

```typescript
interface StatePatchRequest {
  patch: Record<string, unknown>;  // shallow partial update, client-editable fields only
}
```

Response: `200 OK`. The server applies the patch, updates `deps.state`, and emits a `state_changed` event on the session's stream if any subscribers are connected.

---

### Event Schemas

#### `state_changed`

Emitted after any mutation to `deps.state`, either by the agent or by a client patch.

```typescript
interface StateChangedPayload {
  state: object;          // full snapshot of the current structured state
  writable_fields: string[];  // top-level fields the client is permitted to patch
}
```

`state_changed` always carries a full snapshot. There is no partial diff. A `state_patch` event type is reserved for future use.

---

#### `tool_deferred`

Emitted when a deferred tool is called by the agent. The run suspends immediately after this event.

```typescript
interface ToolDeferredPayload {
  call_id: string;        // stable id for this pending call, unique within session
  tool_name: string;      // name of the deferred tool
  args: object;           // validated tool arguments
  schema: object;         // JSON Schema for the expected resolution result
}
```

The stream closes after `tool_deferred` is sent. The session and its continuation state remain available until resolved or expired.

---

#### `tool_resolution_ack`

Emitted at the start of the resumed stream after the server accepts a `tool_resolution` request.

```typescript
interface ToolResolutionAckPayload {
  call_id: string;
  status: "accepted" | "rejected";
  reason?: string;        // present only when status is "rejected"
}
```

---

#### `ui_mount`

Emitted when the agent calls `mount_component`.

```typescript
interface UiMountPayload {
  component_id: string;   // stable id for this component instance
  slot: string;           // target slot name
  component: string;      // registered component name
  props: object;          // initial props
  mode: "replace" | "append";  // default: "replace"
}
```

---

#### `ui_update`

Emitted when the agent calls `update_component`.

```typescript
interface UiUpdatePayload {
  component_id: string;
  props: object;          // shallow merge into current props
}
```

---

#### `ui_unmount`

Emitted when the agent calls `unmount_component`.

```typescript
interface UiUnmountPayload {
  component_id: string;
}
```

---

#### `run_complete`

Emitted at the end of a run that terminates normally.

```typescript
interface RunCompletePayload {
  output: unknown;        // final agent output
}
```

---

#### `run_error`

Emitted when a run terminates with an unrecovered error.

```typescript
interface RunErrorPayload {
  error: string;
  detail?: string;
}
```

---

### Deferred Call Lifecycle

```
client                        server
  │                              │
  ├─ POST /run ────────────────► │
  │                              ├─ run starts
  │ ◄── SSE: state_changed ──────┤
  │ ◄── SSE: tool_deferred ──────┤  (call_id="c1")
  │                              ├─ run suspended, continuation persisted
  │                              ├─ SSE stream closes
  │                              │
  ├─ POST /resolve (call_id="c1") ► │
  │                              ├─ continuation retrieved
  │ ◄── SSE: resolution_ack ─────┤
  │ ◄── SSE: state_changed ──────┤
  │ ◄── SSE: run_complete ───────┤
  │                              ├─ SSE stream closes
```

---

### Dynamic UI Lifecycle

```
client                        server
  │                              │
  │ ◄── SSE: ui_mount ───────────┤  (component_id="c1", slot="sidebar")
  │   → mounts StatusBadge       │
  │                              │
  │ ◄── SSE: ui_update ──────────┤  (component_id="c1")
  │   → merges new props         │
  │                              │
  │ ◄── SSE: ui_unmount ─────────┤  (component_id="c1")
  │   → unmounts component       │
```

---

### Component Registry

Components must be registered client-side before they can be mounted by the agent. The agent references components by name; unregistered names are ignored with a console warning.

```typescript
// Register individually
registerComponent("StatusBadge", StatusBadge);
registerComponent("ConfirmForm", ConfirmForm);

// Or register a map at initialization
createRegistry({
  StatusBadge,
  ConfirmForm,
  ProgressTracker,
});
```

`createRegistry` is equivalent to calling `registerComponent` for each entry and is preferred when the full set of components is known at startup.

---

### Session Lifecycle and Expiry

Sessions are identified by `session_id`. A session is created on the first `POST /run` without a `session_id`, or by supplying a client-generated one. Sessions with a pending deferred call remain alive until resolved or until a server-configured TTL expires. Expired sessions return `410 Gone` on any subsequent request. Completed sessions may be retained for a configurable window for reconnect and replay.