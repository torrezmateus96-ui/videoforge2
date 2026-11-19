from __future__ import annotations

import threading
from typing import Any

import httpx

from core.errors import AppError, ErrorCode


class SupabaseRestClient:
    """
    HTTP PostgREST client enforcing user JWT + RLS on every call (ADR-011, ADR-015).

    RH-02 Hardening:
    - Maintains a thread-safe persistent httpx.Client connection pool (Keep-Alive).
    - Strictly isolates Authorization/Prefer/Profile headers per request (zero session bleed).
    - Supports deterministic lifecycle teardown via close() / FastAPI lifespan and auto-heals if reopened.
    """

    def __init__(
        self,
        supabase_url: str,
        publishable_key: str,
        timeout_seconds: float = 8.0,
        *,
        max_connections: int = 40,
        max_keepalive_connections: int = 20,
        keepalive_expiry_seconds: float = 30.0,
        pool_timeout_seconds: float = 5.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = supabase_url.rstrip("/")
        self._publishable_key = publishable_key
        self._timeout = timeout_seconds
        self._pool_timeout = pool_timeout_seconds
        self._limits = httpx.Limits(
            max_connections=max(1, max_connections),
            max_keepalive_connections=max(0, min(max_keepalive_connections, max_connections)),
            keepalive_expiry=max(1.0, keepalive_expiry_seconds),
        )
        self._transport = transport
        self._lock = threading.Lock()
        self._client: httpx.Client | None = None
        self._client_creations = 0
        self._requests_total = 0
        self._health_checks_total = 0
        self._closed = True

    def _get_client(self) -> httpx.Client:
        client = self._client
        if client is not None and not client.is_closed:
            return client
        with self._lock:
            if self._client is None or self._client.is_closed:
                timeout_cfg = httpx.Timeout(self._timeout, pool=self._pool_timeout)
                self._client = httpx.Client(
                    timeout=timeout_cfg,
                    limits=self._limits,
                    transport=self._transport,
                )
                self._client_creations += 1
                self._closed = False
            return self._client

    @property
    def pool_stats(self) -> dict[str, int | bool]:
        with self._lock:
            is_closed = self._client is None or self._client.is_closed or self._closed
            return {
                "client_creations": self._client_creations,
                "requests_total": self._requests_total,
                "health_checks_total": self._health_checks_total,
                "closed": is_closed,
            }

    def close(self) -> None:
        with self._lock:
            client = self._client
            self._client = None
            self._closed = True
        if client is not None and not client.is_closed:
            client.close()

    def __enter__(self) -> SupabaseRestClient:
        self._get_client()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def _headers(self, access_token: str, prefer: str | None = None, schema: str | None = None) -> dict[str, str]:
        if not access_token or not access_token.strip() or "\r" in access_token or "\n" in access_token:
            raise AppError(
                code=ErrorCode.AUTH_UNAUTHENTICATED,
                message="Token de sessao ausente ou malformado para chamada ao Supabase.",
                http_status=401,
            )
        headers = {
            "apikey": self._publishable_key,
            "Authorization": f"Bearer {access_token.strip()}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        if schema:
            headers["Accept-Profile"] = schema
            headers["Content-Profile"] = schema
        return headers

    def _send_with_pool_recovery(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        params: dict[str, str] | None = None,
        json_body: Any = None,
        timeout_override: float | None = None,
    ) -> httpx.Response:
        req_timeout = (
            httpx.Timeout(timeout_override, pool=self._pool_timeout)
            if timeout_override is not None
            else None
        )
        for attempt in range(2):
            client = self._get_client()
            try:
                if req_timeout is not None:
                    return client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        params=params,
                        json=json_body,
                        timeout=req_timeout,
                    )
                return client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                    json=json_body,
                )
            except RuntimeError as exc:
                # Self-heal if another thread closed the pooled client mid-flight
                if attempt == 0 and "closed" in str(exc).lower():
                    continue
                raise AppError(
                    code=ErrorCode.SUPABASE_UNAVAILABLE,
                    message="Pool HTTP do Supabase foi encerrado durante a operacao.",
                    http_status=503,
                    retryable=True,
                ) from exc
        raise AssertionError("Unreachable pool retry branch")

    def request(
        self,
        method: str,
        path: str,
        access_token: str,
        params: dict[str, str] | None = None,
        json_body: Any = None,
        prefer: str | None = None,
        schema: str | None = None,
    ) -> Any:
        if not self._base_url or not self._publishable_key:
            raise AppError(
                code=ErrorCode.SUPABASE_UNAVAILABLE,
                message="Configuracao do Supabase ausente no servidor local.",
                http_status=503,
                retryable=True,
                details={"next_action": "Verifique NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."},
            )
        req_headers = self._headers(access_token, prefer=prefer, schema=schema)
        url = f"{self._base_url}/rest/v1/{path.lstrip('/')}"
        with self._lock:
            self._requests_total += 1
        try:
            resp = self._send_with_pool_recovery(
                method=method,
                url=url,
                headers=req_headers,
                params=params,
                json_body=json_body,
            )
        except httpx.PoolTimeout as exc:
            raise AppError(
                code=ErrorCode.SUPABASE_UNAVAILABLE,
                message="Pool de conexoes HTTP com Supabase saturado temporariamente.",
                http_status=503,
                retryable=True,
                details={"next_action": "Tente novamente em instantes ou ajuste SUPABASE_HTTP_MAX_CONNECTIONS."},
            ) from exc
        except httpx.RequestError as exc:
            raise AppError(
                code=ErrorCode.SUPABASE_UNAVAILABLE,
                message="Supabase inacessivel ou sem conectividade de rede.",
                http_status=503,
                retryable=True,
                details={"next_action": "Verifique sua conexao e tente novamente."},
            ) from exc

        if resp.status_code >= 500:
            raise AppError(
                code=ErrorCode.SUPABASE_UNAVAILABLE,
                message="Supabase retornou indisponibilidade temporaria.",
                http_status=503,
                retryable=True,
                details={"next_action": "Aguarde alguns instantes e tente novamente."},
            )
        if resp.status_code == 401:
            raise AppError(
                code=ErrorCode.AUTH_UNAUTHENTICATED,
                message="Sessao rejeitada pelo Supabase.",
                http_status=401,
            )
        if resp.status_code == 403:
            raise AppError(
                code=ErrorCode.WORKSPACE_FORBIDDEN,
                message="Acesso bloqueado pelas politicas RLS do workspace.",
                http_status=403,
            )
        if resp.status_code == 409:
            raise AppError(
                code=ErrorCode.VERSION_CONFLICT,
                message="Conflito de unicidade ou versao ao persistir no Supabase.",
                http_status=409,
                retryable=True,
            )
        if resp.status_code >= 400:
            raise AppError(
                code=ErrorCode.VALIDATION_ERROR,
                message="Erro ao processar operacao no Supabase.",
                http_status=422,
                details={"status_code": resp.status_code},
            )
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError as exc:
            raise AppError(
                code=ErrorCode.SUPABASE_UNAVAILABLE,
                message="Resposta JSON malformada recebida do Supabase.",
                http_status=503,
                retryable=True,
            ) from exc

    def check_health(self) -> bool:
        if not self._base_url or not self._publishable_key:
            return False
        with self._lock:
            self._health_checks_total += 1
        try:
            resp = self._send_with_pool_recovery(
                method="GET",
                url=f"{self._base_url}/auth/v1/settings",
                headers={"apikey": self._publishable_key},
                timeout_override=4.0,
            )
            return resp.status_code < 500
        except (httpx.RequestError, AppError):
            return False
