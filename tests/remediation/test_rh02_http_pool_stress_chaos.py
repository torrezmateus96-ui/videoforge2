from __future__ import annotations

import hashlib
import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from adapters.supabase_db.client import SupabaseRestClient
from adapters.supabase_storage.client import SupabaseStorageClient
from apps.api.config import Settings
from apps.api.main import create_app
from core.errors import AppError, ErrorCode


class TestRH02HttpPoolStressChaos(unittest.TestCase):
    """
    Gate G-RH02 — 4-Dimensional Verification:
    1. Functional & Pool Reuse (single persistent client across 150 calls + FastAPI lifespan teardown)
    2. Security (Zero JWT / Header Session Bleed across 64 concurrent threads and 320 unique tokens)
    3. High-Concurrency Stress (600 parallel requests through bounded connection pool)
    4. Chaos Engineering (ConnectTimeout, ReadTimeout, PoolTimeout, RemoteProtocolError, 502/503,
       corrupted JSON on 200 OK, and mid-flight client.close() self-healing)
    """

    def test_persistent_pool_reuse_and_status_semantics(self) -> None:
        def handler(req: httpx.Request) -> httpx.Response:
            path = req.url.path
            if path.endswith("/auth/v1/settings"):
                return httpx.Response(200, json={"external": {"email": True}})
            if "status=204" in str(req.url):
                return httpx.Response(204)
            if "status=401" in str(req.url):
                return httpx.Response(401, json={"message": "jwt expired"})
            if "status=403" in str(req.url):
                return httpx.Response(403, json={"message": "rls denied"})
            if "status=409" in str(req.url):
                return httpx.Response(409, json={"message": "duplicate key"})
            if "status=400" in str(req.url):
                return httpx.Response(400, json={"message": "bad filter"})
            return httpx.Response(200, json={"ok": True, "path": path})

        transport = httpx.MockTransport(handler)
        with SupabaseRestClient(
            "https://test-proj.supabase.co",
            "sb_pub_key_test",
            transport=transport,
        ) as client:
            for i in range(150):
                res = client.request("GET", f"workspaces?iter={i}", access_token=f"tok-{i}")
                self.assertTrue(res["ok"])
            self.assertTrue(client.check_health())
            self.assertIsNone(client.request("DELETE", "workspaces?status=204", access_token="tok"))

            for status_q, expected_code in [
                ("401", ErrorCode.AUTH_UNAUTHENTICATED),
                ("403", ErrorCode.WORKSPACE_FORBIDDEN),
                ("409", ErrorCode.VERSION_CONFLICT),
                ("400", ErrorCode.VALIDATION_ERROR),
            ]:
                with self.assertRaises(AppError) as ctx:
                    client.request("GET", f"workspaces?status={status_q}", access_token="tok")
                self.assertEqual(ctx.exception.code, expected_code)

            stats = client.pool_stats
            self.assertEqual(stats["client_creations"], 1)
            self.assertGreaterEqual(int(stats["requests_total"]), 155)
            self.assertFalse(bool(stats["closed"]))

        self.assertTrue(bool(client.pool_stats["closed"]))

    def test_security_zero_jwt_or_header_bleed_under_64_threads(self) -> None:
        def echo_auth_handler(req: httpx.Request) -> httpx.Response:
            auth = req.headers.get("authorization", "")
            prefer = req.headers.get("prefer", "")
            profile = req.headers.get("accept-profile", "")
            apikey = req.headers.get("apikey", "")
            return httpx.Response(
                200,
                json={
                    "seen_auth": auth,
                    "seen_prefer": prefer,
                    "seen_profile": profile,
                    "seen_apikey": apikey,
                    "req_id": req.url.params.get("req_id"),
                },
            )

        client = SupabaseRestClient(
            "https://sec-test.supabase.co",
            "pub_static_key",
            max_connections=32,
            max_keepalive_connections=16,
            transport=httpx.MockTransport(echo_auth_handler),
        )
        try:
            def worker_task(idx: int) -> None:
                unique_jwt = f"jwt-user-{idx}-{uuid4()}"
                expected_prefer = f"return=representation;idx={idx}" if idx % 2 == 0 else None
                expected_schema = "app" if idx % 3 == 0 else None
                out = client.request(
                    "POST",
                    "channels",
                    access_token=unique_jwt,
                    params={"req_id": str(idx)},
                    json_body={"idx": idx},
                    prefer=expected_prefer,
                    schema=expected_schema,
                )
                self.assertEqual(out["seen_auth"], f"Bearer {unique_jwt}")
                self.assertEqual(out["seen_prefer"], expected_prefer or "")
                self.assertEqual(out["seen_profile"], expected_schema or "")
                self.assertEqual(out["seen_apikey"], "pub_static_key")
                self.assertEqual(out["req_id"], str(idx))

            with ThreadPoolExecutor(max_workers=64) as pool:
                futures = [pool.submit(worker_task, i) for i in range(320)]
                for fut in as_completed(futures):
                    fut.result()

            self.assertEqual(client.pool_stats["client_creations"], 1)
        finally:
            client.close()

        # CRLF header injection attempt in access_token must be blocked before network I/O
        for bad_tok in ["", "   ", "tok\r\nX-Admin: true", "tok\nevil"]:
            with self.assertRaises(AppError) as ctx:
                client.request("GET", "workspaces", access_token=bad_tok)
            self.assertEqual(ctx.exception.code, ErrorCode.AUTH_UNAUTHENTICATED)

    def test_stress_600_parallel_requests_on_bounded_pool_and_storage(self) -> None:
        storage_store: dict[str, bytes] = {}
        store_lock = threading.Lock()

        def storage_handler(req: httpx.Request) -> httpx.Response:
            if req.method == "POST" and "/storage/v1/object/" in req.url.path:
                body = req.read()
                with store_lock:
                    storage_store[req.url.path] = body
                return httpx.Response(200, json={"Key": req.url.path})
            if req.method == "GET" and "/storage/v1/object/" in req.url.path:
                with store_lock:
                    payload = storage_store.get(req.url.path, b"")
                return httpx.Response(200, content=payload)
            return httpx.Response(200, json={"signedURL": "/object/sign/bucket/file?token=ok"})

        rest_client = SupabaseRestClient(
            "https://stress.supabase.co",
            "pub_key",
            max_connections=16,
            max_keepalive_connections=8,
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"n": r.url.params.get("n")})),
        )
        storage_client = SupabaseStorageClient(
            "https://stress.supabase.co",
            "pub_key",
            max_connections=12,
            max_keepalive_connections=6,
            transport=httpx.MockTransport(storage_handler),
        )

        try:
            def mixed_op(n: int) -> None:
                res = rest_client.request("GET", "videos", access_token=f"tok-{n}", params={"n": str(n)})
                self.assertEqual(res["n"], str(n))
                if n % 10 == 0:
                    raw = f"artifact-payload-{n}".encode("utf-8")
                    sha = storage_client.upload_object(f"tok-{n}", "artifacts", f"ws/obj_{n}.bin", raw)
                    self.assertEqual(sha, hashlib.sha256(raw).hexdigest())
                    downloaded = storage_client.download_bytes(f"tok-{n}", "artifacts", f"ws/obj_{n}.bin")
                    self.assertEqual(downloaded, raw)

            with ThreadPoolExecutor(max_workers=32) as pool:
                futures = [pool.submit(mixed_op, i) for i in range(600)]
                for fut in as_completed(futures):
                    fut.result()

            self.assertEqual(rest_client.pool_stats["client_creations"], 1)
            self.assertEqual(storage_client.pool_stats["client_creations"], 1)
        finally:
            rest_client.close()
            storage_client.close()

    def test_chaos_fault_injection_and_midflight_close_self_healing(self) -> None:
        counter = {"n": 0}
        lock = threading.Lock()

        def chaos_handler(req: httpx.Request) -> httpx.Response:
            with lock:
                counter["n"] += 1
                n = counter["n"]
            mode = n % 7
            if mode == 1:
                raise httpx.ConnectTimeout("Simulated TCP SYN blackhole")
            if mode == 2:
                raise httpx.ReadTimeout("Simulated stalled upstream socket")
            if mode == 3:
                raise httpx.RemoteProtocolError("Simulated abrupt TLS reset")
            if mode == 4:
                raise httpx.PoolTimeout("Simulated pool starvation")
            if mode == 5:
                return httpx.Response(503, text="Upstream Gateway Timeout")
            if mode == 6:
                return httpx.Response(200, content=b"{truncated_json_chaos")
            return httpx.Response(200, content=json.dumps({"recovered": True, "seq": n}).encode("utf-8"))

        client = SupabaseRestClient(
            "https://chaos.supabase.co",
            "pub_key",
            transport=httpx.MockTransport(chaos_handler),
        )
        successes = 0
        retryable_failures = 0
        try:
            for step in range(70):
                if step in (20, 45):
                    # Chaos: close client abruptly between calls to prove transparent pool self-healing
                    client.close()
                try:
                    out = client.request("GET", "jobs", access_token="chaos-token")
                    if out and out.get("recovered"):
                        successes += 1
                except AppError as exc:
                    self.assertEqual(exc.code, ErrorCode.SUPABASE_UNAVAILABLE)
                    self.assertTrue(exc.retryable)
                    retryable_failures += 1

            self.assertEqual(successes, 10)
            self.assertEqual(retryable_failures, 60)
            self.assertGreaterEqual(int(client.pool_stats["client_creations"]), 3)
        finally:
            client.close()

    def test_fastapi_lifespan_closes_container_http_pools_cleanly(self) -> None:
        settings = Settings(
            next_public_supabase_url="https://lifespan.supabase.co",
            next_public_supabase_publishable_key="sb_pub_lifespan",
        )
        app = create_app(settings=settings)
        # Replace transport on container's supabase_client so health check runs deterministically offline
        app.state.container.supabase_client._transport = httpx.MockTransport(
            lambda req: httpx.Response(200, json={"status": "ok"})
        )
        with TestClient(app) as tc:
            resp = tc.get("/api/v1/health")
            self.assertEqual(resp.status_code, 200)
            self.assertFalse(bool(app.state.container.supabase_client.pool_stats["closed"]))

        # Exiting TestClient triggers FastAPI lifespan shutdown -> pool must be closed
        self.assertTrue(bool(app.state.container.supabase_client.pool_stats["closed"]))


if __name__ == "__main__":
    unittest.main()
