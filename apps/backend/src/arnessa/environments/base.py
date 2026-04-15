from abc import ABC, abstractmethod
from typing import Any, Protocol, Dict

class Environment(Protocol):
    """Protocol defining the interface for all environment types."""
    env_id: str
    config: Dict[str, Any]
    
    @abstractmethod
    def execute_command(self, cmd: str) -> str:
        """Executes a shell command in the environment."""
        ...
        
    @abstractmethod
    def read_file(self, path: str) -> str:
        """Reads a file from the environment."""
        ...
        
    @abstractmethod
    def write_file(self, path: str, content: str) -> None:
        """Writes a file to the environment."""
        ...

class BaseEnvironment(ABC):
    """Abstract base class for environment implementations."""
    
    def __init__(self, env_id: str, config: Dict[str, Any]):
        self.env_id: str = env_id
        self.config: Dict[str, Any] = config
