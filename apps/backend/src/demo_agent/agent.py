import os
from pathlib import Path
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Optional, List, Dict, Set

from pydantic import BaseModel
from pydantic_ai import Agent, Tool, DeferredToolRequests
from pydantic_ai_shields import CostTracking, ToolGuard, InputGuard
from pydantic_ai_skills import SkillsCapability

from pydantic_ai_backends import create_console_toolset

from arnessa import ImageStoreCapability, get_photo_tools
import arnessa

import logfire

from .state import ArnessaState, ArnessaDeps, DEFAULT_BACKEND
from dotenv import load_dotenv

load_dotenv()

logfire.configure()
logfire.instrument_pydantic_ai()
logfire.instrument_httpx(capture_all=True)  

class ArnessaAgentBuilder:
    def __init__(self, main_model: str = 'google-gla:gemini-3-flash-preview') -> None:
        self.main_model = main_model

    def create(
        self
    ) -> Agent[ArnessaDeps, DeferredToolRequests | str]:
        console_toolset = create_console_toolset(image_support=True, require_execute_approval=False)

        # Find the skills directory within the arnessa package
        arnessa_path = Path(os.path.abspath(arnessa.__file__)).parent
        skills_dir = arnessa_path / 'skills' / 'photo-tools'

        agent = Agent(  
            self.main_model,
            instructions=f"""
                SI OCUPAS LA CONSOLA (ls, find, etc) PARA PONERTE A BUSCAR INFORMACION EN CAMBIO DE PREGUNTARLE AL USUARIO TE MATO.
                Ayudas a los usuarios a crear imagenes de muebles.
                - Tienes herramientas para acceder a las fotos actuales: list_artifacts, usala para obtener la lista de fotos actuales, no preguntes al usuario por esa informacion ni intentes adivinarla.
                - Hazlo con el skills de photo_tools.
                
                Cuando termines solo utiliza la funcion send_image_to_user para enviar la imagen al usuario, no intentes describirla ni agregarla, solo enviala.
                Tu directorio de trabajo principal es {os.environ.get("WORKSPACE_DIR", "./workspace")}
            """,
            capabilities=[
                CostTracking(), 
                ToolGuard(), 
                InputGuard(),
                SkillsCapability(directories=[skills_dir]),
                ImageStoreCapability(),
            ],
            tools=get_photo_tools(),
            output_type=[str, DeferredToolRequests],
            toolsets=[console_toolset],
            deps_type=ArnessaDeps
        )

        return agent
