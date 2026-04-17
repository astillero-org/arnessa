from pydantic_ai import Agent
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware

from arnessa.agent import ArnessaAgentBuilder

load_dotenv()

from arnessa.state import DEFAULT_BACKEND, ArnessaDeps, ArnessaState

backend = DEFAULT_BACKEND
assert DEFAULT_BACKEND is not None, "DEFAULT_BACKEND must be set to a valid LocalBackend instance."

agent = ArnessaAgentBuilder().create()

app = agent.to_ag_ui(deps=ArnessaDeps(backend=backend))

# Add CORS middleware to allow the frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, we allow all origins. Change to specific origin in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def main():
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)

if __name__ == "__main__":
    main()
