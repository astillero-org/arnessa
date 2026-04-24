from __future__ import annotations

import argparse
import asyncio
import importlib
import importlib.util
import json
import sys
from dataclasses import is_dataclass
from pathlib import Path
from typing import Any, AsyncIterator, cast
from uuid import uuid4

from ag_ui.core import (
    RunAgentInput,
    RunFinishedEvent,
    RunStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from dotenv import load_dotenv
from pydantic_ai import DeferredToolRequests
from pydantic_ai.run import AgentRunResultEvent
from pydantic_ai.ui._event_stream import NativeEvent
from pydantic_ai.ui.ag_ui import AGUIEventStream

from arnessa.deps import ArnessaDeps, ArnessaEvent, EventSink
from arnessa.publish import _protocol_event_dict, _protocol_events_from_arnessa, _streaming_not_supported

load_dotenv()


class CLIEventSink(EventSink):
    def __init__(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self.queue = queue

    async def emit(self, event: ArnessaEvent) -> None:
        for protocol_event in _protocol_events_from_arnessa(event):
            await self.queue.put(protocol_event)


def _module_name_for_path(file_path: Path) -> tuple[str, Path]:
    if "src" in file_path.parts:
        src_index = file_path.parts.index("src")
        import_root = Path(*file_path.parts[: src_index + 1])
        module_name = ".".join(file_path.relative_to(import_root).with_suffix("").parts)
        return module_name, import_root
    return f"arnessa_cli_{file_path.stem}_{uuid4().hex}", file_path.parent


def _load_module_from_file(file_path: Path):
    module_name, import_root = _module_name_for_path(file_path)
    if module_name.startswith("arnessa_cli_"):
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load module from {file_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    sys.path.insert(0, str(import_root))
    try:
        return importlib.import_module(module_name)
    except Exception:
        spec = importlib.util.spec_from_file_location(f"arnessa_cli_{file_path.stem}_{uuid4().hex}", file_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load module from {file_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if sys.path and sys.path[0] == str(import_root):
            sys.path.pop(0)


def load_agent(reference: str) -> Any:
    if ":" not in reference:
        raise ValueError("Agent reference must look like script.py:agent")

    file_name, attr_name = reference.split(":", 1)
    file_path = Path(file_name).expanduser().resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"Agent file not found: {file_path}")

    module = _load_module_from_file(file_path)
    if not hasattr(module, attr_name):
        raise AttributeError(f"{file_path}:{attr_name} not found")

    value = getattr(module, attr_name)
    return value() if callable(value) and hasattr(value, "__code__") and value.__code__.co_argcount == 0 else value


def build_deps(agent: Any) -> Any:
    deps_type = getattr(agent, "deps_type", None)
    if deps_type in (None, type(None)):
        return None
    if deps_type is Any:
        return ArnessaDeps()
    try:
        deps = deps_type()
    except Exception as exc:
        raise RuntimeError(
            f"Could not instantiate deps of type {deps_type!r}. Provide an agent with default-constructible deps."
        ) from exc

    if isinstance(deps, ArnessaDeps) or is_dataclass(deps):
        if hasattr(deps, "events"):
            return deps
    return deps


async def _native_to_agui_events(agent: Any, message: str, deps: Any) -> AsyncIterator[dict[str, Any]]:
    run_input = RunAgentInput(
        thread_id=str(uuid4()),
        run_id=str(uuid4()),
        state={},
        messages=[],
        tools=[],
        context=[],
        forwarded_props={},
    )
    event_stream = AGUIEventStream(run_input=run_input)
    native_events = agent.run_stream_events(message, deps=deps)
    saw_text_content = False
    final_output: Any = None

    try:
        first_event = await anext(native_events)
    except StopAsyncIteration:
        first_event = None
    except Exception as exc:
        if not _streaming_not_supported(exc):
            raise

        result = await agent.run(message, deps=deps)
        yield _protocol_event_dict(RunStartedEvent(thread_id=run_input.thread_id, run_id=run_input.run_id))
        if isinstance(result.output, str):
            message_id = str(uuid4())
            yield _protocol_event_dict(TextMessageStartEvent(message_id=message_id, role="assistant"))
            if result.output:
                yield _protocol_event_dict(TextMessageContentEvent(message_id=message_id, delta=result.output))
            yield _protocol_event_dict(TextMessageEndEvent(message_id=message_id))
        yield _protocol_event_dict(RunFinishedEvent(thread_id=run_input.thread_id, run_id=run_input.run_id))
        return

    async def native_stream() -> AsyncIterator[NativeEvent]:
        nonlocal final_output
        if first_event is not None:
            if isinstance(first_event, AgentRunResultEvent):
                final_output = first_event.result.output
            yield cast(NativeEvent, first_event)
        async for event in native_events:
            if isinstance(event, AgentRunResultEvent):
                final_output = event.result.output
            yield cast(NativeEvent, event)

    async for event in event_stream.transform_stream(native_stream()):
        event_dict = _protocol_event_dict(event)
        if event_dict.get("type") == "TEXT_MESSAGE_CONTENT":
            saw_text_content = True
        yield event_dict

    if not saw_text_content and isinstance(final_output, str) and not isinstance(final_output, DeferredToolRequests):
        message_id = str(uuid4())
        yield _protocol_event_dict(TextMessageStartEvent(message_id=message_id, role="assistant"))
        if final_output:
            yield _protocol_event_dict(TextMessageContentEvent(message_id=message_id, delta=final_output))
        yield _protocol_event_dict(TextMessageEndEvent(message_id=message_id))


async def collect_agent_events(agent: Any, message: str) -> list[dict[str, Any]]:
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    deps = build_deps(agent)
    if hasattr(deps, "events"):
        deps.events = CLIEventSink(queue)

    events: list[dict[str, Any]] = []

    async def produce_native() -> None:
        async for event in _native_to_agui_events(agent, message, deps):
            await queue.put(event)
        await queue.put({"__end__": True})

    producer = asyncio.create_task(produce_native())
    try:
        while True:
            event = await queue.get()
            if event.get("__end__"):
                break
            events.append(event)
    finally:
        await producer

    return events


async def run_cli(args: argparse.Namespace) -> int:
    agent = load_agent(args.agent)
    events = await collect_agent_events(agent, args.message)
    for event in events:
        sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="arnessa-cli")
    parser.add_argument("agent", help="Python reference like script.py:agent")
    parser.add_argument("-m", "--message", required=True, help="User message to run")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return asyncio.run(run_cli(args))


if __name__ == "__main__":
    raise SystemExit(main())
