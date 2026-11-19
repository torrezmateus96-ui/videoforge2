from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from apps.api.config import Settings, get_settings
from apps.api.dependencies import ServiceContainer, build_default_container
from apps.api.routes import DOMAIN_ROUTERS
from core.errors import AppError


def create_app(
    settings: Settings | None = None,
    container: ServiceContainer | None = None,
) -> FastAPI:
    cfg = settings or get_settings()
    active_container = container or build_default_container(cfg)

    @asynccontextmanager
    async def lifespan(fastapi_app: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            st_container = getattr(fastapi_app.state, "container", None)
            if st_container is not None and hasattr(st_container, "close"):
                st_container.close()

    app = FastAPI(title="DarkForge Channel OS API", version="0.2.0", lifespan=lifespan)
    app.state.container = active_container

    allowed_origins = [cfg.web_origin, "http://127.0.0.1:3000", "http://localhost:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(dict.fromkeys(allowed_origins)),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Workspace-Id", "Idempotency-Key", "X-Correlation-Id"],
    )

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        corr = request.headers.get("X-Correlation-Id")
        payload = exc.to_envelope()
        if corr:
            payload["correlation_id"] = corr
        else:
            payload["correlation_id"] = payload.get("correlation_id") or str(uuid4())
        return JSONResponse(status_code=exc.http_status, content=payload)

    for domain_router in DOMAIN_ROUTERS:
        app.include_router(domain_router)

    return app


app = create_app()
