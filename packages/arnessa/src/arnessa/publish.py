from __future__ import annotations

import asyncio
import json
import time
import uuid
import copy
import logging
from dataclasses import asdict, dataclass, field
from typing import Any, AsyncIterable, Dict, List, Optional, TypeVar, cast

from ag_ui.core import (
    CustomEvent,
    EventType,
    RunAgentInput,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StateSnapshotEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from starlette.routing import Route
from pydantic_ai import Agent, DeferredToolResults, DeferredToolRequests
from pydantic_ai.messages import ModelMessage
from pydantic_ai.capabilities import CombinedCapability
from pydantic_ai.run import AgentRunResultEvent
from pydantic_ai.ui._event_stream import NativeEvent
from pydantic_ai.ui.ag_ui import AGUIEventStream

from .deps import ArnessaDeps, ArnessaEvent, EventSink
from .capabilities import AgentState

logger = logging.getLogger("arnessa.publish")
T = TypeVar("T")

@dataclass
class Session:
    session_id: str
    agent: Agent[Any, Any]
    deps: ArnessaDeps
    queue: asyncio.Queue[Optional[dict[str, Any]]] = field(default_factory=asyncio.Queue)
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
    def __init__(self, queue: asyncio.Queue[Optional[dict[str, Any]]]):
        self.queue = queue
        self._seq = 0

    async def emit(self, event: ArnessaEvent) -> None:
        self._seq += 1
        event.seq = self._seq
        if event.timestamp is None:
            event.timestamp = time.time()
        print(f"[ArnessaApp] Emitting event: {event.kind}")
        for protocol_event in _protocol_events_from_arnessa(event):
            await self.queue.put(protocol_event)

session_manager = SessionManager()

def _timestamp_ms(timestamp: float | None) -> int | None:
    if timestamp is None:
        return None
    if timestamp > 1_000_000_000_000:
        return int(timestamp)
    return int(timestamp * 1000)


def _custom_protocol_event(name: str, value: Any, timestamp: float | None) -> dict[str, Any]:
    return cast(dict[str, Any], CustomEvent(name=name, value=value, timestamp=_timestamp_ms(timestamp)).model_dump(
        mode="json", by_alias=True, exclude_none=True
    ))


def _protocol_events_from_arnessa(event: ArnessaEvent) -> list[dict[str, Any]]:
    if event.kind == "state_changed":
        return [
            cast(
                dict[str, Any],
                StateSnapshotEvent(snapshot=event.payload.get("state"), timestamp=_timestamp_ms(event.timestamp)).model_dump(
                    mode="json", by_alias=True, exclude_none=True
                ),
            ),
            _custom_protocol_event("arnessa.stateChanged", event.payload, event.timestamp),
        ]

    custom_names = {
        "tool_deferred": "arnessa.toolDeferred",
        "tool_resolution_ack": "arnessa.toolResolutionAck",
        "ui_mount": "arnessa.uiMount",
        "ui_update": "arnessa.uiUpdate",
        "ui_unmount": "arnessa.uiUnmount",
    }
    return [_custom_protocol_event(custom_names.get(event.kind, f"arnessa.{event.kind}"), event.payload, event.timestamp)]


def _protocol_event_dict(event: Any) -> dict[str, Any]:
    if hasattr(event, "model_dump"):
        return cast(dict[str, Any], event.model_dump(mode="json", by_alias=True, exclude_none=True))
    if isinstance(event, dict):
        return event
    return cast(dict[str, Any], asdict(event))


def _streaming_not_supported(error: Exception) -> bool:
    return "stream_function" in str(error) and "support streamed requests" in str(error)


async def _enqueue_protocol_event(queue: asyncio.Queue[Optional[dict[str, Any]]], event: Any) -> None:
    await queue.put(_protocol_event_dict(event))


async def sse_generator(queue: asyncio.Queue[Optional[dict[str, Any]]], session_id: str) -> AsyncIterable[str]:
    while True:
        event = await queue.get()
        if event is None:
            print("[ArnessaApp] SSE stream termination requested")
            queue.task_done()
            break

        if event.get("type") == EventType.RUN_STARTED.value and not event.get("threadId"):
            event["threadId"] = session_id

        data = json.dumps(event)
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
            run_input = RunAgentInput(
                thread_id=session.session_id,
                run_id=str(uuid.uuid4()),
                state={},
                messages=[],
                tools=[],
                context=[],
                forwarded_props={},
            )
            event_stream = AGUIEventStream(run_input=run_input)
            native_events = session.agent.run_stream_events(
                message,
                deps=session.deps,
                message_history=session.history,
                deferred_tool_results=deferred_results,
            )

            try:
                first_event = await anext(native_events)
            except StopAsyncIteration:
                first_event = None
            except Exception as stream_error:
                if not _streaming_not_supported(stream_error):
                    raise

                print(f"[ArnessaApp] Falling back to non-streaming AG-UI for {session.session_id}: {stream_error}")
                await _enqueue_protocol_event(
                    session.queue,
                    RunStartedEvent(thread_id=session.session_id, run_id=run_input.run_id),
                )
                result = await session.agent.run(
                    message,
                    deps=session.deps,
                    message_history=session.history,
                    deferred_tool_results=deferred_results,
                )
                session.history = result.all_messages()
                print(f"[ArnessaApp] Run complete for {session.session_id}")

                if result.output is not None:
                    message_id = str(uuid.uuid4())
                    output = result.output if isinstance(result.output, str) else str(result.output)
                    await _enqueue_protocol_event(
                        session.queue,
                        TextMessageStartEvent(message_id=message_id, role="assistant"),
                    )
                    if output:
                        await _enqueue_protocol_event(
                            session.queue,
                            TextMessageContentEvent(message_id=message_id, delta=output),
                        )
                    await _enqueue_protocol_event(session.queue, TextMessageEndEvent(message_id=message_id))

                await _enqueue_protocol_event(
                    session.queue,
                    RunFinishedEvent(thread_id=session.session_id, run_id=run_input.run_id),
                )
                return

            async def native_stream() -> AsyncIterable[NativeEvent]:
                if first_event is not None:
                    if isinstance(first_event, AgentRunResultEvent):
                        session.history = first_event.result.all_messages()
                        print(f"[ArnessaApp] Run complete for {session.session_id}")
                    yield first_event

                async for event in native_events:
                    if isinstance(event, AgentRunResultEvent):
                        session.history = event.result.all_messages()
                        print(f"[ArnessaApp] Run complete for {session.session_id}")
                    yield event

            async for event in event_stream.transform_stream(cast(Any, native_stream())):
                await session.queue.put(_protocol_event_dict(event))
        except Exception as e:
            print(f"[ArnessaApp] Run error for {session.session_id}: {e}")
            if hasattr(e, "all_messages"):
                 session.history = e.all_messages() # type: ignore
            if not isinstance(e, asyncio.CancelledError):
                await _enqueue_protocol_event(session.queue, RunErrorEvent(message=str(e)))
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
