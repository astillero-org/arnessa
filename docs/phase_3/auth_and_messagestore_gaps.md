# Auth & Message Store — Implementation Gaps & Production Readiness

Companion to `auth_and_messagestore_plan.md`. Captures what the initial implementation **does not** cover and what additional work is required before consumers can deploy this in production with confidence.

Organized by severity:

- **P0 — Blockers.** Production deployments will hit these.
- **P1 — Real gaps.** Feature-complete implementations need these.
- **P2 — Plan deliverables not done.** Listed in the plan but skipped in v1.
- **P3 — DX / polish.**

---

## P0 — Production blockers

### 1. Cold reconnect after restart returns 404

`GET /run/{id}` looks up `self.session_manager.sessions[id]`, which is in-memory only. After process restart the `SessionStore` may have the history, but no live `Session` (or its `queue`) exists, so reconnect 404s.

**Why it matters:** Persistence is meaningless if every redeploy ends every conversation.

**Fix direction:** On reconnect (and resolve/patch), if the session is absent in `session_manager`, lazily reconstitute it from the store. The reconstituted session has no live run; `/reconnect` should open an empty SSE stream that closes when the next `/run` or `/resolve` arrives, OR return a snapshot event.

### 2. Multi-worker / multi-process deployments don't work

`uvicorn --workers 4` is the standard production deploy. Each worker has its own `SessionManager` and `Session.queue`. A request can only be served by the worker that started the session.

**Why it matters:** Sticky sessions can paper over GET reconnect, but `POST /run/{id}/resolve` from a different worker than the one that started the run will not find the queue, and even if reconstituted, can't reach the live agent task running on worker A.

**Fix direction:** Document the limitation explicitly. For real multi-worker support, the queue must move to a broker (Redis pubsub, NATS, etc.) — but that's a much larger architecture change. v1 stance should be: "single-worker only, OR consumers must implement sticky routing on `session_id`."

### 3. Concurrent runs on the same `session_id` race on history

The `SessionManager` lock dedupes `load`. It does **not** prevent two simultaneous `POST /run` calls for the same session_id from both starting `_run_agent` tasks. Both will read the same `session.history`, both will call `agent.run`, both will overwrite `session.history` and `session_store.save`, with last-writer-wins.

**Why it matters:** Real users double-click. Real frontends retry. This will silently corrupt conversation history.

**Fix direction:** Per-session run lock. Either reject concurrent runs (return 409) or serialize them. Document the chosen behavior.

### 4. `pending_deferred` is in-memory only — no recovery after restart

When a run yields `DeferredToolRequests`, the SDK records `session.pending_deferred[call_id] = "call" | "approval"` so that `/resolve` knows whether to wrap the result in `DeferredToolResults.calls` or `DeferredToolResults.approvals`. This map is **not persisted by `SessionStore`**.

**Why it matters:** A perfectly-restored conversation can't be resumed — the next `/resolve` after restart will misclassify the result kind. The client *can* pass `kind` explicitly and the code falls back to that, but the fallback isn't documented and clients today don't always send it.

**Fix direction:** Either:
- Persist `pending_deferred` alongside history (extend `SessionStore` to a richer "session state" blob), OR
- Derive deferred state from `history` itself on load (pydantic-ai messages already encode pending tool calls), OR
- Document loudly that clients must always send `kind` and treat the in-process map as a hint.

### 5. Auth not enforced on `POST /run`

`authorize_session` runs on GET reconnect, resolve, patch — **not** on the initial POST. The new session_id from `session_id_factory` is implicitly trusted. A malicious client can send `session_id: "alice:thread-1"` in the request body and, depending on factory implementation, hijack alice's conversation.

The plan's intent: factory is responsible for prefixing/validating. But if `session_id_factory` is the default (passes `client_sid` through), and the consumer relies only on `authorize_session` for security, GET/resolve/patch are protected but POST silently accepts anything.

**Fix direction:**
- Always call `authorize_session(request, resolved_session_id)` on POST too, after factory resolution. Default authorize allows all (preserves today's behavior). Consumers who only want POST-time check can use only `authorize_session`. This makes the security model uniform.
- Document the threat model explicitly: "If you implement `session_id_factory`, you are responsible for forgery resistance. If you only want `authorize_session`, leave `session_id_factory` default."

### 6. No persistence for `agent state` (only message history)

`SessionStore` round-trips `list[ModelMessage]`. But `Session.deps.state` (the `AgentState` capability state, mutated by `/patch`) is **only in process memory**. On restart, history comes back, but state resets to `state_type()`.

**Why it matters:** For agents using `AgentState` (the canonical pydantic-ai pattern), restart silently wipes user-facing state. The conversation looks intact but the agent's "memory" is gone.

**Fix direction:** Either:
- Extend `SessionStore` with `load_state`/`save_state` methods, OR
- Define a separate `StateStore` protocol, OR
- Store state inside the message blob via a custom serializer.

This was a non-goal in the plan but is a real production gap.

---

## P1 — Real gaps

### 7. Frontend `getHeaders` ref-stability footgun

`ArnessaProvider` excludes `getHeaders` from the `useMemo` deps for the client to avoid rebuilding on every render. Consumers passing inline lambdas (`getHeaders={async () => ({...})}`) will get the **first** closure — token refreshes captured by later closures will be ignored.

**Fix direction:** Use a `useRef(getHeaders)` updated in `useLayoutEffect`, and have `ArnessaClient` read through the ref. Then consumers can pass an inline lambda safely.

### 8. No 401/403 handling hook on the frontend

When the backend rejects auth, `ArnessaClient` sets status to "error" and throws. Consumers can't distinguish "auth expired, refresh and retry" from "real failure." The whole point of a `getHeaders` hook is paired with a recovery story.

**Fix direction:** Add `onAuthError?: (response: Response) => Promise<boolean>` — return `true` to retry once after re-invoking `getHeaders`. Or expose the response status on the error event.

### 9. CORS and SSE `Authorization` header — undocumented

The SDK uses `fetch` + manual stream parsing (not browser `EventSource`), which **does** support custom headers. Worth documenting because:
- `EventSource` does *not* support headers — anyone trying to swap implementations will be surprised.
- Cross-origin deployments need server-side `Access-Control-Allow-Headers: Authorization, Content-Type` and `Access-Control-Allow-Credentials` if cookies are used. The SDK ships no CORS middleware.

**Fix direction:** Documentation + a recommended Starlette `CORSMiddleware` config in the README.

### 10. `SessionStore.save` failures crash the run

`_run_agent` does `await self.session_store.save(...)` with no try/except. If Postgres is down, the run errors out. That may be the right policy ("data integrity over availability") but it's not documented. Some consumers will want "log and continue."

**Fix direction:** Explicit policy decision. Either keep strict-and-document, or add `on_save_error: "raise" | "log"` knob.

### 11. `SessionManager.sessions` and `_load_locks` grow unbounded

Even with a `SessionStore`, the in-memory `Session` objects (with their queues, deps, etc.) and the per-session `_load_locks` are never evicted across the process lifetime. Long-running processes leak.

**Fix direction:** Expose an eviction API (`session_manager.evict(session_id)`) or a TTL sweeper. The plan listed this as a non-goal but for production it can't stay non-goal forever.

### 12. `dispatch_arnessa_request` regression

That helper builds a fresh `ArnessaApp(agent)` per request, so per-instance `session_manager` means **no session reuse on that path**. Today the sandbox/demo or anyone using the helper-style integration silently loses session continuity.

**Fix direction:** Either deprecate the helper, hold a module-level `ArnessaApp` cache keyed by `agent`, or document loudly.

### 13. `print()` debug statements still throughout `publish.py`

Production needs structured logging. The module already has `logger = logging.getLogger("arnessa.publish")` defined but unused. Multiple `print(f"[ArnessaApp] …")` calls remain.

**Fix direction:** Mechanical replacement: `print(f"…")` → `logger.info("…")` / `logger.debug("…")` as appropriate.

---

## P2 — Plan deliverables not done

### 14. Frontend tests for new props

Plan calls for tests in `useArnessaChat.test.tsx` covering:
- `getHeaders` (sync + async) called per request, headers reach `fetch`.
- `store` injection: external `ChatStore` instance receives events; default store is not constructed.
- `initialTimeline` populates the default store before first render.
- `onStateChange` fires after each store mutation with the latest state.

None of these tests were added.

### 15. README "Auth and persistence hooks" section

Plan calls for new section in `packages/agui-chat-sdk/README.md`. Not added.

### 16. Backend integration tests for save semantics

`tests/test_session_authz.py` covers the constructor and 403 paths. There are no tests verifying the actual save-after-completion semantics:
- Save fires after streaming completion.
- Save fires after fallback completion.
- Save fires after `DeferredToolRequests` emission.
- Save fires after a recoverable exception with `all_messages()`.
- Save does **not** fire on `CancelledError`.

These need a mocked agent stream — non-trivial but core to the contract.

### 17. `SessionStore.load` deduplication test

The per-session lock dedupe path is not exercised. Plan explicitly calls this out.

### 18. Demo backend not wired with `NoAuthMiddleware`

`apps/backend` (or wherever the demo lives) should add `app.add_middleware(NoAuthMiddleware)` so the demo exercises the same code path consumers will. Otherwise the middleware ships unused and untested in situ.

---

## P3 — DX / polish

### 19. Verify package main export re-exports `ChatStore`

I added `export { ChatStore } from "../core/ChatStore"` to `src/react/index.ts`. Need to confirm the package's `package.json` `main`/`exports` chain surfaces this at the top-level `import { ChatStore } from "@arnessa/react"` (or whatever the published name is).

### 20. `SessionStore` Protocol is not `@runtime_checkable`

`isinstance(store, SessionStore)` won't work. Probably fine for now but worth a deliberate decision.

### 21. Symmetry: no frontend equivalent to `SessionStore.delete`

Plan open question #1 punted this. If we ship `SessionStore.delete` server-side, consumers will reasonably expect a frontend `reset()` that calls it. Today `reset()` is purely client-side. Either expose `DELETE /run/{id}` or document explicitly that "reset" is local.

### 22. Middleware contract is convention, not enforced

The plan documents that middleware should set `request.state.user_id`, but the SDK doesn't validate it. If a consumer's `session_id_factory` accesses `request.state.user_id` and middleware isn't installed, the AttributeError surfaces as a 500 with no actionable message.

**Fix direction:** Optional helper `arnessa.auth.require_user_id(request)` that raises a clear error, OR a startup-time check that warns if `authorize_session` / a custom `session_id_factory` is registered without any middleware visible in the app's middleware stack.

### 23. No types exported alongside ChatStore

`TimelineItem`, `ChatState`, `ConversationSnapshot` are needed by consumers building external stores. Currently they live in `core/types.ts`; the public re-export should include them.

---

## Recommended order of attack

If this needs to ship soon to a real consumer:

1. **#5 (auth on POST)** and **#6 (state persistence)** — security and correctness.
2. **#1 (cold reconnect)** and **#3 (concurrent runs)** — concrete data-loss bugs.
3. **#16, #14** — tests for the contract we already shipped.
4. **#7, #8** — frontend auth ergonomics (consumers will hit these immediately).
5. **#15, #18** — docs and demo wiring.
6. **#13, #11, #12** — cleanup, eviction, helper deprecation.
7. Everything else — polish.

---

## Open architectural questions

These aren't gaps so much as decisions deferred:

- **Single source of truth for "active session":** the in-memory `Session` or the `SessionStore`? Today it's the former (load only fires once). For multi-worker, it has to be the latter, which means `load` on every request — different perf profile entirely.
- **Should `SessionStore` persist a richer object (history + state + pending_deferred + metadata) or stay history-only?** Pushes complexity from SDK into consumer impls vs. lock SDK into a particular session shape. The narrower interface is easier to retrofit later than to broaden.
- **Is `ArnessaApp` meant to be embedded in a larger Starlette app or a standalone process?** Embedding (mount under a path) implies the consumer's middleware runs first. Standalone implies the SDK's `ArnessaApp.add_middleware(...)` is the integration point. The two have different docs and slightly different constraints. Pick one or document both clearly.
