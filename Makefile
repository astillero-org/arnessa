.PHONY: install demo test quick-test py-compile backend-test frontend-test frontend-typecheck acceptance-test e2e-test e2e-drawing-approval-test

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

# Run the complete verification suite used before merging
test: quick-test acceptance-test e2e-test

# Run fast local checks that do not launch browsers or test servers
quick-test: py-compile backend-test frontend-typecheck frontend-test

# Compile changed/core Python entrypoints without executing tests
py-compile:
	uv run python -m py_compile \
		packages/arnessa/src/arnessa/tools/photo_tools.py \
		packages/arnessa/src/arnessa/publish.py \
		packages/arnessa/src/arnessa/capabilities/image_store.py \
		tests/acceptance/server.py

# Backend SDK unit tests
backend-test:
	uv run pytest packages/arnessa/tests

# Frontend SDK unit tests
frontend-test:
	pnpm --dir packages/agui-chat-sdk test

# Frontend SDK TypeScript typecheck
frontend-typecheck:
	pnpm --dir packages/agui-chat-sdk typecheck

# Protocol acceptance tests
acceptance-test:
	pnpm --dir tests/acceptance test

# End-to-End UI tests
e2e-test:
	pnpm --dir tests/e2e test

# Focused E2E test for Python deferred approval -> frontend approval -> image render
e2e-drawing-approval-test:
	pnpm --dir tests/e2e exec playwright test src/arnessa.spec.ts -g "drawing approval" --project=chromium
