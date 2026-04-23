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
	@(trap 'kill 0' SIGINT; \
	  (cd apps/backend && uv run arnessa-agui) & \
	  (cd apps/chat-demo && npm run dev) & \
	  wait)

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
