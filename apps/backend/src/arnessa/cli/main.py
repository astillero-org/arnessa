from pydantic_ai import Agent
from dotenv import load_dotenv

from arnessa.agent import ArnessaAgentBuilder

load_dotenv()

from arnessa.agent import DEFAULT_BACKEND, Deps

backend = DEFAULT_BACKEND
assert DEFAULT_BACKEND is not None, "DEFAULT_BACKEND must be set to a valid LocalBackend instance."
    
agent = ArnessaAgentBuilder().create()

agent.to_cli_sync(deps=Deps(backend=backend))