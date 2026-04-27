from typing import Any, List, cast

import pytest
from arnessa.publish import InMemorySessionStore


def _msgs(*roles: str) -> List[Any]:
    """Build a minimal fake message list that satisfies runtime storage."""
    return cast(List[Any], [{"role": r, "content": r} for r in roles])


@pytest.mark.asyncio
async def test_load_returns_empty_list_for_unknown_session():
    store = InMemorySessionStore()
    result = await store.load("unknown")
    assert result == []


@pytest.mark.asyncio
async def test_save_and_load_round_trip():
    store = InMemorySessionStore()
    msgs = _msgs("user", "assistant")
    await store.save("s1", msgs)
    result = await store.load("s1")
    assert result == msgs


@pytest.mark.asyncio
async def test_save_returns_independent_copy():
    store = InMemorySessionStore()
    msgs = _msgs("user")
    await store.save("s1", msgs)
    msgs.append(cast(Any, {"role": "assistant", "content": "hello"}))
    result = await store.load("s1")
    assert len(result) == 1


@pytest.mark.asyncio
async def test_delete_removes_session():
    store = InMemorySessionStore()
    await store.save("s1", _msgs("user"))
    await store.delete("s1")
    result = await store.load("s1")
    assert result == []


@pytest.mark.asyncio
async def test_delete_nonexistent_session_is_silent():
    store = InMemorySessionStore()
    await store.delete("does-not-exist")  # must not raise


@pytest.mark.asyncio
async def test_independent_sessions_do_not_share_history():
    store = InMemorySessionStore()
    await store.save("s1", _msgs("user-a"))
    await store.save("s2", _msgs("user-b"))
    s1 = cast(List[Any], await store.load("s1"))
    s2 = cast(List[Any], await store.load("s2"))
    assert s1[0]["role"] == "user-a"
    assert s2[0]["role"] == "user-b"
