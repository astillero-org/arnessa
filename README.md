# Arnessa

Arnessa is a toolkit for building highly interactive AI harnesses on top of PydanticAI. It provides a full-stack layer for synchronized agent state, deferred tool calls, and dynamic UI injection.

## Project Structure

This is a monorepo containing the following components:

### Packages (SDKs)
- **`packages/arnessa`**: The Python SDK. Includes core capabilities (`AgentState`, `DeferredCalls`, `DynamicUI`), ASGI publishing (`ArnessaApp`), and environment management.
- **`packages/agui-chat-sdk` (`@arnessa/react`)**: The React SDK. Provides the `ArnessaProvider`, hooks for state and tool resolution, and the `DynamicSlot` component for agent-driven UI.

### Applications (Demos)
- **`apps/backend` (`demo-agent`)**: A reference agent implementation using the Arnessa Python SDK.
- **`apps/chat-demo`**: A Next.js application that integrates the Arnessa React SDK to provide a rich chat and visual interface.

### Tests
- **`tests/acceptance`**: Cross-language protocol tests (Python <-> TypeScript) ensuring wire compatibility.
- **`tests/e2e`**: End-to-end UI tests using Playwright to verify visible application behavior.

## Getting Started

### Prerequisites
- Python 3.13+
- Node.js 20+
- `uv` (Python package manager)
- `pnpm` (Node package manager)

### Installation

```bash
# Install all JS/TS dependencies
pnpm install

# Install all Python dependencies and sync workspace
uv sync
```

### Running the Demo

1. Start the backend agent:
   ```bash
   cd apps/backend
   uv run arnessa-agui
   ```

2. Start the frontend:
   ```bash
   cd apps/chat-demo
   npm run dev
   ```

## Testing

For detailed information on the multi-level testing strategy, see [`docs/phase_2/testing_strategy.md`](docs/phase_2/testing_strategy.md).

| Level | Command |
|---|---|
| Backend SDK | `cd packages/arnessa && uv run pytest` |
| Frontend SDK | `cd packages/agui-chat-sdk && npm test src/core/ArnessaClient.test.ts` |
| Acceptance | `cd tests/acceptance && npm test` |
| E2E UI | `cd tests/e2e && npm test` |

## Documentation

Detailed documentation is available in the `docs/` directory:
- **[Specification](docs/phase_2/spec.md)**: Protocol and capability definitions.
- **[Implementation Report](docs/phase_2/implementation_report.md)**: Details on the current Phase 2 architecture.
- **[Legacy Archive](docs/phase_1/)**: Notes and research from Phase 1.
