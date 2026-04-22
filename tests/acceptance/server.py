import os
import uvicorn
import asyncio
import copy
from arnessa.pydanticai.publish import ArnessaApp
from arnessa.pydanticai.capabilities import AgentState, DeferredCalls, DynamicUI
from pydantic_ai import Agent, RunContext, DeferredToolRequests
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart, ModelRequest, ToolReturnPart
from pydantic_ai.exceptions import CallDeferred
from pydantic import BaseModel
from typing import Any, List, Union
from dotenv import load_dotenv

load_dotenv()

class State(BaseModel):
    count: int = 0
    message: str = "init"

async def test_model_handler(messages: List[Any], info: Any) -> ModelResponse:
    last_message = messages[-1]
    prompt = ""
    if isinstance(last_message, ModelRequest):
        for part in last_message.parts:
            if hasattr(part, "content"):
                prompt = str(part.content)
            elif isinstance(part, ToolReturnPart):
                # Response to a tool call
                return ModelResponse(parts=[TextPart(f"Tool {part.tool_name} returned {part.content}")])

    if "Arnessa is alive" in prompt:
        return ModelResponse(parts=[TextPart("Arnessa is alive")])
    
    if "Set the count to 99" in prompt:
        return ModelResponse(parts=[
            ToolCallPart(
                tool_name="patch_state", 
                args={"patch": {"count": 99}}, 
                tool_call_id="call_patch_99"
            )
        ])
    
    if "Mount a 'WeatherCard'" in prompt:
        return ModelResponse(parts=[
            ToolCallPart(
                tool_name="mount_component", 
                args={"slot": "sidebar", "component": "WeatherCard", "props": {"temp": 25}}, 
                tool_call_id="call_mount_ui"
            )
        ])
    
    if "Ask me 'What is your favorite color?'" in prompt:
        return ModelResponse(parts=[
            ToolCallPart(
                tool_name="wait_for_human", 
                args={"question": "What is your favorite color?"}, 
                tool_call_id="call_deferred_1"
            )
        ])
    
    if "Blue is my favorite color." in prompt:
        return ModelResponse(parts=[TextPart("I like blue too!")])

    return ModelResponse(parts=[TextPart("Default response")])

model = FunctionModel(test_model_handler)

agent: Agent[Any, Union[str, DeferredToolRequests]] = Agent(
    model=model, 
    output_type=Union[str, DeferredToolRequests],
    deps_type=Any,
    capabilities=[
        AgentState(State), 
        DeferredCalls(), 
        DynamicUI()
    ], 
    system_prompt="You are a test agent."
)

@agent.tool
async def wait_for_human(ctx: RunContext[Any], question: str) -> str:
    """Suscribe current run and wait for a human to provide an answer."""
    raise CallDeferred(metadata={"question": question})

@agent.tool
async def finish_test(ctx: RunContext[Any]) -> str:
    """Call this when the test sequence is complete."""
    return "test_finished_successfully"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8002))
    app = ArnessaApp(agent)
    
    from starlette.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from starlette.routing import Route
    from starlette.responses import PlainTextResponse
    app.routes.append(Route("/", lambda req: PlainTextResponse("OK")))
    
    uvicorn.run(app, host="127.0.0.1", port=port)
