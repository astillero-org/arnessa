import os 

from dataclasses import dataclass, field
from typing import List, Set, Any, Optional
from dataclasses import dataclass, field

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, Tool, DeferredToolRequests
from pydantic_ai.ui import StateHandler, StateDeps
from pydantic_ai_backends import LocalBackend

load_dotenv()

class ArnessaState(BaseModel):
    """State model for the Arnessa agent."""
    # Define any state variables you want to track here
    artifact_store: List[str] = field(default_factory=list)
    processed_user_prompts: Set[str] = field(default_factory=set)
    
DEFAULT_BACKEND = LocalBackend(root_dir=os.environ.get("WORKSPACE_DIR", "./workspace"))
@dataclass
class ArnessaDeps(StateHandler):
    backend: LocalBackend = field(default_factory=lambda: DEFAULT_BACKEND)
    _state: ArnessaState = field(default_factory=ArnessaState)
    
    @property
    def state(self) -> ArnessaState:
        return self._state
    
    @state.setter
    def state(self, new_state: ArnessaState) -> None:
        self._state = new_state