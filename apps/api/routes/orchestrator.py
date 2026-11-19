from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from apps.api.dependencies import (
    ServiceContainer,
    enforce_origin,
    get_container,
    get_current_user,
    get_workspace_id,
)
from core.orchestrator.models import AgentDivision, MissionScope
from core.workspaces.models import AuthenticatedUser

router = APIRouter(prefix="/api/v1/orchestrator", tags=["Orchestrator & Subagents"])


class PlanMissionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objective: str = Field(min_length=5, max_length=1200)
    scope: MissionScope = MissionScope.FULL_PROJECT
    lead_keys: list[str] | None = None
    subagent_keys: list[str] | None = None


class ExecuteMissionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objective: str = Field(min_length=5, max_length=1200)
    scope: MissionScope = MissionScope.FULL_PROJECT
    channel_id: UUID | None = None
    lead_keys: list[str] | None = None
    subagent_keys: list[str] | None = None
    approve_human_gates: bool = False


@router.get("/topology")
def get_topology_endpoint(
    division: AgentDivision | None = Query(default=None),
    lead_key: str | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    topo = container.orchestrator.get_topology(
        actor=user,
        workspace_id=workspace_id,
        division=division,
        lead_key=lead_key,
    )
    return topo.model_dump(mode="json")


@router.post("/plan", dependencies=[Depends(enforce_origin)])
def plan_mission_endpoint(
    body: PlanMissionBody,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    plan = container.orchestrator.plan_mission(
        actor=user,
        workspace_id=workspace_id,
        objective=body.objective,
        scope=body.scope,
        lead_keys=body.lead_keys,
        subagent_keys=body.subagent_keys,
    )
    return {"plan": plan.model_dump(mode="json")}


@router.post("/execute", dependencies=[Depends(enforce_origin)])
def execute_mission_endpoint(
    body: ExecuteMissionBody,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    report = container.orchestrator.execute_mission(
        actor=user,
        workspace_id=workspace_id,
        objective=body.objective,
        scope=body.scope,
        channel_id=body.channel_id,
        lead_keys=body.lead_keys,
        subagent_keys=body.subagent_keys,
        approve_human_gates=body.approve_human_gates,
    )
    return {"report": report.model_dump(mode="json")}
