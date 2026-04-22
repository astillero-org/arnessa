import pytest
import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, List, cast
from pydantic import BaseModel

from arnessa.pydanticai.deps import ArnessaDeps, ArnessaEvent
from arnessa.pydanticai.capabilities import AgentState, DeferredCalls, DynamicUI
from pydantic_ai import RunContext
from pydantic_ai.exceptions import CallDeferred
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.toolsets import FunctionToolset

class MockEventSink:
    def __init__(self):
        self.events: List[ArnessaEvent] = []

    async def emit(self, event: ArnessaEvent) -> None:
        self.events.append(event)

class StateForTest(BaseModel):
    count: int = 0
    name: str = "test"

@pytest.mark.asyncio
async def test_agent_state():
    sink = MockEventSink()
    state = StateForTest()
    deps = ArnessaDeps(state=state, events=sink, session_id="session-123")
    cap = AgentState(state_type=StateForTest)
    
    toolset = cast(FunctionToolset, cap.get_toolset())
    assert toolset is not None
    
    ctx = RunContext(deps=deps, model=None, usage=None) # type: ignore
    tools = await toolset.get_tools(ctx)
    
    # Test read_state
    tool = tools["read_state"]
    result = await toolset.call_tool("read_state", {}, ctx, tool)
    assert result.count == 0
    
    # Test patch_state
    tool = tools["patch_state"]
    result = await toolset.call_tool("patch_state", {"patch": {"count": 1, "name": "updated"}}, ctx, tool)
    assert result.count == 1
    assert result.name == "updated"
    assert deps.state.count == 1
    
    # Check event
    assert len(sink.events) == 1
    event = sink.events[0]
    assert event.kind == "state_changed"
    assert event.payload["state"]["count"] == 1
    assert "count" in event.payload["writable_fields"]

@pytest.mark.asyncio
async def test_deferred_calls():
    sink = MockEventSink()
    deps = ArnessaDeps(events=sink, session_id="session-123")
    cap = DeferredCalls()
    
    ctx = RunContext(deps=deps, model=None, usage=None) # type: ignore
    
    async def failing_handler(args):
        raise CallDeferred(metadata={"foo": "bar"})
    
    tool_def = ToolDefinition(
        name="test_tool",
        description="test",
        parameters_json_schema={"type": "object"}
    )
    
    from unittest.mock import MagicMock
    call = MagicMock()
    call.tool_call_id = "call-456"
    
    with pytest.raises(CallDeferred):
        await cap.wrap_tool_execute(
            ctx, 
            call=call, 
            tool_def=tool_def, 
            args={"input": "val"}, 
            handler=failing_handler
        )
    
    # Check event
    assert len(sink.events) == 1
    event = sink.events[0]
    assert event.kind == "tool_deferred"
    assert event.payload["call_id"] == "call-456"
    assert event.payload["tool_name"] == "test_tool"
    assert event.payload["args"] == {"input": "val"}

@pytest.mark.asyncio
async def test_dynamic_ui():
    sink = MockEventSink()
    deps = ArnessaDeps(events=sink, session_id="session-123")
    cap = DynamicUI()
    
    toolset = cast(FunctionToolset, cap.get_toolset())
    ctx = RunContext(deps=deps, model=None, usage=None) # type: ignore
    tools = await toolset.get_tools(ctx)
    
    # Test mount
    tool = tools["mount_component"]
    await toolset.call_tool("mount_component", {
        "slot": "sidebar", 
        "component": "Badge", 
        "props": {"text": "hi"},
        "component_id": "b1"
    }, ctx, tool)
    
    assert len(sink.events) == 1
    assert sink.events[0].kind == "ui_mount"
    assert sink.events[0].payload["slot"] == "sidebar"
    
    # Test update
    tool = tools["update_component"]
    await toolset.call_tool("update_component", {
        "component_id": "b1",
        "props": {"text": "bye"}
    }, ctx, tool)
    
    assert len(sink.events) == 2
    assert sink.events[1].kind == "ui_update"
    assert sink.events[1].payload["props"] == {"text": "bye"}
    
    # Test unmount
    tool = tools["unmount_component"]
    await toolset.call_tool("unmount_component", {"component_id": "b1"}, ctx, tool)
    
    assert len(sink.events) == 3
    assert sink.events[2].kind == "ui_unmount"
    assert sink.events[2].payload["component_id"] == "b1"
