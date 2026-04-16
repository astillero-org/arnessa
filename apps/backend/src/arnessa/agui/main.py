from pydantic_ai import Agent
from dotenv import load_dotenv

from arnessa.agent import ArnessaAgentBuilder

load_dotenv()

from arnessa.state import DEFAULT_BACKEND, ArnessaDeps, ArnessaState

backend = DEFAULT_BACKEND
assert DEFAULT_BACKEND is not None, "DEFAULT_BACKEND must be set to a valid LocalBackend instance."

agent = ArnessaAgentBuilder().create()

app = agent.to_ag_ui(deps=ArnessaDeps(backend=backend))

def main():
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)

if __name__ == "__main__":
    main()