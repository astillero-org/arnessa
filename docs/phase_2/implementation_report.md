# Arnessa Implementation Report (Phase 2)

This report details the implementation of the new Arnessa toolkit architecture, migrating from the legacy AG-UI-based patterns to a more robust, state-aware, and capability-driven framework.

## Overview

Arnessa Phase 2 introduces a unified protocol for AI harnesses built on PydanticAI. It provides synchronized agent state, deferred tool calls, and dynamic UI injection, bridging the gap between the Python backend and the React frontend.

## Implementation Details

### 1. Backend: `arnessa.pydanticai`

A new core package has been implemented to handle the server-side logic:

- **`deps.py`**: Defines `ArnessaDeps`, the base dependency class for all Arnessa agents. It includes built-in support for session IDs and an `EventSink` for emitting Arnessa events.
- **`capabilities.py`**: Implements the three core Arnessa capabilities:
    - `AgentState`: Provides tools for reading and patching agent state, with automatic `state_changed` event emission.
    - `DeferredCalls`: Enables tools to suspend execution pending client-side resolution.
    - `DynamicUI`: Allows the agent to mount, update, and unmount React components in named frontend slots.
- **`publish.py`**: Provides `ArnessaApp`, a Starlette-based ASGI application that manages agent runs, session persistence, and SSE event streaming. It also includes a `dispatch_arnessa_request` helper for easy integration into existing FastAPI/Starlette apps.

### 2. Frontend: `@arnessa/react`

The React SDK has been completely refactored and renamed:

- **`ArnessaClient`**: A core class that manages the connection to the Arnessa backend, handles SSE streams, and provides methods for sending messages, resolving tools, and patching state.
- **`ArnessaProvider`**: The root component that initializes the `ArnessaClient` and provides context to the rest of the application.
- **New Hooks**:
    - `useHarness`: For sending messages and tracking connection status.
    - `useAgentState`: For subscribing to and mutating the agent's structured state.
    - `useDeferredTool`: For handling suspended tool calls.
    - `DynamicSlot`: A component for rendering agent-injected components.
- **Backward Compatibility**: Shimmed legacy hooks (`useChatState`, `useChatActions`) ensure that existing components continue to function while the migration to the new API progresses.

### 3. Demo Integration

The demo application (`apps/chat-demo`) has been updated to use the new architecture:

- **Package Rename**: All references to `@arnessa/agui-chat-sdk` have been updated to `@arnessa/react`.
- **Provider Update**: The demo now uses `ArnessaProvider` in `ChatDemoClient`.
- **Backend Update**: The backend entry point (`apps/backend/src/arnessa/agui/main.py`) now uses `ArnessaApp` instead of the legacy `to_ag_ui` method.
- **Transitive Adoption**: While many components still use the shimmed legacy hooks, they are now running on the new Arnessa protocol and SSE streaming infrastructure.

## Current Status of the Demo

The demo **is using the "new shit"** transitively:
- It uses the new `@arnessa/react` package.
- It uses the new `ArnessaProvider` and `ArnessaClient`.
- It uses the new SSE-based protocol for communication.
- The backend is running the new `ArnessaApp`.

**Next Steps for Full Adoption:**
- Migrate `StudioShell`, `MessageList`, and `ChatComposer` from legacy hooks to the new `useHarness` and `useAgentState` APIs.
- Implement `DynamicSlot` in the demo UI to showcase agent-injected components.
- Utilize `useDeferredTool` for complex interactions like "confirm design" or "pay for furniture".

## Documentation Structure

The documentation has been reorganized to clearly separate the exploration phase from the current implementation:

- **`docs/phase_1/`**: Contains the original research, requirements, and legacy implementation notes.
- **`docs/phase_2/`**: Contains the current specification and implementation reports for the new Arnessa framework.
