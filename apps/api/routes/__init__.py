from __future__ import annotations

from apps.api.routes.analytics_youtube import router as analytics_youtube_router
from apps.api.routes.diagnostics_reports import router as diagnostics_reports_router
from apps.api.routes.editorial_opportunities import router as editorial_opportunities_router
from apps.api.routes.jobs_storage import router as jobs_storage_router
from apps.api.routes.knowledge_rag import router as knowledge_rag_router
from apps.api.routes.orchestrator import router as orchestrator_router
from apps.api.routes.production_gateway import router as production_gateway_router
from apps.api.routes.research_intelligence import router as research_intelligence_router
from apps.api.routes.studio import router as studio_router
from apps.api.routes.workspaces_channels import router as workspaces_channels_router

DOMAIN_ROUTERS = (
    workspaces_channels_router,
    jobs_storage_router,
    analytics_youtube_router,
    research_intelligence_router,
    knowledge_rag_router,
    editorial_opportunities_router,
    production_gateway_router,
    diagnostics_reports_router,
    studio_router,
    orchestrator_router,
)

__all__ = [
    "DOMAIN_ROUTERS",
    "workspaces_channels_router",
    "jobs_storage_router",
    "analytics_youtube_router",
    "research_intelligence_router",
    "knowledge_rag_router",
    "editorial_opportunities_router",
    "production_gateway_router",
    "diagnostics_reports_router",
    "studio_router",
    "orchestrator_router",
]
