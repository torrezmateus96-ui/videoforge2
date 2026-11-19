from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class StrictOrchestratorModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentDivision(str, Enum):
    EDITORIAL_RUNTIME = "editorial_runtime"
    ENGINEERING_PLATFORM = "engineering_platform"


class MissionScope(str, Enum):
    EDITORIAL = "editorial"
    ENGINEERING = "engineering"
    FULL_PROJECT = "full_project"


class SubagentSpec(StrictOrchestratorModel):
    key: str = Field(min_length=3, max_length=80)
    lead_key: str = Field(min_length=2, max_length=40)
    division: AgentDivision
    display_name: str = Field(min_length=3, max_length=120)
    domain: str = Field(min_length=2, max_length=60)
    studio_room_key: str | None = None
    OrderIndex: int = Field(ge=1, le=20)
    mission: str = Field(min_length=10, max_length=400)
    skills: tuple[str, ...] = Field(default_factory=tuple)
    inputs: tuple[str, ...] = Field(default_factory=tuple)
    outputs: tuple[str, ...] = Field(default_factory=tuple)
    guardrails: tuple[str, ...] = Field(default_factory=tuple)
    depends_on: tuple[str, ...] = Field(default_factory=tuple)
    requires_human_gate: bool = False
    trigger_keywords: tuple[str, ...] = Field(default_factory=tuple)


class LeadAgentSpec(StrictOrchestratorModel):
    key: str = Field(min_length=2, max_length=40)
    division: AgentDivision
    display_name: str = Field(min_length=3, max_length=120)
    role_title: str = Field(min_length=3, max_length=120)
    domain: str = Field(min_length=2, max_length=60)
    studio_agent_key: str | None = None
    studio_room_key: str | None = None
    mission: str = Field(min_length=10, max_length=450)
    requires_human_approval: bool = False
    depends_on_leads: tuple[str, ...] = Field(default_factory=tuple)
    skills: tuple[str, ...] = Field(default_factory=tuple)
    invariants: tuple[str, ...] = Field(default_factory=tuple)
    subagent_keys: tuple[str, ...] = Field(default_factory=tuple)


class MasterOrchestratorSpec(StrictOrchestratorModel):
    key: str
    display_name: str
    version: str
    mission: str
    routing_policy: tuple[str, ...]
    global_guardrails: tuple[str, ...]
    lead_agent_keys: tuple[str, ...]
    total_leads: int
    total_subagents: int


class OrchestratorTopology(StrictOrchestratorModel):
    master: MasterOrchestratorSpec
    leads: list[LeadAgentSpec]
    subagents: list[SubagentSpec]
    PresetMissions: list[dict[str, Any]]


class MissionPlanStep(StrictOrchestratorModel):
    step_order: int = Field(ge=1)
    lead_key: str
    lead_display_name: str
    subagent_key: str
    subagent_display_name: str
    division: AgentDivision
    domain: str
    studio_room_key: str | None = None
    skills_activated: list[str]
    expected_inputs: list[str]
    expected_outputs: list[str]
    guardrails_enforced: list[str]
    depends_on: list[str]
    requires_human_gate: bool
    rationale: str


class MissionPlan(StrictOrchestratorModel):
    plan_id: str
    objective: str
    scope: MissionScope
    selected_lead_keys: list[str]
    selected_subagent_keys: list[str]
    steps: list[MissionPlanStep]
    human_gates_count: int
    validation_gates: list[str]
    limitations: list[str]


class SubagentExecutionStep(StrictOrchestratorModel):
    step_order: int = Field(ge=1)
    lead_key: str
    subagent_key: str
    subagent_display_name: str
    division: AgentDivision
    domain: str
    status: str = Field(pattern=r"^(completed|waiting_human_gate|blocked_guardrail)$")
    artifact_type: str
    summary: str
    checks_passed: list[str]
    guardrail_notes: list[str]
    requires_human_gate: bool
    output_payload: dict[str, Any]


class MissionExecutionReport(StrictOrchestratorModel):
    execution_id: str
    plan_id: str
    workspace_id: str
    channel_id: str | None = None
    objective: str
    scope: MissionScope
    overall_status: str = Field(pattern=r"^(completed|waiting_human_approval|blocked_by_guardrail)$")
    executed_steps: list[SubagentExecutionStep]
    completed_count: int = Field(ge=0)
    human_gate_pending_count: int = Field(ge=0)
    requires_human_publish: bool = True
    auto_publish_enabled: bool = False
    limitations: list[str]
    created_at: str
