from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic_ai.ui import StateHandler


@dataclass
class ArnessaEvent:
    kind: str
    payload: dict[str, Any]
    session_id: str | None = None
    seq: int | None = None
    timestamp: float | None = None


class EventSink(Protocol):
    async def emit(self, event: ArnessaEvent) -> None: ...


class NullEventSink:
    async def emit(self, event: ArnessaEvent) -> None:
        return None


@dataclass
class ArnessaDeps(StateHandler):
    state: Any = None
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    events: EventSink = field(default_factory=NullEventSink)
    metadata: dict[str, Any] = field(default_factory=dict)
