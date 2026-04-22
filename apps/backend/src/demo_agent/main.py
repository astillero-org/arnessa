from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware

from .agent import ArnessaAgentBuilder
from arnessa import ArnessaApp

load_dotenv()

from .state import DEFAULT_BACKEND

backend = DEFAULT_BACKEND
assert DEFAULT_BACKEND is not None, "DEFAULT_BACKEND must be set to a valid LocalBackend instance."

agent = ArnessaAgentBuilder().create()

# Use the new ArnessaApp for the backend
app = ArnessaApp(agent)

# Add CORS middleware to allow the frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def main():
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)

if __name__ == "__main__":
    main()
