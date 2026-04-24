# Arnessa Testing Strategy (Phase 2)

This document outlines the multi-level testing strategy for the Arnessa toolkit, ensuring robustness across the Python backend SDK, React frontend SDK, and integrated applications.

## 1. Backend SDK Unit Tests (Python)

Focused on testing individual capabilities and core logic of the Python SDK.

- **Tools**: `pytest`, `pytest-asyncio`.
- **Location**: `packages/arnessa/tests/`
- **Run**: `make backend-test`
- **Direct command**: `uv run pytest packages/arnessa/tests`
- **Key Tests**: `test_capabilities.py` (Tests `AgentState`, `DeferredCalls`, and `DynamicUI`).

### Python Compile Smoke Check

Use this before or after backend changes that affect app entrypoints, capabilities, or deterministic test servers.

- **Run**: `make py-compile`
- **Purpose**: catches syntax/import-time compile errors without launching pytest, browser servers, or networked tests.

## 2. Frontend SDK Unit Tests (React/TypeScript)

Focused on testing the `ArnessaClient` and logic of the React SDK by mocking the network layer.

- **Tools**: `vitest`, `jsdom`.
- **Location**: `packages/agui-chat-sdk/src/core/` (Package: `@arnessa/react`)
- **Run unit tests**: `make frontend-test`
- **Run typecheck**: `make frontend-typecheck`
- **Direct unit command**: `pnpm --dir packages/agui-chat-sdk test`
- **Direct typecheck command**: `pnpm --dir packages/agui-chat-sdk typecheck`

## 3. Acceptance / Protocol Tests (Python/TypeScript)

Tests the core communication protocol between the Python backend SDK and the React SDK over the network. These tests spawn a real Python `ArnessaApp` but use `vitest` and `ArnessaClient` directly without a browser.

- **Location**: `tests/acceptance/`
- **Mechanism**:
    1. `beforeAll`: Spawns `uv run python3` with a minimal `ArnessaApp` setup (`server.py`).
    2. `test`: Uses `ArnessaClient` to hit the endpoint (`http://127.0.0.1:8002`), verifying SSE streaming and event flow.
    3. `afterAll`: Kills the Python process.
- **Run**: `make acceptance-test`
- **Direct command**: `pnpm --dir tests/acceptance test`

## 4. End-to-End (E2E) UI Tests (Playwright)

Validates the full stack by driving a real browser against deterministic scenarios mounted in the `chat-demo` application. 

Following best practices for robust E2E testing:
- Tests use explicit routes (e.g., `/e2e/basic-message`) rather than clicking through the entire UI.
- Deterministic behavior is enforced by a dedicated `ArnessaApp` backend (`tests/acceptance/server.py`).
- Explicit IP binding (`127.0.0.1`) is used for the Next.js and Uvicorn servers to prevent `localhost` resolution issues.

### E2E Scenarios:
- **Level 1**: Basic communication (`/e2e/basic-message`)
- **Level 2**: State patching (`/e2e/state-patch`)
- **Level 3**: Dynamic UI mounting (`/e2e/dynamic-ui`)
- **Level 4**: Deferred tool lifecycle (`/e2e/deferred-tool`)
- **Level 5**: Deferred drawing approval (`/e2e/drawing-approval`)
  - Python emits a Pydantic AI deferred approval request for `generate_furniture_image`.
  - The frontend renders the request as a human approval question.
  - The browser approves it.
  - Python receives the approval, resumes execution, calls `send_image_to_user`, and emits an image event.
  - The frontend renders the final image and completion text.

- **Location**: `tests/e2e/`
- **Run all E2E**: `make e2e-test`
- **Run drawing approval only**: `make e2e-drawing-approval-test`
- **Direct all-E2E command**: `pnpm --dir tests/e2e test`

## Summary of Test Commands

| Purpose | Command | Notes |
|---|---|---|
| Fast local verification | `make quick-test` | Python compile, backend unit tests, frontend typecheck, frontend unit tests. |
| Full verification suite | `make test` | Runs quick checks, protocol acceptance, and all browser E2E tests. |
| Python compile smoke check | `make py-compile` | Fast syntax/import compile check for core changed Python files. |
| Backend SDK | `make backend-test` | Pytest suite under `packages/arnessa/tests`. |
| Frontend SDK typecheck | `make frontend-typecheck` | Runs `tsc --noEmit` for `@arnessa/react`. |
| Frontend SDK unit tests | `make frontend-test` | Runs all Vitest tests in `packages/agui-chat-sdk`. |
| Acceptance / protocol | `make acceptance-test` | Starts deterministic Python server and tests the TS client protocol. |
| E2E UI | `make e2e-test` | Starts deterministic backend and Next.js app, then runs Playwright. |
| Deferred drawing approval E2E | `make e2e-drawing-approval-test` | Focused HITL approval-to-image browser test. |

## Recommended Workflow

1. During local development, run `make quick-test`.
2. When changing deferred tools, event publishing, or frontend approval rendering, also run `make e2e-drawing-approval-test`.
3. Before merging, run `make test`.
4. If an E2E run fails because ports `3000` or `8002` are already in use, stop the stale dev server and rerun the command. Playwright starts its own controlled servers from `tests/e2e/playwright.config.ts`.
