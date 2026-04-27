from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp


class NoAuthMiddleware(BaseHTTPMiddleware):
    """Sets request.state.user_id = "anonymous" so demo apps and tests exercise
    the same code paths that production middleware will use."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.user_id = "anonymous"
        return await call_next(request)
