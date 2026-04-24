import os
import json
import uvicorn
import asyncio
import copy
from arnessa import ArnessaApp, AgentState, DeferredCalls, DynamicUI, ImageStoreCapability
from pydantic_ai import Agent, RunContext, DeferredToolRequests
from pydantic_ai.models.function import FunctionModel, DeltaToolCall
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
            if isinstance(part, ToolReturnPart):
                if part.tool_name == "generate_furniture_image":
                    return ModelResponse(parts=[
                        ToolCallPart(
                            tool_name="send_image_to_user",
                            args={
                                "image_path": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect width='320' height='200' fill='%23facc15'/%3E%3Ctext x='32' y='110' font-size='28'%3EChair render%3C/text%3E%3C/svg%3E",
                                "caption": "Here is the approved drawing.",
                            },
                            tool_call_id="call_send_drawing_image",
                        )
                    ])
                if part.tool_name == "send_image_to_user":
                    return ModelResponse(parts=[TextPart("Approved drawing sent.")])
                # Response to a tool call
                return ModelResponse(parts=[TextPart(f"Tool {part.tool_name} returned {part.content}")])
            elif hasattr(part, "content"):
                prompt = str(part.content)

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

    if "Draw a chair with approval" in prompt:
        return ModelResponse(parts=[
            ToolCallPart(
                tool_name="generate_furniture_image",
                args={"input_path": "chair.jpg", "prompt": "Draw a yellow lounge chair", "output_path": "e2e-chair-render.png"},
                tool_call_id="call_draw_approval_1",
            )
        ])
    
    if "Blue is my favorite color." in prompt:
        return ModelResponse(parts=[TextPart("I like blue too!")])

    return ModelResponse(parts=[TextPart("Default response")])


async def test_model_stream_handler(messages: List[Any], info: Any):
    response = await test_model_handler(messages, info)
    for index, part in enumerate(response.parts):
        if isinstance(part, TextPart):
            yield part.content
        elif isinstance(part, ToolCallPart):
            yield {
                index: DeltaToolCall(
                    name=part.tool_name,
                    json_args=json.dumps(part.args),
                    tool_call_id=part.tool_call_id,
                )
            }

model = FunctionModel(test_model_handler, stream_function=test_model_stream_handler)

agent: Agent[Any, Union[str, DeferredToolRequests]] = Agent(
    model=model, 
    output_type=Union[str, DeferredToolRequests],
    deps_type=Any,
    capabilities=[
        AgentState(State), 
        DeferredCalls(), 
        DynamicUI(),
        ImageStoreCapability()
    ], 
    system_prompt="You are a test agent."
)

@agent.tool
async def list_artifacts(ctx: RunContext[Any]) -> List[str]:
    """List uploaded artifact names for deterministic protocol tests."""
    artifacts = getattr(ctx.deps, "metadata", {}).get("artifacts", []) if hasattr(ctx.deps, "metadata") else []
    return [str(a.get("path") or a.get("name")) for a in artifacts if isinstance(a, dict) and (a.get("path") or a.get("name"))]

@agent.tool(requires_approval=True)
async def generate_furniture_image(ctx: RunContext[Any], input_path: str, prompt: str, output_path: str) -> str:
    """Deterministic image-generation stand-in for protocol tests."""
    return output_path

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
