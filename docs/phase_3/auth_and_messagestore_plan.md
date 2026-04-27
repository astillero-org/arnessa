# Plan — Auth & Message Store Hooks (Frontend + Backend SDK)

## Why

Arnessa ships as an SDK. Production consumers need to plug their own auth scheme and their own conversation persistence into both ends of the stack — there is currently no place to plug them in.

Frontend today (`packages/agui-chat-sdk`):
- `ArnessaClient` opens an unauthenticated `POST /run` and has no way to attach headers.
- `ChatStore` is constructed inside `ArnessaProvider`; consumers cannot hydrate, observe, or replace it.

Backend today (`packages/arnessa/src/arnessa/publish.py`):
- `ArnessaApp.run()` accepts any `session_id` from the request body — no ownership check.
- `session_manager` is a module-level dict; `Session.history` lives in process RAM and is lost on restart.
- The read endpoints (`/run/{id}`, `/run/{id}/resolve`, `/run/{id}/patch`) look up sessions by URL with no authorization step.

This document proposes a set of **SDK extension points** — minimal interfaces, sensible defaults, no baked-in opinions about *how* you do auth or persistence. The SDK provides the seams and shipping-quality in-memory defaults; consumers provide the JWTs, the Postgres, the Redis, the multi-tenant whatever.

## Design principles

1. **Interfaces, not policy.** The SDK defines protocols (`SessionStore`, `getHeaders`, etc.). It does not ship JWT verification, OAuth flows, or DB drivers — those are consumer concerns.
2. **Defaults that work out of the box.** Every hook has a default implementation (in-memory store, no-op headers) so the demo app keeps running with zero config.
3. **Zero breaking changes.** Every new param is keyword-only and optional; current consumers continue to work unchanged.
4. **Symmetry where it makes sense.** Frontend and backend hooks mirror each other conceptually so the mental model is consistent.

## Non-goals

- Built-in auth schemes (JWT/OAuth/API key verification).
- Built-in persistence drivers (Postgres/Redis/S3/SQLite).
- Session expiry / TTL / GC policies.
- Multi-tenant data isolation guarantees beyond what the consumer's own implementation provides.
- Changes to the AG-UI wire protocol.

---

## Frontend hooks (`@arnessa/react`)

### F1. Auth — `getHeaders` async callable

**Hook:**

```ts
type GetHeaders = () => Promise<Record<string, string>> | Record<string, string>;

interface ArnessaProviderProps {
  endpoint: string;
  getHeaders?: GetHeaders;
  // ... existing props
}
```

`ArnessaClient` calls `await getHeaders()` before each `fetch` and merges the result into the request headers. Async signature handles refresh-token flows; sync return handles static API keys.

**Default:** no headers added. Existing demo app unchanged.

**Production example (consumer-owned):**

```tsx
<ArnessaProvider
  endpoint="..."
  getHeaders={async () => ({ Authorization: `Bearer ${await auth.getAccessToken()}` })}
>
```

The SDK does not care whether the token is JWT, opaque, refreshed via OAuth, or stored in Clerk/Auth0/Supabase. That is the consumer's call.

### F2. Message store — bring-your-own `ChatStore` + observation

**Hook:**

```ts
interface ArnessaProviderProps {
  store?: ChatStore;                  // inject your own instance
  initialTimeline?: TimelineItem[];   // hydrate the default store
  onStateChange?: (state: ChatState) => void;  // observe for external persistence
}
```

Three layered options, in order of control:

1. **`initialTimeline`** — for "load history on mount, throw away on unmount" use cases. Default store consumes it.
2. **`onStateChange`** — debounce and write to your own DB without owning the store. Lightweight.
3. **`store`** — full control: construct your own `ChatStore`, hydrate from anywhere, share between routes, persist however you like. The SDK's `ChatStore` class is exported and reusable.

**Default:** `new ChatStore()` constructed internally, exactly as today.

**Production example:**

```tsx
const store = useMemo(() => {
  const s = new ChatStore();
  s.hydrateConversation(loadFromIndexedDb(threadId));
  return s;
}, [threadId]);

<ArnessaProvider store={store} onStateChange={(s) => debouncedSaveToDb(s)} />
```

---

## Backend hooks (`arnessa.publish`)

### B1. Auth — Starlette middleware (already works) + identity surface

`ArnessaApp` extends `Starlette`, so `app.add_middleware(...)` is the standard plug-in point and **needs no SDK changes**. The SDK's role is to (a) document the contract and (b) make the verified identity reachable from other hooks.

**Convention** (documented, not enforced): middleware sets `request.state.user_id` (or any field). The SDK passes the raw `Request` to `session_id_factory` and `authorize_session`, so any field set on `request.state` is reachable.

**Demo middleware shipped with the SDK** (`arnessa.middleware.NoAuthMiddleware`): does nothing, sets `request.state.user_id = "anonymous"`. Lets the demo app and tests run with the same code path consumers will use in production.

### B2. Session ID derivation — `session_id_factory`

**Hook:**

```python
SessionIdFactory = Callable[[Request, Optional[str]], Awaitable[str]]
```

Called once at the top of `POST /run` to convert (request, client-supplied ID) into the canonical session key.

**Default:** preserves today's behaviour — `lambda req, sid: sid or uuid.uuid4().hex`.

**Production example:**

```python
async def scoped(request: Request, client_sid: Optional[str]) -> str:
    user_id = request.state.user_id  # set by your auth middleware
    return f"{user_id}:{client_sid or uuid.uuid4().hex}"
```

If `request.state.user_id` is absent, the consumer's factory raises — that surfaces as a 500 and signals a misconfigured middleware stack. The SDK does not silently paper over it.

### B3. Session authorization — `authorize_session`

**Hook:**

```python
AuthorizeSession = Callable[[Request, str], Awaitable[bool]]
```

Called on every endpoint that loads an existing session (`GET /run/{id}`, `POST /run/{id}/resolve`, `POST /run/{id}/patch`). Returns `True` to allow, `False` to 403.

This closes the read-endpoint gap that `session_id_factory` alone cannot — the URL path bypasses the factory.

**Default:** `lambda req, sid: True` (today's behaviour).

**Production example:**

```python
async def owns_session(request: Request, session_id: str) -> bool:
    return session_id.startswith(f"{request.state.user_id}:")
```

### B4. Message store — `SessionStore` protocol

**Hook:**

```python
class SessionStore(Protocol):
    async def load(self, session_id: str) -> list[ModelMessage]: ...
    async def save(self, session_id: str, history: list[ModelMessage]) -> None: ...
    async def delete(self, session_id: str) -> None: ...
```

Three methods cover hydration, persistence, and explicit reset (e.g., "clear conversation" UX).

**Save semantics — explicit:**
- After successful run completion (streaming path: where stream transform finishes; fallback path: where `result.all_messages()` is currently set).
- After a run that produces `DeferredToolRequests` — yes, save. The conversation is paused awaiting user input and must survive restart.
- After a run that errors with a recoverable exception that exposes `all_messages()` — yes, save the partial history so the next turn has context.
- On `asyncio.CancelledError` — no save.

**Load semantics:**
- Called once on first session creation in `SessionManager.get_or_create`.
- Concurrent first-touches for the same session ID are de-duplicated via a per-session `asyncio.Lock` so `load` runs at most once.

**Default:** `InMemorySessionStore` — a dict-backed implementation that preserves today's behaviour exactly.

**Production example (illustrative — real serializer is `ModelMessagesTypeAdapter` from `pydantic_ai.messages`):**

```python
from pydantic_ai.messages import ModelMessagesTypeAdapter

class PostgresSessionStore:
    async def load(self, session_id: str) -> list[ModelMessage]:
        row = await self.pool.fetchrow("SELECT history FROM sessions WHERE id=$1", session_id)
        return ModelMessagesTypeAdapter.validate_json(row["history"]) if row else []

    async def save(self, session_id: str, history: list[ModelMessage]) -> None:
        blob = ModelMessagesTypeAdapter.dump_json(history)
        await self.pool.execute(
            "INSERT INTO sessions(id, history, updated_at) VALUES($1,$2,now()) "
            "ON CONFLICT(id) DO UPDATE SET history=$2, updated_at=now()",
            session_id, blob,
        )

    async def delete(self, session_id: str) -> None:
        await self.pool.execute("DELETE FROM sessions WHERE id=$1", session_id)
```

### B5. Architectural change — `SessionManager` becomes per-instance

The module-level `session_manager` singleton in `publish.py:80` is incompatible with per-`ArnessaApp` injected stores (two apps would share state). It moves to `self.session_manager: SessionManager` on `ArnessaApp`. This is a behaviour change for any consumer relying on cross-instance session sharing — none known, but called out explicitly.

---

## Full proposed API surface

### Frontend

```ts
interface ArnessaProviderProps {
  endpoint: string;
  // existing props…
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  store?: ChatStore;
  initialTimeline?: TimelineItem[];
  onStateChange?: (state: ChatState) => void;
}
```

### Backend

```python
class ArnessaApp(Starlette):
    def __init__(
        self,
        agent: Agent[Any, Any],
        *,
        session_store: SessionStore | None = None,
        session_id_factory: SessionIdFactory | None = None,
        authorize_session: AuthorizeSession | None = None,
    ): ...
```

All params keyword-only and optional. Omitting all of them yields today's behaviour exactly.

---

## What the SDK ships (defaults / demos)

| Component | Type | Purpose |
|---|---|---|
| `InMemorySessionStore` | backend default | drop-in, replaces today's dict |
| `NoAuthMiddleware` | backend demo | sets `request.state.user_id = "anonymous"`; lets demo app exercise the same code paths as prod |
| `ChatStore` (already exists) | frontend default | exported and reusable for `store` injection |
| Demo SQL recipe in docs | reference | not code; copy-paste starting point |

Nothing the SDK ships does real authentication or real persistence. That is intentional.

---

## Files touched

### Frontend (`packages/agui-chat-sdk`)
| File | Change |
|---|---|
| `src/core/ArnessaClient.ts` | accept `getHeaders`; merge into fetch |
| `src/react/ArnessaProvider.tsx` | accept `getHeaders`, `store`, `initialTimeline`, `onStateChange`; wire through |
| `src/react/index.ts` | re-export `ChatStore` if not already |
| `src/react/useArnessaChat.test.tsx` | tests for the new props |
| `README.md` | new section "Auth and persistence hooks" |

### Backend (`packages/arnessa`)
| File | Change |
|---|---|
| `src/arnessa/publish.py` | `SessionStore` protocol; `InMemorySessionStore`; `SessionIdFactory`, `AuthorizeSession` types; per-instance `SessionManager`; wire all three hooks through `__init__`, `run`, `reconnect`, `resolve`, `patch`, `_run_agent` |
| `src/arnessa/middleware.py` | **new** — `NoAuthMiddleware` |
| `src/arnessa/__init__.py` | export `SessionStore`, `InMemorySessionStore`, `NoAuthMiddleware`, type aliases |
| `tests/test_session_store.py` | **new** — load/save/delete contract |
| `tests/test_session_authz.py` | **new** — factory + authorize_session paths |

### Docs
| File | Change |
|---|---|
| `docs/phase_3/auth_and_messagestore_plan.md` | this document |

---

## Test plan

### Frontend
- `getHeaders` (sync + async) is called per request and headers reach `fetch`.
- `store` injection: external `ChatStore` instance receives events; default store is not constructed.
- `initialTimeline` populates the default store before the first render.
- `onStateChange` fires after each store mutation with the latest `ChatState`.
- Existing `useArnessaChat.test.tsx` and `ArnessaProvider.dom.test.tsx` pass unchanged when no new props are supplied.

### Backend
- `session_id_factory` receives the raw `Request` and the client-supplied ID; its return value becomes the session key in `session_manager`.
- Two requests with the same client ID but different `request.state.user_id` produce independent sessions.
- `authorize_session` is invoked on `GET /run/{id}`, `POST /run/{id}/resolve`, `POST /run/{id}/patch`; returning `False` yields 403.
- `SessionStore.load` is called exactly once per session even under concurrent first-touch.
- `SessionStore.save` is called after streaming completion, fallback completion, deferred-tool emission, and recoverable exceptions; not called on `CancelledError`.
- `SessionStore.delete` is called when… (decide: do we expose a "reset" endpoint? Out of scope unless requested.)
- `InMemorySessionStore` round-trips `list[ModelMessage]` correctly.
- Existing backend tests in `apps/backend/tests/` and `packages/arnessa/tests/` pass with no constructor changes.

---

## Open questions

1. **Reset endpoint?** Frontend has `useArnessaChat().reset()` which clears the local store. Should it also call a `DELETE /run/{id}` endpoint that invokes `SessionStore.delete`? Or is "reset" purely a client-side concept and persistence is append-only? Recommend: client-side only for v1; add the endpoint when a consumer asks.
2. **Sync `SessionStore` support?** Some consumers may have sync SQLite drivers. Recommend: async-only; sync consumers wrap in `asyncio.to_thread`.
3. **Headers from `ChatController` path?** `ChatProvider` (the alternative provider that takes a `ChatController` directly) bypasses `ArnessaClient`. If consumers use that path, `getHeaders` is their problem — the controller is theirs to construct. Document this explicitly.

---

## Risk

Low.
- All new params default to behaviour-preserving values.
- The `SessionStore` protocol is structural — no inheritance required.
- The per-instance `SessionManager` change is the only architectural break, and only affects code that imported the module-level singleton directly (none known).
- All new code paths have explicit defaults, so the demo app and existing tests run without modification.
