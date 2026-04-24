.PHONY: install demo test backend-test frontend-test acceptance-test e2e-test

# Install all dependencies for both Python and JS/TS
install:
	pnpm install
	uv sync

# Run the full demo (Backend + Frontend)
demo:
	@echo "Starting Arnessa Demo..."
	@echo "Backend will run at http://localhost:8000"
	@echo "Frontend will run at http://localhost:3000"
	@command -v tmux >/dev/null 2>&1 || { echo "tmux is required for 'make demo'"; exit 1; }
	@if [ ! -e "apps/chat-demo/node_modules/next/package.json" ]; then \
		echo "Frontend dependencies missing; running pnpm install..."; \
		pnpm install; \
	fi
	@tmux has-session -t arnessa-demo 2>/dev/null && tmux kill-session -t arnessa-demo || true
	@tmux new-session -d -s arnessa-demo -n backend 'cd apps/backend && uv run arnessa-agui'
	@tmux split-window -h -t arnessa-demo:backend 'pnpm --dir apps/chat-demo dev'
	@tmux select-layout -t arnessa-demo:backend even-horizontal
	@if [ -n "$$TMUX" ]; then \
		tmux switch-client -t arnessa-demo; \
	else \
		tmux attach-session -t arnessa-demo; \
	fi

# Run all test suites
test: backend-test frontend-test acceptance-test e2e-test

# Backend SDK unit tests
backend-test:
	cd packages/arnessa && uv run pytest

# Frontend SDK unit tests
frontend-test:
	cd packages/agui-chat-sdk && npm test src/core/ArnessaClient.test.ts

# Protocol acceptance tests
acceptance-test:
	cd tests/acceptance && npm test

# End-to-End UI tests
e2e-test:
	cd tests/e2e && npm test
