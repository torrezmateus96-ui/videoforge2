from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field

from apps.api.dependencies import (
    ServiceContainer,
    enforce_origin,
    get_container,
    get_current_user,
    get_workspace_id,
)
from core.errors import AppError, ErrorCode
from core.generation.title_thumbnail import check_originality, generate_original_title_alternatives
from core.research.channel_selector import ReferenceChannelCandidate, TargetChannelFit
from core.research.reference_modeling import (
    ModelingChannelCandidate,
    ModelingTargetProfile,
    ReferenceOutlierSample,
    build_complete_modeling_plan,
    default_modeling_candidate_presets,
)
from core.research.viral_outlier_analyzer import ChannelVideoRecord
from core.workspaces.models import AuthenticatedUser, WorkspaceRole

router = APIRouter(
    prefix="/api/v1",
    tags=["Research & Intelligence"],
    dependencies=[Depends(enforce_origin)],
)


# ------------------------------------------------------------------------------
# 1. Public Research Runs, Reference Curation & Title/Thumbnail Intelligence
# ------------------------------------------------------------------------------


class ResearchCandidateInput(BaseModel):
    external_channel_id: str
    channel_name: str
    language: str | None = None
    external_video_id: str | None = None
    title: str = ""
    description: str = ""
    format: str = "unknown"
    duration_seconds: int | None = None
    thumbnail_url: str | None = None
    public_views: int | None = None
    public_likes: int | None = None
    public_comments: int | None = None


class CreateResearchRunRequest(BaseModel):
    channel_id: UUID
    objective: str = Field(min_length=2)
    query_terms: list[str] = Field(default_factory=list)
    language: str = "pt-BR"
    period_days: int = Field(default=90, ge=1, le=3650)
    format_filter: str = Field(default="all", pattern="^(all|long|short|live)$")
    quota_budget: int = Field(default=20, ge=1, le=500)
    channel_niche: str = ""
    channel_pillars: list[str] = Field(default_factory=list)
    candidates: list[ResearchCandidateInput] = Field(default_factory=list)


class CurateReferenceRequest(BaseModel):
    entity_type: str = Field(pattern="^(channel|video)$")
    status: str = Field(pattern="^(pending|approved|rejected|archived)$")
    notes: str = ""
    collection_name: str = "default"


class AnalyzeTitleRequest(BaseModel):
    title: str = Field(min_length=1)
    channel_id: UUID | None = None
    reference_video_id: UUID | None = None


class GenerateTitlesRequest(BaseModel):
    channel_name: str
    niche: str
    topic: str
    reference_titles: list[str] = Field(default_factory=list)
    forbidden_topics: list[str] = Field(default_factory=list)


class OriginalityCheckRequest(BaseModel):
    candidate_title: str
    reference_titles: list[str] = Field(default_factory=list)


class AnalyzeThumbnailRequest(BaseModel):
    source_url: str
    reference_video_id: UUID | None = None
    reference_notes: str = ""


# ------------------------------------------------------------------------------
# 2. YouTube Studio Assisted Trends & Outliers
# ------------------------------------------------------------------------------


class CreateStudioRunRequest(BaseModel):
    channel_id: UUID
    broad_topic: str = Field(min_length=2, max_length=200)
    min_interest: str = Field(default="medium", pattern="^(low|medium|high|very_high)$")
    only_watched_by_my_viewers: bool = False
    upload_window_days: int | None = Field(default=28, ge=1, le=3650)
    min_outlier_ratio: float = Field(default=3.0, ge=1.0, le=100.0)
    execute_now: bool = True


class IngestStudioCaptureRequest(BaseModel):
    terms: list[dict[str, Any]] = Field(default_factory=list)
    videos: list[dict[str, Any]] = Field(default_factory=list)
    channel_baselines: dict[str, list[int]] = Field(default_factory=dict)
    min_outlier_ratio: float = Field(default=3.0, ge=1.0, le=100.0)


class CurateStudioItemRequest(BaseModel):
    status: str = Field(pattern="^(pending|approved|rejected|archived)$")


# ------------------------------------------------------------------------------
# 3. Google Trends Validation & CSV Import
# ------------------------------------------------------------------------------


class ValidateGoogleTrendsRequest(BaseModel):
    keyword: str = Field(min_length=2, max_length=200)
    channel_id: UUID | None = None
    studio_term_id: UUID | None = None
    geo: str | None = Field(default=None, max_length=10)
    gprop: str = Field(default="youtube", pattern="^(youtube|web|news|images)$")
    force_refresh: bool = False


class ImportGoogleTrendsCsvRequest(BaseModel):
    keyword: str = Field(min_length=2, max_length=200)
    channel_id: UUID | None = None
    studio_term_id: UUID | None = None
    geo: str = Field(default="BR", max_length=10)
    gprop: str = Field(default="youtube", pattern="^(youtube|web|news|images)$")
    timeline_12m_csv: str = ""
    timeline_5y_csv: str = ""
    related_queries_csv: str = ""


# ------------------------------------------------------------------------------
# 4. Viral Outlier Reverse Engineering Engine (4 Phases)
# ------------------------------------------------------------------------------


class ChannelCandidatePayload(BaseModel):
    external_channel_id: str
    display_name: str
    language: str = "pt-BR"
    market_country: str = "BR"
    recent_video_views_90d: list[int] = Field(default_factory=list)
    all_recent_20_30_views: list[int] = Field(default_factory=list)
    production_format: str = "faceless_essay"
    audience_profile_tags: list[str] = Field(default_factory=list)
    is_celebrity_or_mega_brand: bool = False
    subscriber_count: int | None = None


class Phase1EvaluateChannelsRequest(BaseModel):
    channel_id: UUID
    target_language: str = "pt-BR"
    target_country: str = "BR"
    feasible_formats: list[str] = Field(default_factory=lambda: ["faceless_essay", "documentary"])
    target_audience_tags: list[str] = Field(default_factory=list)
    min_outlier_ratio: float = 3.0
    candidates: list[ChannelCandidatePayload] = Field(default_factory=list)


class Phase2VideoPayload(BaseModel):
    external_video_id: str
    external_channel_id: str
    channel_name: str
    title: str
    views: int
    days_since_upload: int = Field(ge=1)
    duration_seconds: int | None = None
    topic: str = ""
    format_name: str = "long"
    is_breaking_news: bool = False
    has_celebrity_collab: bool = False
    channel_authority_only: bool = False
    in_suggested_feed: bool = False


class Phase2FindOutliersRequest(BaseModel):
    channel_id: UUID
    small_niche: bool = False
    videos: list[Phase2VideoPayload] = Field(default_factory=list)


class Phase3AutopsyRequest(BaseModel):
    channel_id: UUID
    external_video_id: str
    title: str
    transcript_or_notes: str = ""
    comments: list[str] = Field(default_factory=list)
    thumbnail_focus: str = ""
    thumbnail_visual_question: str = ""
    thumbnail_emotion: str = "curiosidade"
    thumbnail_text: str = ""
    first_visual_description: str = ""


class Phase4SynthesizeRequest(BaseModel):
    channel_id: UUID
    autopsy_ids: list[UUID] | None = None
    own_validated_topic: str = Field(min_length=2)
    new_angle: str = Field(min_length=2)
    target_format: str = Field(default="long", pattern="^(long|short|live)$")


class CreateBatchRequest(BaseModel):
    channel_id: UUID
    mechanism_id: UUID | None = None
    brief_id: UUID | None = None
    title: str = Field(min_length=2)


class UpdateBatchMetricsRequest(BaseModel):
    status: str = Field(pattern="^(PLANNED|PUBLISHED_MEASURING|VALIDATED|INCONCLUSIVE|REJECTED)$")
    impressions: int | None = None
    ctr_pct: float | None = None
    retention_30s_pct: float | None = None
    outcome_notes: str = ""


class ModelingOutlierSamplePayload(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    views: int = Field(ge=0)
    days_since_upload: int = Field(default=30, ge=1, le=3650)
    thumbnail_cue: str = Field(default="", max_length=300)
    thumbnail_overlay: str = Field(default="", max_length=80)
    topic_tag: str = Field(default="", max_length=120)
    unanswered_comment: str = Field(default="", max_length=300)


class ModelingCandidateChannelPayload(BaseModel):
    external_channel_id: str = Field(min_length=2, max_length=120)
    display_name: str = Field(min_length=2, max_length=140)
    handle: str = Field(default="", max_length=80)
    language: str = Field(default="pt-BR", max_length=16)
    market_country: str = Field(default="BR", max_length=8)
    subscriber_count: int = Field(default=25000, ge=0)
    recent_views_sample: list[int] = Field(default_factory=list)
    recent_90d_views: list[int] = Field(default_factory=list)
    production_format: str = Field(default="faceless_essay", max_length=80)
    niche_tags: list[str] = Field(default_factory=list)
    editorial_pillars: list[str] = Field(default_factory=list)
    is_celebrity_or_mega_brand: bool = False
    relies_on_breaking_news: bool = False
    outlier_samples: list[ModelingOutlierSamplePayload] = Field(default_factory=list)


class ModelingPlaybookRequest(BaseModel):
    channel_name: str = Field(default="Meu Canal", min_length=1, max_length=140)
    niche: str = Field(default="Documentario", min_length=1, max_length=200)
    editorial_theme: str = Field(default="", max_length=240)
    pillars: list[str] = Field(default_factory=list)
    language: str = Field(default="pt-BR", max_length=16)
    market_country: str = Field(default="BR", max_length=8)
    feasible_formats: list[str] = Field(default_factory=lambda: ["faceless_essay", "long_documentary"])
    audience_tags: list[str] = Field(default_factory=list)
    forbidden_topics: list[str] = Field(default_factory=list)
    min_outlier_ratio: float = Field(default=3.0, ge=1.5, le=50.0)
    focus_topic: str = Field(min_length=2, max_length=200)
    custom_angle: str = Field(default="", max_length=240)
    candidates: list[ModelingCandidateChannelPayload] = Field(default_factory=list)


def _ser(obj: Any) -> Any:
    if isinstance(obj, list):
        return [_ser(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _ser(v) for k, v in obj.items()}
    if isinstance(obj, UUID):
        return str(obj)
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if hasattr(obj, "__float__") and type(obj).__name__ == "Decimal":
        return float(obj)
    return obj


def _require_studio_trends(container: ServiceContainer):
    if container.studio_trends is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "StudioTrendsService nao configurado.", http_status=503, retryable=True)
    return container.studio_trends


def _require_gtrends(container: ServiceContainer):
    if container.google_trends is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "GoogleTrendsService nao configurado.", http_status=503, retryable=True)
    return container.google_trends


def _require_re(container: ServiceContainer):
    if container.reverse_engineering is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "ReverseEngineeringService nao configurado.", http_status=503, retryable=True)
    return container.reverse_engineering


@router.post("/research/runs", status_code=201)
def create_research_run(
    body: CreateResearchRunRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    if container.research is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "ResearchService nao configurado.", http_status=503, retryable=True)
    res = container.research.create_and_populate_run(
        actor=actor,
        workspace_id=workspace_id,
        channel_id=body.channel_id,
        objective=body.objective,
        query_terms=body.query_terms,
        language=body.language,
        period_days=body.period_days,
        format_filter=body.format_filter,
        quota_budget=body.quota_budget,
        idempotency_key=idempotency_key or str(uuid4()),
        candidates=[c.model_dump() for c in body.candidates],
        channel_niche=body.channel_niche,
        channel_pillars=body.channel_pillars,
    )
    return _ser(res)


@router.get("/research/runs/{run_id}")
def get_research_run(
    run_id: UUID,
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    if container.research is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "ResearchService nao configurado.", http_status=503, retryable=True)
    return _ser(container.research.get_run_detail(actor, workspace_id, run_id))


@router.get("/research/references")
def list_references(
    curation_status: str | None = Query(default=None),
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    container.workspaces.require_membership(actor, workspace_id)
    if container.research_repo is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "ResearchRepo nao configurado.", http_status=503, retryable=True)
    return _ser(container.research_repo.list_references(workspace_id, curation_status))


@router.post("/research/references/{ref_id}/curate")
def curate_reference(
    ref_id: UUID,
    body: CurateReferenceRequest,
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    if container.research is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "ResearchService nao configurado.", http_status=503, retryable=True)
    return _ser(
        container.research.curate_reference(
            actor, workspace_id, body.entity_type, ref_id, body.status, body.notes, body.collection_name
        )
    )


@router.post("/intel/titles/analyze")
def analyze_title(
    body: AnalyzeTitleRequest,
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    if container.title_thumb is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "TitleThumbnailService nao configurado.", http_status=503, retryable=True)
    return _ser(
        container.title_thumb.analyze_title(actor, workspace_id, body.title, body.channel_id, body.reference_video_id)
    )


@router.post("/intel/titles/generate")
def generate_titles(
    body: GenerateTitlesRequest,
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    container.workspaces.require_membership(actor, workspace_id)
    items = generate_original_title_alternatives(
        body.channel_name, body.niche, body.topic, body.reference_titles, body.forbidden_topics
    )
    return {"items": items}


@router.post("/intel/titles/originality-check")
def check_title_originality(
    body: OriginalityCheckRequest,
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    container.workspaces.require_membership(actor, workspace_id)
    return check_originality(body.candidate_title, body.reference_titles)


@router.post("/intel/thumbnails/analyze")
def analyze_thumbnail(
    body: AnalyzeThumbnailRequest,
    actor: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    if container.title_thumb is None:
        raise AppError(ErrorCode.SUPABASE_UNAVAILABLE, "TitleThumbnailService nao configurado.", http_status=503, retryable=True)
    return _ser(
        container.title_thumb.analyze_thumbnail(
            actor, workspace_id, body.source_url, image_bytes=None, reference_video_id=body.reference_video_id, reference_notes=body.reference_notes
        )
    )


@router.get("/research/studio-session/status")
def studio_session_status(
    channel_id: UUID | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser(svc.session_status(user, workspace_id, channel_id=channel_id))


@router.post("/research/studio-session/login-window")
def open_studio_manual_login(
    channel_id: UUID | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser(svc.launch_manual_login(user, workspace_id, channel_id=channel_id))


@router.get("/research/studio-runs")
def list_studio_runs(
    channel_id: UUID | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser({"items": svc.list_runs(user, workspace_id, channel_id=channel_id)})


@router.post("/research/studio-runs", status_code=201)
def create_studio_run(
    body: CreateStudioRunRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser(
        svc.create_studio_run(
            user,
            workspace_id,
            body.channel_id,
            broad_topic=body.broad_topic,
            min_interest=body.min_interest,
            only_watched_by_my_viewers=body.only_watched_by_my_viewers,
            upload_window_days=body.upload_window_days,
            min_outlier_ratio=body.min_outlier_ratio,
            idempotency_key=idempotency_key,
            execute_now=body.execute_now,
        )
    )


@router.get("/research/studio-runs/{run_id}")
def get_studio_run_detail(
    run_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser(svc.get_run_detail(user, workspace_id, run_id))


@router.post("/research/studio-runs/{run_id}/ingest")
def ingest_studio_capture(
    run_id: UUID,
    body: IngestStudioCaptureRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser(
        svc.ingest_captured_payload(
            user,
            workspace_id,
            run_id,
            terms=body.terms,
            videos=body.videos,
            channel_baselines=body.channel_baselines,
            min_outlier_ratio=body.min_outlier_ratio,
        )
    )


@router.post("/research/studio-items/{kind}/{item_id}/curate")
def curate_studio_item(
    kind: str,
    item_id: UUID,
    body: CurateStudioItemRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_studio_trends(container)
    return _ser({"item": svc.curate_item(user, workspace_id, kind, item_id, body.status)})


@router.get("/research/google-trends")
def list_google_trends_validations(
    channel_id: UUID | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_gtrends(container)
    return _ser({"items": svc.list_validations(user, workspace_id, channel_id=channel_id)})


@router.post("/research/google-trends/validate")
def validate_google_trends(
    body: ValidateGoogleTrendsRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_gtrends(container)
    return _ser(
        svc.validate_keyword(
            user,
            workspace_id,
            body.keyword,
            channel_id=body.channel_id,
            studio_term_id=body.studio_term_id,
            geo=body.geo,
            gprop=body.gprop if body.gprop != "web" else "",
            force_refresh=body.force_refresh,
        )
    )


@router.post("/research/google-trends/import-csv")
def import_google_trends_csv(
    body: ImportGoogleTrendsCsvRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_gtrends(container)
    return _ser(
        svc.import_csv_validation(
            user,
            workspace_id,
            keyword=body.keyword,
            geo=body.geo,
            gprop=body.gprop if body.gprop != "web" else "",
            timeline_12m_csv=body.timeline_12m_csv,
            timeline_5y_csv=body.timeline_5y_csv,
            related_queries_csv=body.related_queries_csv,
            channel_id=body.channel_id,
            studio_term_id=body.studio_term_id,
        )
    )


@router.get("/research/reverse-engineering/state")
def get_re_state(
    channel_id: UUID | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    return _ser(svc.list_state(user, workspace_id, channel_id=channel_id))


@router.post("/research/reverse-engineering/phase1-channels")
def phase1_channels(
    body: Phase1EvaluateChannelsRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    target = TargetChannelFit(
        language=body.target_language,
        market_country=body.target_country,
        feasible_formats=body.feasible_formats,
        target_audience_tags=body.target_audience_tags,
        min_outlier_ratio=body.min_outlier_ratio,
    )
    cands = [ReferenceChannelCandidate(**c.model_dump()) for c in body.candidates]
    return _ser(svc.phase1_evaluate_channels(user, workspace_id, body.channel_id, target=target, candidates=cands))


@router.post("/research/reverse-engineering/phase2-outliers")
def phase2_outliers(
    body: Phase2FindOutliersRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    by_ch: dict[str, list[ChannelVideoRecord]] = {}
    for v in body.videos:
        by_ch.setdefault(v.external_channel_id, []).append(ChannelVideoRecord(**v.model_dump()))
    return _ser(svc.phase2_find_viral_outliers(user, workspace_id, body.channel_id, videos_by_channel=by_ch, small_niche=body.small_niche))


@router.post("/research/reverse-engineering/phase3-autopsy")
def phase3_autopsy(
    body: Phase3AutopsyRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    return _ser(
        {
            "autopsy": svc.phase3_run_autopsy(
                user,
                workspace_id,
                body.channel_id,
                external_video_id=body.external_video_id,
                title=body.title,
                transcript_or_notes=body.transcript_or_notes,
                comments=body.comments,
                thumbnail_focus=body.thumbnail_focus,
                thumbnail_visual_question=body.thumbnail_visual_question,
                thumbnail_emotion=body.thumbnail_emotion,
                thumbnail_text=body.thumbnail_text,
                first_visual_description=body.first_visual_description,
            )
        }
    )


@router.post("/research/reverse-engineering/phase4-synthesize")
def phase4_synthesize(
    body: Phase4SynthesizeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    return _ser(
        {
            "mechanism": svc.phase4_synthesize_mechanism(
                user,
                workspace_id,
                body.channel_id,
                autopsy_ids=body.autopsy_ids,
                own_validated_topic=body.own_validated_topic,
                new_angle=body.new_angle,
                target_format=body.target_format,
            )
        }
    )


@router.post("/research/reverse-engineering/batches")
def create_experiment_batch(
    body: CreateBatchRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    return _ser(
        {
            "batch": svc.create_experiment_batch(
                user,
                workspace_id,
                body.channel_id,
                title=body.title,
                mechanism_id=body.mechanism_id,
                brief_id=body.brief_id,
            )
        }
    )


@router.patch("/research/reverse-engineering/batches/{batch_id}")
def update_experiment_batch(
    batch_id: UUID,
    body: UpdateBatchMetricsRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    svc = _require_re(container)
    return _ser(
        {
            "batch": svc.record_experiment_metrics(
                user,
                workspace_id,
                batch_id,
                status=body.status,
                impressions=body.impressions,
                ctr_pct=body.ctr_pct,
                retention_30s_pct=body.retention_30s_pct,
                outcome_notes=body.outcome_notes,
            )
        }
    )


@router.get("/research/modeling/presets")
def get_modeling_candidate_presets(
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    container.workspaces.require_membership(user, workspace_id)
    return {"candidates": default_modeling_candidate_presets()}


@router.post("/research/modeling/playbook")
def generate_reference_modeling_playbook(
    body: ModelingPlaybookRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    workspace_id: UUID = Depends(get_workspace_id),
    container: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    container.workspaces.require_membership(
        user,
        workspace_id,
        (WorkspaceRole.OWNER, WorkspaceRole.EDITOR),
    )
    raw_cands = (
        [c.model_dump() for c in body.candidates]
        if body.candidates
        else default_modeling_candidate_presets()
    )
    domain_candidates = [
        ModelingChannelCandidate(
            external_channel_id=c["external_channel_id"],
            display_name=c["display_name"],
            handle=c.get("handle", ""),
            language=c.get("language", "pt-BR"),
            market_country=c.get("market_country", "BR"),
            subscriber_count=int(c.get("subscriber_count") or 0),
            recent_views_sample=[int(v) for v in c.get("recent_views_sample", [])],
            recent_90d_views=[int(v) for v in c.get("recent_90d_views", [])],
            production_format=c.get("production_format", "faceless_essay"),
            niche_tags=list(c.get("niche_tags", [])),
            editorial_pillars=list(c.get("editorial_pillars", [])),
            is_celebrity_or_mega_brand=bool(c.get("is_celebrity_or_mega_brand", False)),
            relies_on_breaking_news=bool(c.get("relies_on_breaking_news", False)),
            outlier_samples=[
                ReferenceOutlierSample(**osmp) for osmp in c.get("outlier_samples", [])
            ],
        )
        for c in raw_cands
    ]
    target = ModelingTargetProfile(
        channel_name=body.channel_name,
        niche=body.niche,
        editorial_theme=body.editorial_theme,
        pillars=body.pillars,
        language=body.language,
        market_country=body.market_country,
        feasible_formats=body.feasible_formats,
        audience_tags=body.audience_tags,
        forbidden_topics=body.forbidden_topics,
        min_outlier_ratio=body.min_outlier_ratio,
    )
    playbook = build_complete_modeling_plan(
        candidates=domain_candidates,
        target=target,
        focus_topic=body.focus_topic,
        custom_angle=body.custom_angle,
    )
    return _ser({"playbook": playbook})
