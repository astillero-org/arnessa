import os 

from dataclasses import dataclass, field
from typing import List, Set, Any, Optional

from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai_backends import LocalBackend

from arnessa.pydanticai.deps import ArnessaDeps as BaseArnessaDeps

load_dotenv()

class ArnessaState(BaseModel):
    """State model for the Arnessa agent."""
    artifact_store: List[str] = field(default_factory=list)
    processed_user_prompts: Set[str] = field(default_factory=set)
    
DEFAULT_BACKEND = LocalBackend(root_dir=os.environ.get("WORKSPACE_DIR", "./workspace"))

@dataclass
class ArnessaDeps(BaseArnessaDeps):
    backend: LocalBackend = field(default_factory=lambda: DEFAULT_BACKEND)
    state: ArnessaState = field(default_factory=ArnessaState)
