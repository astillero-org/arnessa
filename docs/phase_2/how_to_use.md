# How to Use Arnessa in an Existing System

This guide explains how to add Arnessa to an application that already has a backend, a frontend, and its own domain model. Use the demo apps as references, but do not treat them as required structure.

## What You Integrate

Arnessa has two parts:

- **Python backend package (`arnessa`)**: wraps a PydanticAI agent in an HTTP/SSE app and adds state, deferred tool calls, dynamic UI events, and protocol publishing.
- **React package (`@arnessa/react`)**: connects your UI to the backend, sends user messages, receives streamed events, resolves deferred tools, patches state, and mounts agent-directed UI.

The default HTTP surface is:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/run` | Start or continue an agent run. |
| `GET` | `/run/{session_id}` | Reconnect to an existing session stream. |
| `POST` | `/run/{session_id}/resolve` | Resolve a deferred tool call or approval. |
| `POST` | `/run/{session_id}/patch` | Patch writable agent state from the frontend. |

## 1. Add the Backend Package

Install the Python package into the service that owns your agent runtime. In this monorepo, the package lives at `packages/arnessa`.

For local workspace development:

```bash
uv add --editable packages/arnessa
```

In a published-package setup, install the equivalent released package from your package registry.

## 2. Wrap Your Existing PydanticAI Agent

If you already have a PydanticAI `Agent`, wrap it with `ArnessaApp` and mount it behind your existing API server.

```python
from starlette.middleware.cors import CORSMiddleware
from arnessa import ArnessaApp
from my_system.agent import agent

app = ArnessaApp(agent)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend.example"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

If your backend already has a Starlette/FastAPI app, mount Arnessa under a namespace such as `/agent` and point the React SDK at that base URL.

```python
from fastapi import FastAPI
from arnessa import ArnessaApp
from my_system.agent import agent

api = FastAPI()
api.mount("/agent", ArnessaApp(agent))
```

Then the frontend endpoint is `https://your-api.example/agent`.

## 3. Use Arnessa Dependencies for Per-Session Context

Arnessa creates an `ArnessaDeps` object for each session. The frontend can pass extra dependency data in `deps`; the backend copies matching fields onto the session deps object.

```ts
await send("Analyze this record", {
  metadata: {
    tenant_id: tenantId,
    record_id: recordId,
  },
});
```

Use `metadata` for system-specific context that your tools or capabilities need. Avoid sending secrets from the browser; resolve secrets server-side from user/session identity.

## 4. Add Capabilities Only Where Needed

Start with a plain agent. Add Arnessa capabilities when your product needs them:

- **Agent state**: keep a structured session object synchronized with the frontend.
- **Deferred calls**: pause a tool until the browser or user supplies a result or approval.
- **Dynamic UI**: let the agent mount registered React components into named UI slots.
- **Image store/tools**: use the provided image workflow if your product needs generated or transformed visual assets.

For capability details, see [`spec.md`](./spec.md).

## 5. Add the React Package

Install the React SDK in your frontend app. In this monorepo, it lives at `packages/agui-chat-sdk` and is exposed as `@arnessa/react`.

For local workspace development:

```bash
pnpm add @arnessa/react --workspace
```

Configure the agent endpoint with an environment variable:

```env
NEXT_PUBLIC_AGENT_URL=https://your-api.example/agent
```

## 6. Wrap the Part of Your UI That Talks to the Agent

Place `ArnessaProvider` around the feature area that needs agent access.

```tsx
'use client';

import { ArnessaProvider } from '@arnessa/react/react';

export function AgentFeature({ children }: { children: React.ReactNode }) {
  return (
    <ArnessaProvider endpoint={process.env.NEXT_PUBLIC_AGENT_URL!}>
      {children}
    </ArnessaProvider>
  );
}
```

## 7. Send Messages and Render Status

Use `useHarness` inside the provider.

```tsx
'use client';

import { useHarness } from '@arnessa/react/react';

export function AgentPrompt() {
  const { send, status } = useHarness();

  return (
    <button
      disabled={status === 'running'}
      onClick={() => send('Help me complete this workflow')}
    >
      Ask agent
    </button>
  );
}
```

## 8. Integrate Agent State

Use `useAgentState<T>()` when the agent owns a session model that the UI should display or partially edit.

```tsx
import { useAgentState } from '@arnessa/react/react';

type WorkflowState = {
  selected_item?: string;
  notes?: string;
};

export function StatePanel() {
  const { state, patchState, writableFields } = useAgentState<WorkflowState>();

  return (
    <button
      disabled={!writableFields.includes('notes')}
      onClick={() => patchState({ notes: 'Approved by user' })}
    >
      Save note
    </button>
  );
}
```

## 9. Resolve Deferred Tools and Approvals

If a backend tool is deferred, the frontend receives a pending call. Resolve it after user input or client-side work.

```tsx
import { useDeferredTool } from '@arnessa/react/react';

export function ApprovalDialog() {
  const { pending, resolve } = useDeferredTool('create_image');

  if (!pending) return null;

  return (
    <div>
      <p>{pending.prompt ?? 'Approve this action?'}</p>
      <button onClick={() => resolve({ approved: true })}>Allow</button>
      <button onClick={() => resolve({ approved: false })}>Deny</button>
    </div>
  );
}
```

## 10. Mount Agent-Directed UI Safely

Register only components you are comfortable letting the agent request. Treat props as untrusted input and validate where needed.

```tsx
import { ArnessaProvider, DynamicSlot, createRegistry } from '@arnessa/react/react';
import { ProductCard } from './ProductCard';

createRegistry({ ProductCard });

export function AgentArea() {
  return (
    <ArnessaProvider endpoint={process.env.NEXT_PUBLIC_AGENT_URL!}>
      <DynamicSlot name="sidebar" />
    </ArnessaProvider>
  );
}
```

## Integration Checklist

- Mount `ArnessaApp` under a stable backend URL.
- Configure CORS, auth, and tenant/session checks before exposing the endpoint.
- Pass only non-secret frontend context through `deps.metadata`.
- Keep your existing business tools server-side.
- Wrap only the relevant frontend feature area in `ArnessaProvider`.
- Register dynamic components explicitly; never allow arbitrary component names.
- Test at least one full flow: `send` → stream response → optional deferred resolution → state/UI update.

## Reference Implementation

- Backend demo: `apps/backend/src/demo_agent/main.py`
- Agent setup: `apps/backend/src/demo_agent/agent.py`
- Frontend provider usage: `apps/chat-demo/src/components/chat-demo-client.tsx`
- Verification strategy: [`testing_strategy.md`](./testing_strategy.md)
