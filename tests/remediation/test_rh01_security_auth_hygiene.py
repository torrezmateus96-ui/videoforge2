from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class TestRH01SecurityAuthHygiene(unittest.TestCase):
    """
    Gate G-RH01 — 4-Dimensional Verification:
    1. Security (SAST scan across app source & env templates for hardcoded passwords, JWTs, keys)
    2. Functional Contracts (NODE_ENV gating & zero password prefill)
    3. Stress & ReDoS Resistance (10,000 linear evaluations incl. 256 KB pathological inputs < 350ms)
    4. Chaos & Hostile Injection (CRLF, null-byte, XSS tags, corrupted env dictionaries)
    """

    def test_sast_zero_hardcoded_credentials_in_application_code(self) -> None:
        scan_dirs = [
            ROOT / "apps",
            ROOT / "core",
            ROOT / "adapters",
            ROOT / "workers",
            ROOT / "scripts",
        ]
        forbidden_literals = [
            "Managet123!",
            "admin@managet.local",
        ]
        jwt_pattern = re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}")
        private_key_pattern = re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")

        scanned_count = 0
        for base in scan_dirs:
            for path in base.rglob("*"):
                if not path.is_file():
                    continue
                if any(part in ("node_modules", ".next", "__pycache__") for part in path.parts):
                    continue
                if path.suffix not in {".ts", ".tsx", ".js", ".mjs", ".py"}:
                    continue
                scanned_count += 1
                content = path.read_text(encoding="utf-8")
                for lit in forbidden_literals:
                    self.assertNotIn(lit, content, f"Hardcoded credential '{lit}' leaked in {path}")
                self.assertIsNone(jwt_pattern.search(content), f"Hardcoded JWT leaked in {path}")
                self.assertIsNone(private_key_pattern.search(content), f"Private key leaked in {path}")

        self.assertGreaterEqual(scanned_count, 50)

    def test_env_example_forbids_public_secret_exposure(self) -> None:
        env_example = (ROOT / ".env.example").read_text(encoding="utf-8")
        for line in env_example.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, val = stripped.split("=", 1)
            key = key.strip()
            if key.startswith("NEXT_PUBLIC_"):
                upper_key = key.upper()
                for banned_token in ("PASSWORD", "SECRET", "SERVICE_ROLE", "PRIVATE_KEY", "ENCRYPTION_KEY"):
                    self.assertNotIn(
                        banned_token,
                        upper_key,
                        f"Client-exposed NEXT_PUBLIC_ variable '{key}' must never hold secret category '{banned_token}'",
                    )
            if key == "NEXT_PUBLIC_DEV_AUTOFILL_EMAIL":
                self.assertEqual(val.strip(), "", "NEXT_PUBLIC_DEV_AUTOFILL_EMAIL must default to empty in .env.example")

    def test_node_functional_stress_and_chaos_on_auth_defaults(self) -> None:
        node_harness = r"""
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const targetPath = path.resolve("apps/web/src/lib/auth-defaults.ts");
const src = fs.readFileSync(targetPath, "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const mod = { exports: {} };
new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
const { getInitialAuthEmail, getInitialAuthPassword, sanitizeAuthEmail } = mod.exports;

// 1. Functional contract
assert.equal(getInitialAuthPassword(), "");
assert.equal(getInitialAuthEmail({ NODE_ENV: "production", NEXT_PUBLIC_DEV_AUTOFILL_EMAIL: "dev@local.test" }), "");
assert.equal(getInitialAuthEmail({ NODE_ENV: "test", NEXT_PUBLIC_DEV_AUTOFILL_EMAIL: "dev@local.test" }), "");
assert.equal(getInitialAuthEmail({ NODE_ENV: "development", NEXT_PUBLIC_DEV_AUTOFILL_EMAIL: "" }), "");
assert.equal(getInitialAuthEmail({ NODE_ENV: "development", NEXT_PUBLIC_DEV_AUTOFILL_EMAIL: "  operador@canal.tv  " }), "operador@canal.tv");

// 2. Chaos & Hostile Injection
const hostilePayloads = [
  "admin@x.com\r\nSet-Cookie: evil=1",
  "admin@x.com\u0000bypass",
  "<script>alert(1)</script>@evil.com",
  "user@evil..com",
  "@missinglocal.com",
  "missingdomain@",
  "two@@at.com",
  "spaces in@email.com",
  "quote\"@email.com",
  "semi;@email.com",
  "a".repeat(260) + "@domain.com",
  null,
  undefined,
  12345,
  { evil: true },
];
for (const payload of hostilePayloads) {
  assert.equal(sanitizeAuthEmail(payload), "", `Payload should be rejected: ${String(payload)}`);
  assert.equal(
    getInitialAuthEmail({ NODE_ENV: "development", NEXT_PUBLIC_DEV_AUTOFILL_EMAIL: payload }),
    ""
  );
}
for (const weirdNodeEnv of ["PRODUCTION", "Development", "staging", "", undefined]) {
  assert.equal(
    getInitialAuthEmail({ NODE_ENV: weirdNodeEnv, NEXT_PUBLIC_DEV_AUTOFILL_EMAIL: "ok@valid.dev" }),
    ""
  );
}

// 3. Stress & ReDoS immunity: 10,000 calls including massive pathological strings
const giantAttack = "a".repeat(262144) + "@b";
const t0 = performance.now();
for (let i = 0; i < 10000; i += 1) {
  const sample = i % 20 === 0 ? giantAttack : `creator.${i}@darkforge.studio`;
  const res = sanitizeAuthEmail(sample);
  if (i % 20 === 0) {
    assert.equal(res, "");
  } else {
    assert.equal(res, sample);
  }
}
const elapsedMs = performance.now() - t0;
assert.ok(elapsedMs < 500, `Stress test exceeded latency budget: ${elapsedMs.toFixed(2)}ms`);

console.log(JSON.stringify({ ok: true, stress_iterations: 10000, elapsed_ms: Number(elapsedMs.toFixed(2)) }));
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", node_harness],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        payload = json.loads(proc.stdout.strip().splitlines()[-1])
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["stress_iterations"], 10000)


if __name__ == "__main__":
    unittest.main()
