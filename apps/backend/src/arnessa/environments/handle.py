from typing import Any, Dict, List, TYPE_CHECKING
from pydantic_ai import Tool

if TYPE_CHECKING:
    from arnessa.environments.manager import EnvironmentManager

class EnvironmentManagerHandle:
    """
    Handle to EnvironmentManager given to Agents.
    Provides proxy methods and Pydantic AI tools without giving direct access to the manager.
    """
    
    def __init__(self, manager: "EnvironmentManager") -> None:
        self._manager: "EnvironmentManager" = manager
        
    def get_pydantic_tools(self) -> List[Tool]:
        """
        Returns a list of Pydantic AI tools that the agent can use to interact with environments.
        """
        # Define Pydantic AI tools that call the manager
        return [
            Tool(
                self._manager.create_environment,
                name="create_environment",
                description="Creates a new environment of a specified type (local, k8s)."
            ),
            Tool(
                self._manager.execute_command,
                name="execute_command",
                description="Executes a shell command in a specified environment."
            ),
            Tool(
                self._manager.read_file,
                name="read_file",
                description="Reads a file from a specified environment."
            ),
            Tool(
                self._manager.write_file,
                name="write_file",
                description="Writes a file to a specified environment."
            ),
            Tool(
                self._manager.delete_environment,
                name="delete_environment",
                description="Deletes a specified environment."
            )
        ]
        
    def get_mcp_capabilities(self) -> Dict[str, Any]:
        """
        Returns the MCP capabilities associated with this handle.
        (Placeholder for MCP tool registration/discovery logic).
        """
        return {
            "mcp_tools": [
                # List of MCP tool definitions here
            ]
        }
