import os

from dataclasses import dataclass, field

from datetime import UTC, datetime
from typing import Any, Optional, List, Dict, Set

from pydantic_ai import Agent, Tool, DeferredToolRequests
from pydantic_ai_shields import CostTracking, ToolGuard, InputGuard
from pydantic_ai_skills import SkillsCapability
from pydantic_ai_harness import CodeMode

from pydantic_ai_backends.capability import ConsoleCapability
from pydantic_ai_backends import create_console_toolset
from pydantic_ai_backends import LocalBackend

from arnessa.environments import EnvironmentManagerHandle
from arnessa.capabilities.image_store import ImageStoreCapability

from pathlib import Path

import logfire

from arnessa.tools.photo_tools import get_photo_tools
from dotenv import load_dotenv

load_dotenv()

logfire.configure()
logfire.instrument_pydantic_ai()
logfire.instrument_httpx(capture_all=True)  

def get_script_directory() -> Path:
    """Utility function to get the directory of the current script."""
    import os
    return Path(os.path.dirname(os.path.abspath(__file__)))

@dataclass
class Deps:
    backend: LocalBackend
    artifact_store: List[str] = field(default_factory=list)
    processed_user_prompts: Set[str] = field(default_factory=set)

DEFAULT_BACKEND = LocalBackend(root_dir=os.environ.get("WORKSPACE_DIR", "./workspace"))

class ArnessaAgentBuilder:
    def __init__(self, main_model: str = 'google-gla:gemini-3-flash-preview') -> None:
        self.main_model = main_model

    def create(
        self
    ) -> Agent:
        #tools = self._build_tools(env_handle, session, mcp_registry)
        #subagents = self._build_subagents(env_handle, mcp_registry)
        #system_prompt = self._build_prompt(tools, subagents)

        #shared = self._build_shared_middleware(env_handle)
        #subagent_mw = self._build_subagent_middleware(shared)
        #main_mw = self._build_main_middleware(shared, subagents, subagent_mw, session)

        #env_tools: List[Tool] = env_handle.get_pydantic_tools()

        console_toolset = create_console_toolset(image_support=True, require_execute_approval=False)

        agent = Agent(  
            self.main_model,
            instructions=f"""
                SI OCUPAS LA CONSOLA (ls, find, etc) PARA PONERTE A BUSCAR INFORMACION EN CAMBIO DE PREGUNTARLE AL USUARIO TE MATO.
                Ayudas a los usuarios a crear imagenes de muebles.
                - Tienes herramientas para acceder a las fotos actuales.
                - No te dediques a buscar tu con ls/find/grep los skills, codigo o cosas asi. Falla rapido si no encuentras algo. Usa las tools y skills directamente.
                - No uses el .env ni lo veas.
                
                Cuando termines devuelve la imagen como data:base64, y el path donde la guardaste en workspace en el mensaje.
                Tu directorio de trabajo principal es {os.environ.get("WORKSPACE_DIR", "./workspace")}
            """,
            capabilities=[
                CostTracking(), 
                ToolGuard(), 
                InputGuard(),
                SkillsCapability(directories=[get_script_directory() / 'skills']),
                ImageStoreCapability(),
            ],
            tools=get_photo_tools(),
            output_type=[str, DeferredToolRequests],
            toolsets=[console_toolset],
            deps_type=Deps
            #tools=env_tools
        )

        return agent
