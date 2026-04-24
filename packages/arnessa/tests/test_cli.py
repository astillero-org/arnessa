from __future__ import annotations

from pathlib import Path

import pytest

from arnessa.cli.main import collect_agent_events, load_agent


def test_load_agent_from_file_reference(tmp_path: Path):
    script = tmp_path / "agent_script.py"
    script.write_text(
        "from pydantic_ai import Agent\n"
        "agent = Agent('test', output_type=str)\n"
    )

    agent = load_agent(f"{script}:agent")
    assert agent is not None
    assert hasattr(agent, "run")


def test_load_agent_from_src_style_module_reference(tmp_path: Path):
    pkg = tmp_path / "app" / "src" / "demo_agent"
    pkg.mkdir(parents=True)
    (pkg / "agent.py").write_text("value = 7\n")
    (pkg / "main.py").write_text(
        "from .agent import value\n"
        "from pydantic_ai import Agent\n"
        "agent = Agent('test', output_type=str, instructions=f'value={value}')\n"
    )

    agent = load_agent(f"{pkg / 'main.py'}:agent")
    assert agent is not None
    assert hasattr(agent, "run")


@pytest.mark.asyncio
async def test_collect_agent_events_emits_agui_text_events(tmp_path: Path):
    script = tmp_path / "agent_script.py"
    script.write_text(
        "from pydantic_ai import Agent\n"
        "from pydantic_ai.models.function import FunctionModel\n"
        "from pydantic_ai.messages import ModelResponse, TextPart\n"
        "async def handler(messages, info):\n"
        "    return ModelResponse(parts=[TextPart('hello from cli')])\n"
        "agent = Agent(FunctionModel(handler), output_type=str)\n"
    )

    agent = load_agent(f"{script}:agent")
    events = await collect_agent_events(agent, "hi")

    assert events[0]["type"] == "RUN_STARTED"
    assert any(e.get("type") == "TEXT_MESSAGE_CONTENT" and e.get("delta") == "hello from cli" for e in events)
    assert events[-1]["type"] == "RUN_FINISHED"
