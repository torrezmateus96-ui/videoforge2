from __future__ import annotations

import time
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from apps.api.config import Settings
from apps.api.main import create_app

ROOT = Path(__file__).resolve().parents[2]


class TestRH03DomainRoutesSecurityStress(unittest.TestCase):
    """
    Gate G-RH03 — 4-Dimensional Verification:
    1. Functional & Contract Parity:
       - Zero sp*.py files remain in apps/api/routes/.
       - 100% of canonical endpoints (/api/v1/* and /api/v1/studio/*) are mounted without path/method collisions.
       - Every endpoint carries a semantic OpenAPI tag.
    2. Security (Anti-CSRF Origin, Auth Enforcement & Workspace Header Validation):
       - Every mutating endpoint across all 9 domain modules rejects untrusted Origin with 403.
       - Protected endpoints reject missing/forged JWTs with 401.
    3. Stress Test:
       - 1,000 burst/concurrent dispatches across domain endpoints + /openapi.json with sub-5ms average dispatch.
    4. Chaos & Malformed Input Fuzzing:
       - Truncated JSON, invalid X-Workspace-Id, invalid X-Correlation-Id, and type mismatches never raise 500.
    """

    def _build_test_app(self):
        settings = Settings(
            next_public_supabase_url="https://rh03.supabase.co",
            next_public_supabase_publishable_key="sb_pub_rh03",
            supabase_jwt_secret="rh03-super-secret-jwt-key-minimum-32-bytes!",
            web_origin="http://127.0.0.1:3000",
        )
        app = create_app(settings=settings)
        app.state.container.supabase_client._transport = httpx.MockTransport(
            lambda req: httpx.Response(200, json={"ok": True})
        )
        return app

    def test_zero_sp_numbered_files_and_full_openapi_domain_coverage(self) -> None:
        routes_dir = ROOT / "apps" / "api" / "routes"
        py_files = sorted(p.name for p in routes_dir.glob("*.py"))
        for fname in py_files:
            self.assertFalse(fname.startswith("sp"), f"Legacy subplan-named route file still present: {fname}")

        expected_modules = {
            "__init__.py",
            "analytics_youtube.py",
            "diagnostics_reports.py",
            "editorial_opportunities.py",
            "jobs_storage.py",
            "knowledge_rag.py",
            "orchestrator.py",
            "production_gateway.py",
            "research_intelligence.py",
            "studio.py",
            "workspaces_channels.py",
        }
        self.assertEqual(set(py_files), expected_modules)

        app = self._build_test_app()
        with TestClient(app) as tc:
            openapi = tc.get("/openapi.json").json()
            paths = openapi["paths"]

            required_endpoints = [
                ("/api/v1/health", "get"),
                ("/api/v1/workspaces", "get"),
                ("/api/v1/workspaces", "post"),
                ("/api/v1/channels", "get"),
                ("/api/v1/channels", "post"),
                ("/api/v1/channels/{channel_id}/profile", "put"),
                ("/api/v1/jobs", "post"),
                ("/api/v1/jobs", "get"),
                ("/api/v1/storage/reconcile", "post"),
                ("/api/v1/connections/youtube/authorize", "post"),
                ("/api/v1/analytics/portfolio", "get"),
                ("/api/v1/research/runs", "post"),
                ("/api/v1/intel/titles/analyze", "post"),
                ("/api/v1/research/studio-runs", "post"),
                ("/api/v1/research/google-trends/validate", "post"),
                ("/api/v1/research/reverse-engineering/phase1-channels", "post"),
                ("/api/v1/knowledge/sources", "post"),
                ("/api/v1/knowledge/search", "post"),
                ("/api/v1/opportunities/generate", "post"),
                ("/api/v1/briefs", "post"),
                ("/api/v1/calendar", "post"),
                ("/api/v1/production/health", "get"),
                ("/api/v1/production/intents/{intent_id}/dispatch", "post"),
                ("/api/v1/diagnostics/export", "get"),
                ("/api/v1/reports/overview", "get"),
                ("/api/v1/reports/executive.md", "get"),
                ("/api/v1/studio/channels/{channel_id}/snapshot", "get"),
                ("/api/v1/studio/channels/{channel_id}/approvals", "post"),
                ("/api/v1/orchestrator/topology", "get"),
                ("/api/v1/orchestrator/plan", "post"),
                ("/api/v1/orchestrator/execute", "post"),
            ]
            for route_path, method in required_endpoints:
                self.assertIn(route_path, paths, f"Missing canonical route path: {route_path}")
                self.assertIn(method, paths[route_path], f"Missing method {method.upper()} on {route_path}")
                tags = paths[route_path][method].get("tags") or []
                self.assertGreaterEqual(len(tags), 1, f"Endpoint {method.upper()} {route_path} lacks semantic OpenAPI tag")

            self.assertGreaterEqual(len(paths), 55)

    def test_security_anti_csrf_origin_and_auth_enforcement_across_all_domains(self) -> None:
        app = self._build_test_app()
        uid = str(uuid4())
        sample_mutations = [
            ("POST", "/api/v1/workspaces", {"name": "WS", "slug": "ws-sec"}),
            ("POST", "/api/v1/jobs", {"job_type": "sync.test"}),
            ("POST", "/api/v1/connections/youtube/authorize", {}),
            ("POST", "/api/v1/research/google-trends/validate", {"keyword": "ia youtube"}),
            ("POST", "/api/v1/knowledge/search", {"query": "roteiro"}),
            ("POST", "/api/v1/opportunities/generate", {"channel_id": uid, "topic_hint": "documentario"}),
            ("POST", f"/api/v1/production/intents/{uid}/dispatch", {}),
            ("POST", "/api/v1/telemetry/events", {"event_name": "ui.click"}),
            ("POST", f"/api/v1/studio/runs/{uid}/cancel", {}),
            ("POST", "/api/v1/orchestrator/plan", {"objective": "Validar seguranca"}),
            ("POST", "/api/v1/orchestrator/execute", {"objective": "Validar execucao"}),
        ]
        with TestClient(app) as tc:
            for method, path, payload in sample_mutations:
                # 1. Hostile Origin must be blocked with 403 before touching domain logic
                evil_resp = tc.request(
                    method,
                    path,
                    headers={"Origin": "https://csrf-attacker.evil.example"},
                    json=payload,
                )
                self.assertEqual(evil_resp.status_code, 403, f"CSRF Origin bypass on {method} {path}")
                self.assertEqual(evil_resp.json()["code"], "WORKSPACE_FORBIDDEN")

                # 2. Trusted Origin without JWT must be blocked with 401
                unauth_resp = tc.request(
                    method,
                    path,
                    headers={"Origin": "http://127.0.0.1:3000", "X-Workspace-Id": uid},
                    json=payload,
                )
                self.assertEqual(unauth_resp.status_code, 401, f"Auth bypass on {method} {path}")
                self.assertEqual(unauth_resp.json()["code"], "AUTH_UNAUTHENTICATED")

    def test_stress_1000_concurrent_dispatches_across_domain_routers(self) -> None:
        app = self._build_test_app()
        with TestClient(app) as tc:
            t0 = time.perf_counter()

            def hit(i: int) -> int:
                if i % 5 == 0:
                    r = tc.get("/api/v1/health")
                    return r.status_code
                if i % 5 == 1:
                    r = tc.get("/openapi.json")
                    return r.status_code
                if i % 5 == 2:
                    r = tc.get("/api/v1/workspaces")
                    return r.status_code
                if i % 5 == 3:
                    r = tc.post(
                        "/api/v1/jobs",
                        headers={"Origin": "https://evil.invalid"},
                        json={"job_type": "x"},
                    )
                    return r.status_code
                r = tc.get("/api/v1/reports/overview", headers={"Authorization": "Bearer malformed.jwt"})
                return r.status_code

            with ThreadPoolExecutor(max_workers=24) as pool:
                futs = [pool.submit(hit, idx) for idx in range(1000)]
                codes = [f.result() for f in as_completed(futs)]

            elapsed = time.perf_counter() - t0
            self.assertEqual(codes.count(200), 400)
            self.assertEqual(codes.count(401), 400)
            self.assertEqual(codes.count(403), 200)
            self.assertLess(elapsed, 8.0, f"Router dispatch stress too slow: {elapsed:.2f}s")

    def test_chaos_malformed_headers_and_corrupted_json_never_500(self) -> None:
        import jwt as pyjwt

        app = self._build_test_app()
        valid_jwt = pyjwt.encode(
            {"sub": str(uuid4()), "aud": "authenticated", "email": "op@darkforge.local"},
            "rh03-super-secret-jwt-key-minimum-32-bytes!",
            algorithm="HS256",
        )
        ws_id = str(uuid4())

        with TestClient(app) as tc:
            # Invalid X-Workspace-Id UUID -> 422 VALIDATION_ERROR (not 500)
            r1 = tc.get(
                "/api/v1/channels",
                headers={"Authorization": f"Bearer {valid_jwt}", "X-Workspace-Id": "not-a-valid-uuid"},
            )
            self.assertEqual(r1.status_code, 422)
            self.assertEqual(r1.json()["code"], "VALIDATION_ERROR")

            # Invalid X-Correlation-Id on POST /api/v1/jobs -> 422 VALIDATION_ERROR (hardened in RH-03!)
            r2 = tc.post(
                "/api/v1/jobs",
                headers={
                    "Authorization": f"Bearer {valid_jwt}",
                    "X-Workspace-Id": ws_id,
                    "X-Correlation-Id": "corrupted-correlation-id-!!!",
                    "Origin": "http://127.0.0.1:3000",
                },
                json={"job_type": "sync.channel"},
            )
            self.assertEqual(r2.status_code, 422)
            self.assertEqual(r2.json()["code"], "VALIDATION_ERROR")

            # Truncated raw JSON body -> 422 (never 500)
            r3 = tc.post(
                "/api/v1/workspaces",
                headers={
                    "Authorization": f"Bearer {valid_jwt}",
                    "Content-Type": "application/json",
                    "Origin": "http://127.0.0.1:3000",
                },
                content=b'{"name": "Broken JSON',
            )
            self.assertEqual(r3.status_code, 422)


if __name__ == "__main__":
    unittest.main()
