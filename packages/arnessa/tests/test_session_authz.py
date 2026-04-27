"""Tests for session_id_factory and authorize_session hooks."""
from typing import Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.requests import Request
from starlette.testclient import TestClient

from arnessa.publish import (
    ArnessaApp,
    InMemorySessionStore,
    SessionIdFactory,
    AuthorizeSession,
    _default_session_id_factory,
    _default_authorize_session,
)


# ---------------------------------------------------------------------------
# Default hook behaviour
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_default_factory_returns_client_sid_when_provided():
    fake_request = MagicMock(spec=Request)
    result = await _default_session_id_factory(fake_request, "my-session")
    assert result == "my-session"


@pytest.mark.asyncio
async def test_default_factory_generates_uuid_when_no_client_sid():
    fake_request = MagicMock(spec=Request)
    result = await _default_session_id_factory(fake_request, None)
    assert isinstance(result, str) and len(result) > 0


@pytest.mark.asyncio
async def test_default_factory_two_calls_produce_different_ids():
    fake_request = MagicMock(spec=Request)
    a = await _default_session_id_factory(fake_request, None)
    b = await _default_session_id_factory(fake_request, None)
    assert a != b


@pytest.mark.asyncio
async def test_default_authorize_session_always_allows():
    fake_request = MagicMock(spec=Request)
    assert await _default_authorize_session(fake_request, "any-session") is True


# ---------------------------------------------------------------------------
# Custom session_id_factory
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_custom_factory_scopes_session_by_user():
    async def scoped_factory(request: Request, client_sid: Optional[str]) -> str:
        return f"{request.state.user_id}:{client_sid or 'new'}"

    fake_request = MagicMock(spec=Request)
    fake_request.state.user_id = "alice"

    result = await scoped_factory(fake_request, "thread-1")
    assert result == "alice:thread-1"


@pytest.mark.asyncio
async def test_custom_factory_different_users_produce_different_sessions():
    async def scoped_factory(request: Request, client_sid: Optional[str]) -> str:
        return f"{request.state.user_id}:{client_sid or 'x'}"

    req_alice = MagicMock(spec=Request)
    req_alice.state.user_id = "alice"

    req_bob = MagicMock(spec=Request)
    req_bob.state.user_id = "bob"

    sid_alice = await scoped_factory(req_alice, "thread-1")
    sid_bob = await scoped_factory(req_bob, "thread-1")

    assert sid_alice != sid_bob


# ---------------------------------------------------------------------------
# authorize_session — HTTP-level (403 on deny)
# ---------------------------------------------------------------------------

def _make_app_with_authz(deny: bool) -> ArnessaApp:
    async def authz(request: Request, session_id: str) -> bool:
        return not deny

    mock_agent = MagicMock()
    mock_agent.root_capability = None
    return ArnessaApp(mock_agent, authorize_session=authz)


def test_authorize_session_deny_returns_403_on_reconnect():
    app = _make_app_with_authz(deny=True)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/run/some-session")
    assert response.status_code == 403


def test_authorize_session_deny_returns_403_on_resolve():
    app = _make_app_with_authz(deny=True)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/run/some-session/resolve", json={"call_id": "c1", "result": {}})
    assert response.status_code == 403


def test_authorize_session_deny_returns_403_on_patch():
    app = _make_app_with_authz(deny=True)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/run/some-session/patch", json={"patch": {}})
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# ArnessaApp constructor — keyword-only, optional, defaults preserved
# ---------------------------------------------------------------------------

def test_arnessa_app_accepts_no_hooks():
    mock_agent = MagicMock()
    mock_agent.root_capability = None
    app = ArnessaApp(mock_agent)
    assert app.session_id_factory is None
    assert app.authorize_session_fn is None
    assert isinstance(app.session_store, InMemorySessionStore)


def test_arnessa_app_accepts_all_hooks():
    async def factory(req: Request, sid: Optional[str]) -> str:
        return sid or "x"

    async def authz(req: Request, sid: str) -> bool:
        return True

    store = InMemorySessionStore()
    mock_agent = MagicMock()
    mock_agent.root_capability = None

    app = ArnessaApp(mock_agent, session_store=store, session_id_factory=factory, authorize_session=authz)
    assert app.session_store is store
    assert app.session_id_factory is factory
    assert app.authorize_session_fn is authz


def test_arnessa_app_has_per_instance_session_manager():
    mock_agent = MagicMock()
    mock_agent.root_capability = None
    app1 = ArnessaApp(mock_agent)
    app2 = ArnessaApp(mock_agent)
    assert app1.session_manager is not app2.session_manager
