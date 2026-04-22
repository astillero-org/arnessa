# Arnessa Implementation Report (Phase 2)

This report details the implementation of the Arnessa toolkit architecture (Phase 2), migrating from legacy AG-UI patterns to a robust, state-aware, and capability-driven framework.

## Overview

Arnessa Phase 2 provides a unified protocol for AI harnesses built on PydanticAI. It introduces synchronized agent state, deferred tool calls, and dynamic UI injection, separated into distinct packages for the Python backend and React frontend.

## Implementation Details

### 1. Backend SDK: `@packages/arnessa`

The core Python logic has been separated into a standalone workspace package:

- **`arnessa.deps`**: Defines `ArnessaDeps`, the base dependency class. It includes built-in support for session IDs and an `EventSink` for emitting standardized Arnessa events.
- **`arnessa.capabilities`**: Implements the three core Arnessa capabilities:
    - `AgentState`: Typed state tools with automatic `state_changed` event emission.
    - `DeferredCalls`: Suspension/resumption logic for human-in-the-loop tools.
    - `DynamicUI`: decision-making tools for mounting/updating/unmounting React components in named slots.
    - `ImageStoreCapability`: Specialized capability for managing artifact-based images.
- **`arnessa.publish`**: Provides `ArnessaApp`, a Starlette/FastAPI-compatible ASGI application that manages session lifecycle and SSE streaming.
- **`arnessa.tools` & `arnessa.environments`**: Reusable toolsets and environment management logic.

### 2. Frontend SDK: `@arnessa/react`

The React SDK (refactored from legacy `agui-chat-sdk`) provides the client-side implementation of the protocol:

- **`ArnessaClient`**: Managed connection layer for SSE stream parsing, state patching, and tool resolution.
- **`ArnessaProvider`**: Root context provider for sessions and event streams.
- **Modern Hooks**:
    - `useHarness`: Core messaging and status API.
    - `useAgentState`: Live subscription to structured agent state.
    - `useDeferredTool`: Logic for resolving suspended backend calls.
- **`DynamicSlot`**: Component for mounting agent-injected UI based on name-based component registration.

### 3. Demo Application: `demo-agent`

The primary reference implementation:
- **Backend (`apps/backend`)**: A minimal agent implementation utilizing the core Arnessa SDK and custom skills (`photo-tools`).
- **Frontend (`apps/chat-demo`)**: A polished Next.js application showcasing both traditional chat and dynamic UI integration.

## Current Status

The system is fully operational and verified through a 4-layer testing strategy:
- **Backend Unit**: Logic verification of individual capabilities.
- **Frontend Unit**: Verification of `ArnessaClient` protocol parsing.
- **Acceptance Protocol**: Tandem verification of the Python-to-TypeScript wire protocol.
- **E2E UI**: Playwright-based visual verification of the real application using deterministic test scenarios.

## Reorganized Documentation

- **`docs/phase_1/`**: Archive of legacy AG-UI implementation notes and initial project requirements.
- **`docs/phase_2/`**: Active specification, implementation report, and testing strategy for the current architecture.
