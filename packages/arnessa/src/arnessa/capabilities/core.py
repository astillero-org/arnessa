from __future__ import annotations

import time
import uuid
import copy
from dataclasses import dataclass
from typing import Any, Generic, Type, TypeVar, Optional, List

from pydantic import BaseModel
from pydantic_ai import RunContext, ToolCallPart
from pydantic_ai.capabilities import AbstractCapability, WrapToolExecuteHandler
from pydantic_ai.toolsets import AgentToolset, FunctionToolset
from pydantic_ai.exceptions import CallDeferred
from pydantic_ai.tools import ToolDefinition

from ..deps import ArnessaDeps, ArnessaEvent

T = TypeVar("T")

@dataclass
class AgentState(AbstractCapability[ArnessaDeps], Generic[T]):
    state_type: Type[T]

    def get_toolset(self) -> Optional[AgentToolset[ArnessaDeps]]:
        toolset = FunctionToolset[ArnessaDeps]()

        @toolset.tool
        async def read_state(ctx: RunContext[ArnessaDeps]) -> T:
            """Read the current structured state."""
            return ctx.deps.state

        @toolset.tool
        async def patch_state(ctx: RunContext[ArnessaDeps], patch: dict[str, Any]) -> T:
            """
            Apply a shallow partial update to the current structured state.
            Only top-level fields can be patched.
            """
            current_state = ctx.deps.state
            
            # If state is None, initialize it with state_type
            if current_state is None:
                if issubclass(self.state_type, BaseModel):
                    current_state = self.state_type()
                else:
                    current_state = self.state_type()

            if isinstance(current_state, BaseModel):
                new_state_dict = current_state.model_dump()
                new_state_dict.update(patch)
                new_state = type(current_state).model_validate(new_state_dict) # type: ignore
            elif hasattr(current_state, "__dict__"):
                for key, value in patch.items():
                    setattr(current_state, key, value)
                new_state = current_state
            else:
                # Fallback for simple types or if state is not easily patchable
                new_state = current_state

            ctx.deps.state = new_state
            
            await ctx.deps.events.emit(ArnessaEvent(
                kind="state_changed",
                payload={
                    "state": self._serialize_state(new_state),
                    "writable_fields": self._get_writable_fields(new_state)
                },
                session_id=ctx.deps.session_id,
                timestamp=time.time()
            ))
            return new_state

        return toolset

    def _serialize_state(self, state: Any) -> Any:
        if isinstance(state, BaseModel):
            return state.model_dump()
        if hasattr(state, "__dict__"):
            return copy.copy(state.__dict__)
        return state

    def _get_writable_fields(self, state: Any) -> List[str]:
        if isinstance(state, BaseModel):
            return list(type(state).model_fields.keys())
        if hasattr(state, "__dict__"):
            return list(state.__dict__.keys())
        return []

@dataclass
class DeferredCalls(AbstractCapability[ArnessaDeps]):
    async def wrap_tool_execute(
        self,
        ctx: RunContext[ArnessaDeps],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        handler: WrapToolExecuteHandler,
    ) -> Any:
        try:
            return await handler(args)
        except CallDeferred as e:
            # Emit tool_deferred event
            await ctx.deps.events.emit(ArnessaEvent(
                kind="tool_deferred",
                payload={
                    "call_id": call.tool_call_id,
                    "tool_name": tool_def.name,
                    "args": args,
                    "schema": tool_def.parameters_json_schema
                },
                session_id=ctx.deps.session_id,
                timestamp=time.time()
            ))
            raise e

@dataclass
class DynamicUI(AbstractCapability[ArnessaDeps]):
    def get_toolset(self) -> Optional[AgentToolset[ArnessaDeps]]:
        toolset = FunctionToolset[ArnessaDeps]()

        @toolset.tool
        async def mount_component(
            ctx: RunContext[ArnessaDeps], 
            slot: str, 
            component: str, 
            props: dict[str, Any], 
            component_id: Optional[str] = None,
            mode: str = "replace"
        ) -> str:
            """Mount a registered React component in a named frontend slot."""
            actual_component_id = component_id or str(uuid.uuid4())
            await ctx.deps.events.emit(ArnessaEvent(
                kind="ui_mount",
                payload={
                    "component_id": actual_component_id,
                    "slot": slot,
                    "component": component,
                    "props": props,
                    "mode": mode
                },
                session_id=ctx.deps.session_id,
                timestamp=time.time()
            ))
            return f"Component {actual_component_id} mounted in {slot}"

        @toolset.tool
        async def update_component(
            ctx: RunContext[ArnessaDeps], 
            component_id: str, 
            props: dict[str, Any]
        ) -> str:
            """Update props of a mounted component."""
            await ctx.deps.events.emit(ArnessaEvent(
                kind="ui_update",
                payload={
                    "component_id": component_id,
                    "props": props
                },
                session_id=ctx.deps.session_id,
                timestamp=time.time()
            ))
            return f"Component {component_id} updated"

        @toolset.tool
        async def unmount_component(
            ctx: RunContext[ArnessaDeps], 
            component_id: str
        ) -> str:
            """Unmount a component."""
            await ctx.deps.events.emit(ArnessaEvent(
                kind="ui_unmount",
                payload={
                    "component_id": component_id
                },
                session_id=ctx.deps.session_id,
                timestamp=time.time()
            ))
            return f"Component {component_id} unmounted"

        return toolset
