from __future__ import annotations

import asyncio
import json
import time
import uuid
import copy
import logging
from dataclasses import asdict, dataclass, field
from typing import Any, AsyncIterable, Dict, List, Optional, TypeVar, cast

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from starlette.routing import Route
from pydantic_ai import Agent, DeferredToolResults, DeferredToolRequests
from pydantic_ai.messages import ModelMessage
from pydantic_ai.capabilities import CombinedCapability

from .deps import ArnessaDeps, ArnessaEvent, EventSink
from .capabilities import AgentState

logger = logging.getLogger("arnessa.publish")
T = TypeVar("T")

@dataclass
class Session:
    session_id: str
    agent: Agent[Any, Any]
    deps: ArnessaDeps
    queue: asyncio.Queue[Optional[ArnessaEvent]] = field(default_factory=asyncio.Queue)
    history: List[ModelMessage] = field(default_factory=list)
    last_seen: float = field(default_factory=time.time)

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Session] = {}

    def get_or_create(self, session_id: str, agent: Agent[Any, Any], deps: ArnessaDeps) -> Session:
        if session_id not in self.sessions:
            self.sessions[session_id] = Session(session_id, agent, deps)
        session = self.sessions[session_id]
        session.last_seen = time.time()
        return session

    def get(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)

class ArnessaEventSink(EventSink):
    def __init__(self, queue: asyncio.Queue[Optional[ArnessaEvent]]):
        self.queue = queue
        self._seq = 0

    async def emit(self, event: ArnessaEvent) -> None:
        self._seq += 1
        event.seq = self._seq
        if event.timestamp is None:
            event.timestamp = time.time()
        print(f"[ArnessaApp] Emitting event: {event.kind}")
        await self.queue.put(event)

session_manager = SessionManager()

async def sse_generator(queue: asyncio.Queue[Optional[ArnessaEvent]], session_id: str) -> AsyncIterable[str]:
    while True:
        event = await queue.get()
        if event is None:
            print("[ArnessaApp] SSE stream termination requested")
            queue.task_done()
            break

        if event.session_id is None:
            event.session_id = session_id
        
        data = json.dumps(asdict(event))
        yield f"data: {data}\n\n"
        queue.task_done()

class ArnessaApp(Starlette):
    def __init__(self, agent: Agent[Any, Any]):
        self.agent = agent
        routes = [
            Route("/run", self.run, methods=["POST"]),
            Route("/run/{session_id}", self.reconnect, methods=["GET"]),
            Route("/run/{session_id}/resolve", self.resolve, methods=["POST"]),
            Route("/run/{session_id}/patch", self.patch, methods=["POST"]),
        ]
        super().__init__(routes=routes)

    async def run(self, request: Request) -> Response:
        print("[ArnessaApp] POST /run received")
        body = await request.json()
        message = body.get("message")
        session_id = body.get("session_id") or str(uuid.uuid4())
        custom_deps_data = body.get("deps", {})

        print(f"[ArnessaApp] Starting run for session {session_id} with message: {message}")

        deps = ArnessaDeps(session_id=session_id)
        
        agent_state_cap = self._find_agent_state_capability(self.agent)
        if agent_state_cap:
             state_type = agent_state_cap.state_type
             try:
                 deps.state = state_type()
             except Exception:
                 pass

        for k, v in custom_deps_data.items():
            if hasattr(deps, k):
                setattr(deps, k, v)
        
        session = session_manager.get_or_create(session_id, self.agent, deps)
        session.deps.events = ArnessaEventSink(session.queue)

        asyncio.create_task(self._run_agent(session, message))

        return StreamingResponse(
            sse_generator(session.queue, session_id),
            media_type="text/event-stream"
        )

    def _find_agent_state_capability(self, agent: Agent[Any, Any]) -> Optional[AgentState[Any]]:
        root = agent.root_capability
        return self._search_capability(root)

    def _search_capability(self, cap: Any) -> Optional[AgentState[Any]]:
        if isinstance(cap, AgentState):
            return cap
        if isinstance(cap, CombinedCapability):
            for sub in cap.capabilities:
                res = self._search_capability(sub)
                if res:
                    return res
        return None

    async def _run_agent(self, session: Session, message: Optional[str] = None, deferred_results: Optional[DeferredToolResults] = None):
        try:
            print(f"[ArnessaApp] Running agent {session.session_id}...")
            result = await session.agent.run(
                message, 
                deps=session.deps, 
                message_history=session.history,
                deferred_tool_results=deferred_results
            )
            session.history = result.all_messages()
            print(f"[ArnessaApp] Run complete for {session.session_id}")
            await session.deps.events.emit(ArnessaEvent(
                kind="run_complete",
                payload={"output": result.output},
                session_id=session.session_id
            ))
        except Exception as e:
            print(f"[ArnessaApp] Run error for {session.session_id}: {e}")
            if hasattr(e, "all_messages"):
                 session.history = e.all_messages() # type: ignore

            if not isinstance(e, asyncio.CancelledError):
                await session.deps.events.emit(ArnessaEvent(
                    kind="run_error",
                    payload={"error": str(e)},
                    session_id=session.session_id
                ))
        finally:
            await session.queue.put(None)

    async def reconnect(self, request: Request) -> Response:
        print("[ArnessaApp] GET /reconnect received")
        session_id = cast(str, request.path_params.get("session_id"))
        session = session_manager.get(session_id)
        if not session:
            return Response("Session not found", status_code=404)
        
        return StreamingResponse(
            sse_generator(session.queue, session_id),
            media_type="text/event-stream"
        )

    async def resolve(self, request: Request) -> Response:
        print("[ArnessaApp] POST /resolve received")
        session_id = cast(str, request.path_params.get("session_id"))
        session = session_manager.get(session_id)
        if not session:
            return Response("Session not found", status_code=404)
        
        body = await request.json()
        call_id = body.get("call_id")
        result_data = body.get("result")

        session.deps.events = ArnessaEventSink(session.queue)

        await session.deps.events.emit(ArnessaEvent(
            kind="tool_resolution_ack",
            payload={"call_id": call_id, "status": "accepted"},
            session_id=session_id
        ))

        deferred_results = DeferredToolResults(calls={call_id: result_data})
        
        asyncio.create_task(self._run_agent(session, deferred_results=deferred_results))
        
        return StreamingResponse(
            sse_generator(session.queue, session_id),
            media_type="text/event-stream"
        )

    async def patch(self, request: Request) -> Response:
        print("[ArnessaApp] POST /patch received")
        session_id = cast(str, request.path_params.get("session_id"))
        session = session_manager.get(session_id)
        if not session:
            return Response("Session not found", status_code=404)
        
        body = await request.json()
        patch = body.get("patch", {})

        state = session.deps.state
        if hasattr(state, "model_dump"):
            for k, v in patch.items():
                if hasattr(state, k):
                    setattr(state, k, v)
        elif hasattr(state, "__dict__"):
            for k, v in patch.items():
                setattr(state, k, v)
        
        await session.deps.events.emit(ArnessaEvent(
            kind="state_changed",
            payload={
                "state": self._serialize_state(state), 
                "writable_fields": list(patch.keys())
            },
            session_id=session_id
        ))

        return Response("OK")

    def _serialize_state(self, state: Any) -> Any:
        if hasattr(state, "model_dump"):
            return state.model_dump()
        if hasattr(state, "__dict__"):
            return copy.copy(state.__dict__)
        return state

async def dispatch_arnessa_request(request: Request, agent: Agent[Any, Any]) -> Response:
    app = ArnessaApp(agent)
    path = request.url.path
    if path.endswith("/run") and request.method == "POST":
        return await app.run(request)
    elif "/run/" in path:
        parts = path.split("/")
        try:
            run_idx = parts.index("run")
            session_id = parts[run_idx + 1]
            if path.endswith("/resolve") and request.method == "POST":
                return await app.resolve(request)
            elif path.endswith("/patch") and request.method == "POST":
                return await app.patch(request)
            elif request.method == "GET":
                return await app.reconnect(request)
        except (ValueError, IndexError):
            pass
    
    return Response("Not Found", status_code=404)
