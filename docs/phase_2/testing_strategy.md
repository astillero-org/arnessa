# Arnessa Testing Strategy (Phase 2)

This document outlines the multi-level testing strategy for the Arnessa toolkit, ensuring robustness across the Python backend and React frontend.

## 1. Backend Unit Tests (Python)

Focused on testing individual capabilities and dependency logic without requiring a full network stack.

- **Tools**: `pytest`, `pytest-asyncio`.
- **Location**: `apps/backend/tests/`
- **Run**: `cd apps/backend && uv run pytest`
- **Key Tests**: `test_capabilities.py` (Tests `AgentState`, `DeferredCalls`, and `DynamicUI`).

## 2. Frontend Unit Tests (React/TypeScript)

Focused on testing the `ArnessaClient` and React hooks by mocking the network layer.

- **Tools**: `vitest`, `jsdom`.
- **Location**: `packages/agui-chat-sdk/src/core/`
- **Run**: `cd packages/agui-chat-sdk && npm test`
- **Key Tests**: `ArnessaClient.test.ts`.

## 3. Acceptance / Protocol Tests (Python/TypeScript)

Tests the core communication protocol between the Python backend and the React SDK over the network. These tests spawn a real Python `ArnessaApp` but use `vitest` and `ArnessaClient` directly without a browser.

- **Location**: `tests/acceptance/`
- **Mechanism**:
    1. `beforeAll`: Spawns `uv run python3` with a minimal `ArnessaApp` setup (`server.py`).
    2. `test`: Uses `ArnessaClient` to hit the endpoint (`http://127.0.0.1:8002`), verifying SSE streaming and event flow.
    3. `afterAll`: Kills the Python process.
- **Run**: `cd tests/acceptance && npm test`

## 4. End-to-End (E2E) UI Tests (Playwright)

Validates the full stack by driving a real browser against deterministic scenarios mounted in the `chat-demo` application. 

Following best practices for robust E2E testing (and insights from common Playwright issues like [microsoft/playwright#16834](https://github.com/microsoft/playwright/issues/16834)):
- Tests use explicit routes (e.g., `/e2e/basic-message`) rather than clicking through the entire UI.
- Deterministic behavior is enforced by a dedicated `ArnessaApp` backend (`tests/acceptance/server.py`) powered by PydanticAI's `FunctionModel`.
- Explicit IP binding (`127.0.0.1`) is used for the Next.js and Uvicorn servers within Playwright's `webServer` configuration to prevent `localhost` IPv4/IPv6 resolution timeouts.

### E2E Scenarios:
- **Level 1**: Basic communication (`/e2e/basic-message`)
- **Level 2**: State patching (`/e2e/state-patch`)
- **Level 3**: Dynamic UI mounting (`/e2e/dynamic-ui`)
- **Level 4**: Deferred tool lifecycle (`/e2e/deferred-tool`)

- **Location**: `tests/e2e/`
- **Run**: `cd tests/e2e && npm test`

## Summary of Test Commands

| Level | Command |
|---|---|
| Backend | `cd apps/backend && uv run pytest` |
| Frontend | `cd packages/agui-chat-sdk && npm test` |
| Acceptance | `cd tests/acceptance && npm test` |
| E2E | `cd tests/e2e && npm test` |
