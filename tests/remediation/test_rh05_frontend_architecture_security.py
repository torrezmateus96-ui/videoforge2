from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class TestRH05FrontendArchitectureSecurity:
    """
    Gate G-RH05 — Modular Frontend Decomposition & Code-Splitting Verification:
    1. Architecture & Complexity Budget: page.tsx < 260 lines, 0 root useState, 13 next/dynamic lazy chunks.
    2. Security: Zero XSS sinks, zero window.open/alert in modular shell/sections, zero privileged secrets.
    3. Stress: 2,000 rapid stateful transitions across Sandbox Store + 2.5D Studio reducer (< 600ms).
    4. Chaos: HTTP 503/403/409/502/network error mapping, cross-tenant rejection, and unapproved brief guard.
    """

    def test_page_tsx_line_budget_and_modular_section_split(self) -> None:
        page_path = ROOT / "apps" / "web" / "src" / "app" / "page.tsx"
        lines = page_path.read_text(encoding="utf-8").splitlines()
        assert len(lines) < 260, f"Expected page.tsx < 260 lines, got {len(lines)}"

        sections_dir = ROOT / "apps" / "web" / "src" / "components" / "sections"
        section_files = sorted(p.name for p in sections_dir.glob("*Section.tsx"))
        assert len(section_files) == 13

        shell_dir = ROOT / "apps" / "web" / "src" / "components" / "shell"
        shell_files = sorted(p.name for p in shell_dir.glob("*.tsx"))
        assert set(shell_files) == {
            "AppSidebar.tsx",
            "AppTopbar.tsx",
            "AuthGateCard.tsx",
            "SectionSkeleton.tsx",
        }

    def test_node_rh05_stress_security_and_chaos_suite(self) -> None:
        proc = subprocess.run(
            ["npm", "run", "test:rh05", "--workspace=apps/web"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        json_line = [ln for ln in proc.stdout.splitlines() if ln.strip().startswith("{")][-1]
        payload = json.loads(json_line)
        assert payload["ok"] is True
        assert payload["page_lines"] < 260
        assert payload["dynamic_chunks"] == 14
        assert payload["stress_ops"] >= 2000

    def test_existing_studio_25d_reducer_suite_stays_green(self) -> None:
        proc = subprocess.run(
            ["npm", "run", "test:studio"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        assert "suites passed" in proc.stdout
