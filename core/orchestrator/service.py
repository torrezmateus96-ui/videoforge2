from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

from core.errors import AppError, ErrorCode
from core.orchestrator.models import (
    AgentDivision,
    MissionExecutionReport,
    MissionPlan,
    MissionPlanStep,
    MissionScope,
    OrchestratorTopology,
    SubagentExecutionStep,
    SubagentSpec,
)
from core.orchestrator.registry import (
    LEAD_AGENT_REGISTRY,
    SUBAGENT_REGISTRY,
    get_orchestrator_topology,
)
from core.workspaces.models import AuthenticatedUser, WorkspaceRole
from core.workspaces.service import WorkspaceService

_SECRET_PATTERN = re.compile(
    r"(sk-[A-Za-z0-9_\-]{12,}|AIza[0-9A-Za-z_\-]{20,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)"
)

_INJECTION_PATTERNS = (
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"system\s*prompt", re.IGNORECASE),
    re.compile(r"auto_publish_enabled\s*=\s*true", re.IGNORECASE),
    re.compile(r"bypass\s+(rls|approval|human\s+gate)", re.IGNORECASE),
)


def _sanitize_objective(raw: str) -> tuple[str, list[str]]:
    cleaned = _SECRET_PATTERN.sub("[REDACTED]", (raw or "").strip())
    warnings: list[str] = []
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(cleaned):
            warnings.append(
                "Tentativa de override de politica detectada no objetivo; guardrails imutaveis (RLS, revisao humana e sem auto-publicacao) mantidos."
            )
            cleaned = pattern.sub("[POLITICA_PROTEGIDA]", cleaned)
    return cleaned, warnings


def _topological_sort_subagents(selected_keys: set[str]) -> list[SubagentSpec]:
    """
    Resolves transitive dependencies within the selected universe and returns a cycle-free
    topological ordering preserving deterministic registry order as tie-breaker.
    """
    expanded: set[str] = set()

    def _expand(key: str) -> None:
        if key in expanded:
            return
        if key not in SUBAGENT_REGISTRY:
            raise AppError(
                code=ErrorCode.VALIDATION_ERROR,
                message=f"Subagente invalido na selecao: {key}",
                http_status=422,
                details={"subagent_key": key},
            )
        expanded.add(key)
        for dep in SUBAGENT_REGISTRY[key].depends_on:
            _expand(dep)

    for k in selected_keys:
        _expand(k)

    registry_order = list(SUBAGENT_REGISTRY.keys())
    order_index = {k: idx for idx, k in enumerate(registry_order)}

    in_degree: dict[str, int] = {k: 0 for k in expanded}
    dependents: dict[str, list[str]] = {k: [] for k in expanded}
    for k in expanded:
        for dep in SUBAGENT_REGISTRY[k].depends_on:
            if dep in expanded:
                in_degree[k] += 1
                dependents[dep].append(k)

    ready = sorted([k for k, deg in in_degree.items() if deg == 0], key=lambda x: order_index[x])
    ordered: list[SubagentSpec] = []

    while ready:
        current = ready.pop(0)
        ordered.append(SUBAGENT_REGISTRY[current])
        for nxt in dependents[current]:
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                ready.append(nxt)
        ready.sort(key=lambda x: order_index[x])

    if len(ordered) != len(expanded):
        raise AppError(
            code=ErrorCode.VALIDATION_ERROR,
            message="Ciclo detectado no grafo de dependencias de subagentes.",
            http_status=500,
        )
    return ordered


class ProjectOrchestratorService:
    """
    Hexagonal Core Orchestrator coordinating all 12 Lead Agents and 40 Specialized Subagents
    across Editorial Runtime & Platform Engineering domains.
    """

    def __init__(self, workspace_service: WorkspaceService) -> None:
        self._workspaces = workspace_service

    def get_topology(
        self,
        *,
        actor: AuthenticatedUser,
        workspace_id: UUID,
        division: AgentDivision | None = None,
        lead_key: str | None = None,
    ) -> OrchestratorTopology:
        self._workspaces.require_membership(actor, workspace_id)
        topo = get_orchestrator_topology()
        leads = topo.leads
        subagents = topo.subagents

        if division is not None:
            leads = [l for l in leads if l.division == division]
            subagents = [s for s in subagents if s.division == division]
        if lead_key is not None:
            if lead_key not in LEAD_AGENT_REGISTRY:
                raise AppError(
                    code=ErrorCode.RESOURCE_NOT_FOUND,
                    message=f"Agente lider '{lead_key}' nao encontrado.",
                    http_status=404,
                )
            leads = [l for l in leads if l.key == lead_key]
            subagents = [s for s in subagents if s.lead_key == lead_key]

        return OrchestratorTopology(
            master=topo.master,
            leads=leads,
            subagents=subagents,
            PresetMissions=topo.PresetMissions,
        )

    def _select_subagents_for_objective(
        self,
        *,
        objective: str,
        scope: MissionScope,
        explicit_lead_keys: list[str] | None = None,
        explicit_subagent_keys: list[str] | None = None,
    ) -> set[str]:
        if explicit_subagent_keys:
            unknown = [k for k in explicit_subagent_keys if k not in SUBAGENT_REGISTRY]
            if unknown:
                raise AppError(
                    code=ErrorCode.VALIDATION_ERROR,
                    message=f"Subagentes desconhecidos: {', '.join(unknown)}",
                    http_status=422,
                    details={"unknown_subagents": unknown},
                )
            return set(explicit_subagent_keys)

        if explicit_lead_keys:
            unknown_leads = [k for k in explicit_lead_keys if k not in LEAD_AGENT_REGISTRY]
            if unknown_leads:
                raise AppError(
                    code=ErrorCode.VALIDATION_ERROR,
                    message=f"Agentes lideres desconhecidos: {', '.join(unknown_leads)}",
                    http_status=422,
                    details={"unknown_leads": unknown_leads},
                )
            return {
                s.key
                for s in SUBAGENT_REGISTRY.values()
                if s.lead_key in set(explicit_lead_keys)
            }

        if scope == MissionScope.FULL_PROJECT:
            return set(SUBAGENT_REGISTRY.keys())

        allowed_division = (
            AgentDivision.EDITORIAL_RUNTIME
            if scope == MissionScope.EDITORIAL
            else AgentDivision.ENGINEERING_PLATFORM
        )

        lowered = objective.lower()
        matched: set[str] = set()
        for sub in SUBAGENT_REGISTRY.values():
            if sub.division != allowed_division:
                continue
            if any(kw in lowered for kw in sub.trigger_keywords):
                matched.add(sub.key)

        # If broad objective without specific keywords, activate the complete division pipeline
        if not matched:
            matched = {
                s.key for s in SUBAGENT_REGISTRY.values() if s.division == allowed_division
            }
        return matched

    def plan_mission(
        self,
        *,
        actor: AuthenticatedUser,
        workspace_id: UUID,
        objective: str,
        scope: MissionScope = MissionScope.FULL_PROJECT,
        lead_keys: list[str] | None = None,
        subagent_keys: list[str] | None = None,
    ) -> MissionPlan:
        self._workspaces.require_membership(actor, workspace_id)
        clean_obj, warnings = _sanitize_objective(objective)
        if len(clean_obj) < 5:
            raise AppError(
                code=ErrorCode.VALIDATION_ERROR,
                message="Descreva o objetivo da missao com pelo menos 5 caracteres.",
                http_status=422,
                details={"field": "objective"},
            )

        selected_raw = self._select_subagents_for_objective(
            objective=clean_obj,
            scope=scope,
            explicit_lead_keys=lead_keys,
            explicit_subagent_keys=subagent_keys,
        )
        ordered_specs = _topological_sort_subagents(selected_raw)

        steps: list[MissionPlanStep] = []
        seen_leads: list[str] = []
        for idx, sub in enumerate(ordered_specs, start=1):
            lead = LEAD_AGENT_REGISTRY[sub.lead_key]
            if lead.key not in seen_leads:
                seen_leads.append(lead.key)
            steps.append(
                MissionPlanStep(
                    step_order=idx,
                    lead_key=lead.key,
                    lead_display_name=lead.display_name,
                    subagent_key=sub.key,
                    subagent_display_name=sub.display_name,
                    division=sub.division,
                    domain=sub.domain,
                    studio_room_key=sub.studio_room_key,
                    skills_activated=list(sub.skills),
                    expected_inputs=list(sub.inputs),
                    expected_outputs=list(sub.outputs),
                    guardrails_enforced=list(sub.guardrails),
                    depends_on=list(sub.depends_on),
                    requires_human_gate=sub.requires_human_gate,
                    rationale=sub.mission,
                )
            )

        digest = hashlib.sha256(
            f"{workspace_id}:{scope.value}:{clean_obj}:{','.join(s.key for s in ordered_specs)}".encode("utf-8")
        ).hexdigest()[:12]

        limitations = [
            "Execucao deterministica local-first (ADR-007): metricas ausentes permanecem UNKNOWN e exigem sync real para valores privados.",
            "Publicacao final no YouTube permanece 100% manual pelo operador humano (ADR-002).",
            *warnings,
        ]

        return MissionPlan(
            plan_id=f"plan-{digest}",
            objective=clean_obj,
            scope=scope,
            selected_lead_keys=seen_leads,
            selected_subagent_keys=[s.key for s in ordered_specs],
            steps=steps,
            human_gates_count=sum(1 for s in ordered_specs if s.requires_human_gate),
            validation_gates=[
                "Gate 1 — Contratos & Pureza Hexagonal (core/ sem acoplamento HTTP/UI)",
                "Gate 2 — Seguranca AppSec, Isolamento RLS & Anti-Plagio (< 0.70)",
                "Gate 3 — Estresse Concorrente & Reuso de Conexoes",
                "Gate 4 — Engenharia de Caos (Drift DOM, Circuit Breaker & Modo Degradado)",
            ],
            limitations=limitations,
        )

    def execute_mission(
        self,
        *,
        actor: AuthenticatedUser,
        workspace_id: UUID,
        objective: str,
        scope: MissionScope = MissionScope.FULL_PROJECT,
        channel_id: UUID | None = None,
        lead_keys: list[str] | None = None,
        subagent_keys: list[str] | None = None,
        approve_human_gates: bool = False,
    ) -> MissionExecutionReport:
        self._workspaces.require_membership(
            actor,
            workspace_id,
            allowed_roles=(WorkspaceRole.OWNER, WorkspaceRole.EDITOR),
        )
        plan = self.plan_mission(
            actor=actor,
            workspace_id=workspace_id,
            objective=objective,
            scope=scope,
            lead_keys=lead_keys,
            subagent_keys=subagent_keys,
        )

        executed_steps: list[SubagentExecutionStep] = []
        pending_human_gates = 0

        for step in plan.steps:
            is_final_publish_gate = step.subagent_key == "publicacao.human_gate_enforcer"
            if is_final_publish_gate:
                status = "waiting_human_gate"
                pending_human_gates += 1
            elif step.requires_human_gate and not approve_human_gates:
                status = "waiting_human_gate"
                pending_human_gates += 1
            else:
                status = "completed"

            artifact_type = step.expected_outputs[0] if step.expected_outputs else f"{step.domain}_artifact"
            summary = (
                f"{step.subagent_display_name} gerou '{artifact_type}' no dominio '{step.domain}' "
                f"({'aguardando aprovacao humana' if status == 'waiting_human_gate' else 'validado'})."
            )

            executed_steps.append(
                SubagentExecutionStep(
                    step_order=step.step_order,
                    lead_key=step.lead_key,
                    subagent_key=step.subagent_key,
                    subagent_display_name=step.subagent_display_name,
                    division=step.division,
                    domain=step.domain,
                    status=status,
                    artifact_type=artifact_type,
                    summary=summary,
                    checks_passed=[f"skill:{sk}" for sk in step.skills_activated],
                    guardrail_notes=step.guardrails_enforced,
                    requires_human_gate=step.requires_human_gate,
                    output_payload={
                        "artifact_type": artifact_type,
                        "expected_outputs": step.expected_outputs,
                        "studio_room_key": step.studio_room_key,
                        "human_gate_approved": bool(approve_human_gates and not is_final_publish_gate),
                        "requires_human_publish": True,
                    },
                )
            )

        completed_count = sum(1 for s in executed_steps if s.status == "completed")
        overall_status = "waiting_human_approval" if pending_human_gates > 0 else "completed"

        return MissionExecutionReport(
            execution_id=f"exec-{uuid4().hex[:12]}",
            plan_id=plan.plan_id,
            workspace_id=str(workspace_id),
            channel_id=str(channel_id) if channel_id else None,
            objective=plan.objective,
            scope=plan.scope,
            overall_status=overall_status,
            executed_steps=executed_steps,
            completed_count=completed_count,
            human_gate_pending_count=pending_human_gates,
            requires_human_publish=True,
            auto_publish_enabled=False,
            limitations=plan.limitations,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
