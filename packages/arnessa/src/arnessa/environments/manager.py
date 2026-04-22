from typing import Any, Dict, Optional
import uuid

from arnessa.environments.base import Environment
from arnessa.environments.handle import EnvironmentManagerHandle

class EnvironmentManager:
    """Manages different types of environments (Local, K8s, etc.)."""
    
    def __init__(self) -> None:
        self._environments: Dict[str, Environment] = {}
        
    def create_environment(self, env_type: str, config: Dict[str, Any]) -> str:
        """
        Creates a new environment of a specified type.
        Returns the environment ID.
        """
        env_id: str = str(uuid.uuid4())
        # Implementation stub
        return env_id
        
    def get_environment(self, env_id: str) -> Optional[Environment]:
        """Returns an environment by its ID."""
        return self._environments.get(env_id)
        
    def delete_environment(self, env_id: str) -> None:
        """Deletes an environment by its ID."""
        if env_id in self._environments:
            del self._environments[env_id]
            
    def get_handle(self) -> EnvironmentManagerHandle:
        """Returns a handle for the agent to use."""
        return EnvironmentManagerHandle(self)

    # Core environment operations proxied through the manager
    def execute_command(self, env_id: str, cmd: str) -> str:
        env: Optional[Environment] = self.get_environment(env_id)
        if not env:
            raise ValueError(f"Environment {env_id} not found.")
        return env.execute_command(cmd)

    def read_file(self, env_id: str, path: str) -> str:
        env: Optional[Environment] = self.get_environment(env_id)
        if not env:
            raise ValueError(f"Environment {env_id} not found.")
        return env.read_file(path)

    def write_file(self, env_id: str, path: str, content: str) -> None:
        env: Optional[Environment] = self.get_environment(env_id)
        if not env:
            raise ValueError(f"Environment {env_id} not found.")
        env.write_file(path, content)
