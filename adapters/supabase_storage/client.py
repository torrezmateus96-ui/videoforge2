from __future__ import annotations

import hashlib
import threading
from typing import Any
from uuid import UUID

import httpx

from core.errors import AppError, ErrorCode
from core.jobs.models import ReconcileReport, StorageObjectRecord, StorageObjectStatus
from core.jobs.ports import StorageMetadataPort


class SupabaseStorageClient:
    """
    Private Supabase Storage client (ADR-012).
    Enforces workspace-prefixed paths, checksums, and RH-02 persistent thread-safe HTTP pooling.
    """

    def __init__(
        self,
        supabase_url: str,
        publishable_key: str,
        service_role_key: str = "",
        timeout_seconds: float = 15.0,
        *,
        max_connections: int = 20,
        max_keepalive_connections: int = 10,
        keepalive_expiry_seconds: float = 30.0,
        pool_timeout_seconds: float = 5.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = supabase_url.rstrip("/")
        self._pub_key = publishable_key
        self._srv_key = service_role_key
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

    def _get_client(self) -> httpx.Client:
        client = self._client
        if client is not None and not client.is_closed:
            return client
        with self._lock:
            if self._client is None or self._client.is_closed:
                self._client = httpx.Client(
                    timeout=httpx.Timeout(self._timeout, pool=self._pool_timeout),
                    limits=self._limits,
                    transport=self._transport,
                )
                self._client_creations += 1
            return self._client

    @property
    def pool_stats(self) -> dict[str, int | bool]:
        with self._lock:
            return {
                "client_creations": self._client_creations,
                "closed": self._client is None or self._client.is_closed,
            }

    def close(self) -> None:
        with self._lock:
            client = self._client
            self._client = None
        if client is not None and not client.is_closed:
            client.close()

    def __enter__(self) -> SupabaseStorageClient:
        self._get_client()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def _send(self, method: str, url: str, *, headers: dict[str, str], content: bytes | None = None, json_body: Any = None) -> httpx.Response:
        for attempt in range(2):
            client = self._get_client()
            try:
                return client.request(method=method, url=url, headers=headers, content=content, json=json_body)
            except RuntimeError as exc:
                if attempt == 0 and "closed" in str(exc).lower():
                    continue
                raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Pool HTTP do Storage encerrado.", http_status=503, retryable=True) from exc
        raise AssertionError("Unreachable storage pool retry")

    def _auth_headers(self, token: str, content_type: str | None = None) -> dict[str, str]:
        if not token or not token.strip() or "\r" in token or "\n" in token:
            raise AppError(ErrorCode.AUTH_UNAUTHENTICATED, "Token invalido para chamada ao Storage.", http_status=401)
        headers = {
            "apikey": self._pub_key,
            "Authorization": f"Bearer {token.strip()}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def upload_object(
        self,
        access_token: str,
        bucket: str,
        object_path: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Uploads object bytes and returns sha256 hex."""
        url = f"{self._base_url}/storage/v1/object/{bucket}/{object_path.lstrip('/')}"
        headers = self._auth_headers(access_token, content_type=content_type)
        headers["x-upsert"] = "true"
        try:
            resp = self._send("POST", url, headers=headers, content=data)
        except httpx.RequestError as exc:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Storage inacessivel durante upload.", http_status=503, retryable=True) from exc

        if resp.status_code in (401, 403):
            raise AppError(ErrorCode.WORKSPACE_FORBIDDEN, "Storage bloqueou upload por politica RLS.", http_status=403)
        if resp.status_code >= 500:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Erro remoto no Supabase Storage.", http_status=503, retryable=True)
        if resp.status_code >= 400:
            raise AppError(ErrorCode.VALIDATION_ERROR, f"Falha no upload para Storage ({resp.status_code}).", http_status=422)
        return hashlib.sha256(data).hexdigest()

    def download_bytes(self, access_token: str, bucket: str, object_path: str) -> bytes:
        url = f"{self._base_url}/storage/v1/object/{bucket}/{object_path.lstrip('/')}"
        try:
            resp = self._send("GET", url, headers=self._auth_headers(access_token))
        except httpx.RequestError as exc:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Storage inacessivel durante download.", http_status=503, retryable=True) from exc
        if resp.status_code in (401, 403):
            raise AppError(ErrorCode.WORKSPACE_FORBIDDEN, "Acesso negado ao objeto no Storage.", http_status=403)
        if resp.status_code == 404 or (resp.status_code == 400 and "not_found" in resp.text.lower()):
            raise AppError(ErrorCode.RESOURCE_NOT_FOUND, "Objeto nao encontrado no Storage.", http_status=404)
        if resp.status_code >= 400:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, f"Erro ao baixar objeto ({resp.status_code}).", http_status=503, retryable=True)
        return resp.content

    def create_signed_url(self, access_token: str, bucket: str, object_path: str, expires_in: int = 60) -> str:
        url = f"{self._base_url}/storage/v1/object/sign/{bucket}/{object_path.lstrip('/')}"
        try:
            resp = self._send(
                "POST",
                url,
                headers=self._auth_headers(access_token, content_type="application/json"),
                json_body={"expiresIn": max(10, min(expires_in, 300))},
            )
        except httpx.RequestError as exc:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Storage inacessivel ao assinar URL.", http_status=503, retryable=True) from exc
        if resp.status_code in (401, 403, 400, 404):
            raise AppError(ErrorCode.WORKSPACE_FORBIDDEN, "Nao autorizado a gerar signed URL para este objeto.", http_status=403)
        try:
            data = resp.json()
        except ValueError as exc:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Resposta JSON invalida ao assinar URL.", http_status=503, retryable=True) from exc
        signed = data.get("signedURL") or data.get("signedUrl") or ""
        if signed.startswith("/"):
            return f"{self._base_url}/storage/v1{signed}"
        return signed

    def list_workspace_objects(self, bucket: str, workspace_id: UUID) -> list[str]:
        """Lists remote objects in `<workspace_id>/` using service role for reconciler audits."""
        token = self._srv_key
        if not token:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "SUPABASE_SERVICE_ROLE_KEY ausente para reconciler.", http_status=503)
        url = f"{self._base_url}/storage/v1/object/list/{bucket}"
        try:
            resp = self._send(
                "POST",
                url,
                headers={"apikey": token, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json_body={"prefix": f"{workspace_id}/", "limit": 1000, "offset": 0},
            )
        except httpx.RequestError as exc:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "Storage inacessivel durante listagem.", http_status=503, retryable=True) from exc
        if resp.status_code >= 400:
            raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, f"Erro ao listar bucket {bucket}.", http_status=503, retryable=True)
        items = resp.json() or []
        return [f"{workspace_id}/{item['name']}" for item in items if item.get("name")]


class StorageService:
    """Coordinates Storage uploads, SHA-256 verification, and DB/Storage reconciliation (T-STO-001)."""

    def __init__(self, storage_client: SupabaseStorageClient, metadata_repo: StorageMetadataPort) -> None:
        self._storage = storage_client
        self._meta = metadata_repo

    def close(self) -> None:
        self._storage.close()

    def upload_and_verify_ready(
        self,
        access_token: str,
        workspace_id: UUID,
        bucket: str,
        opaque_name: str,
        data: bytes,
        content_type: str,
        actor_user_id: UUID,
        job_id: UUID | None = None,
        expected_sha256: str | None = None,
    ) -> StorageObjectRecord:
        if ".." in opaque_name or opaque_name.startswith("/"):
            raise AppError(ErrorCode.VALIDATION_ERROR, "Nome de objeto invalido (path traversal).", http_status=422)
        object_path = f"{workspace_id}/{opaque_name}"
        rec = self._meta.create_uploading_record(
            workspace_id=workspace_id,
            bucket=bucket,
            object_path=object_path,
            content_type=content_type,
            created_by=actor_user_id,
            created_by_job=job_id,
        )
        local_sha = hashlib.sha256(data).hexdigest()
        if expected_sha256 and local_sha != expected_sha256:
            self._meta.update_status(workspace_id, rec.id, StorageObjectStatus.FAILED)
            raise AppError(ErrorCode.STORAGE_CHECKSUM_MISMATCH, "Checksum local divergente.", http_status=422, retryable=True)

        self._storage.upload_object(access_token, bucket, object_path, data, content_type=content_type)
        self._meta.update_status(workspace_id, rec.id, StorageObjectStatus.VERIFYING, sha256=local_sha, size_bytes=len(data))

        # Re-read remote bytes to confirm integrity before promoting to READY
        remote_bytes = self._storage.download_bytes(access_token, bucket, object_path)
        remote_sha = hashlib.sha256(remote_bytes).hexdigest()
        if remote_sha != local_sha:
            self._meta.update_status(workspace_id, rec.id, StorageObjectStatus.FAILED)
            raise AppError(
                ErrorCode.STORAGE_CHECKSUM_MISMATCH,
                "Checksum remoto nao confere apos upload.",
                http_status=422,
                retryable=True,
            )
        return self._meta.update_status(
            workspace_id,
            rec.id,
            StorageObjectStatus.READY,
            sha256=remote_sha,
            size_bytes=len(remote_bytes),
        )

    def reconcile_bucket(self, workspace_id: UUID, bucket: str) -> ReconcileReport:
        db_records = self._meta.list_objects(workspace_id, bucket=bucket)
        remote_paths = set(self._storage.list_workspace_objects(bucket, workspace_id))
        db_by_path = {r.object_path: r for r in db_records}

        missing_in_storage: list[str] = []
        incomplete_uploads: list[str] = []
        for rec in db_records:
            if rec.status in (StorageObjectStatus.UPLOADING, StorageObjectStatus.VERIFYING):
                incomplete_uploads.append(rec.object_path)
            elif rec.status == StorageObjectStatus.READY and rec.object_path not in remote_paths:
                missing_in_storage.append(rec.object_path)

        orphaned_in_storage = sorted(p for p in remote_paths if p not in db_by_path)
        return ReconcileReport(
            workspace_id=workspace_id,
            bucket=bucket,
            missing_in_storage=sorted(missing_in_storage),
            orphaned_in_storage=orphaned_in_storage,
            incomplete_uploads=sorted(incomplete_uploads),
        )
