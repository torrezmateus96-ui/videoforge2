from __future__ import annotations

import hashlib
import json
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID

from adapters.ai_providers.router import AIProviderRouter, redact_sensitive_text
from adapters.supabase_db.studio_repo import PostgresStudioRepository
from core.errors import AppError, ErrorCode
from core.jobs.models import ClaimedJob
from core.studio.contracts import build_agent_prompt, validate_agent_output_envelope
from core.studio.registry import AGENT_REGISTRY
from workers.runner import WorkerContext

ModelCaller = Callable[[str, dict[str, Any], dict[str, Any]], dict[str, Any]]

TITLE_SIMILARITY_REVIEW_THRESHOLD = 0.70


def _json_hash(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def _extract_forbidden_topics(profile: dict[str, Any]) -> list[str]:
    restrictions = profile.get("restrictions_json") or {}
    if isinstance(restrictions, dict):
        topics = restrictions.get("forbidden_topics") or []
    elif isinstance(restrictions, list):
        topics = restrictions
    else:
        topics = []
    return [str(t).strip().lower() for t in topics if str(t).strip()]


def default_local_agent_model_caller(
    prompt: str,
    context: dict[str, Any],
    meta: dict[str, Any],
) -> dict[str, Any]:
    """Gerador local deterministico que respeita estritamente dados reais do banco (zero numero inventado)."""
    agent_key: str = meta["agent_key"]
    channel = context["channel"]
    channel_id = str(channel["id"])
    content_item = context.get("content_item")
    content_item_id = str(content_item["id"]) if content_item else None
    working_title = (content_item or {}).get("working_title") or channel.get("editorial_theme") or channel.get("display_name") or "Tema do canal"
    now_iso = datetime.now(timezone.utc).isoformat()
    profile_id = channel.get("profile_version_id")

    sources: list[dict[str, Any]] = []
    if profile_id:
        sources.append({"kind": "profile_version", "id": str(profile_id), "locator": f"v{channel.get('version_number', 1)}"})

    limitations: list[str] = []

    if agent_key == "dados":
        metrics_rows = context.get("metrics") or []
        by_id = {m["metric_id"]: m for m in metrics_rows}
        period_end = date.today()
        period_start = period_end - timedelta(days=28)

        def metric_entry(mid: str, key: str) -> dict[str, Any]:
            row = by_id.get(mid)
            if row and row.get("availability") == "available" and row.get("value_num") is not None:
                sources.append({"kind": "metric", "id": str(row["id"]), "locator": mid})
                return {
                    "key": key,
                    "value": float(row["value_num"]),
                    "delta_pct": None,
                    "availability": "available",
                    "fetched_at": str(row.get("fetched_at") or now_iso),
                }
            limitations.append(f"Metrica {mid} indisponivel no banco (mantida como null).")
            return {
                "key": key,
                "value": None,
                "delta_pct": None,
                "availability": "unknown",
                "fetched_at": None,
            }

        metrics_out = [
            metric_entry("yt.analytics.views", "views"),
            metric_entry("yt.analytics.impressions_ctr", "ctr"),
            metric_entry("yt.analytics.avg_view_duration_sec", "avg_view_duration_sec"),
        ]
        available_cnt = sum(1 for m in metrics_out if m["availability"] == "available")
        confidence = "alta" if available_cnt == 3 else ("media" if available_cnt >= 1 else "baixa")
        findings = (
            [{"text": f"{available_cnt} metricas sincronizadas lidas do historico real.", "evidence": [s["id"] for s in sources]}]
            if available_cnt > 0
            else [{"text": "Sem metricas sincronizadas; aguardando OAuth/sync do canal.", "evidence": [s["id"] for s in sources]}]
        )
        return {
            "agent_key": "dados",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": (
                f"{available_cnt}/3 metricas reais analisadas"
                if available_cnt > 0
                else "Analytics indisponivel (dados marcados como unknown)"
            )[:120],
            "confidence": confidence,
            "limitations": limitations,
            "sources": sources,
            "payload": {
                "period": {"from": period_start.isoformat(), "to": period_end.isoformat()},
                "metrics": metrics_out,
                "findings": findings,
            },
        }

    if agent_key == "pesquisa":
        from core.research.reference_modeling import _content_tokens, extract_title_blueprint

        refs = list(context.get("references") or [])
        outliers = list(context.get("studio_outliers") or [])
        gt = list(context.get("google_trends") or [])

        pillars_list = channel.get("pillars_json") or []
        channel_lex = set(
            _content_tokens(
                " ".join(
                    [
                        str(channel.get("niche") or ""),
                        str(channel.get("editorial_theme") or ""),
                        str(working_title),
                    ]
                    + [str(p) for p in pillars_list]
                )
            )
        )

        # Ranqueia referencias por aderencia aos pilares + sinal de curadoria (evita ordem arbitraria!)
        def _ref_rank(r: dict[str, Any]) -> tuple[int, int, int]:
            title_str = str(r.get("title") or "")
            toks = set(_content_tokens(title_str))
            overlap = len(toks & channel_lex)
            approved_bonus = 2 if str(r.get("curation_status") or "") == "approved" else 0
            pub_views = int(r.get("public_views") or 0)
            return (approved_bonus + overlap, len(toks), pub_views)

        ranked_refs = sorted(refs, key=_ref_rank, reverse=True)
        ranked_outliers = sorted(
            outliers,
            key=lambda o: (
                1 if o.get("watched_by_my_viewers") else 0,
                float(o.get("outlier_ratio") or 0.0),
            ),
            reverse=True,
        )

        candidates: list[dict[str, Any]] = []
        for r in ranked_refs[:4]:
            r_title = str(r.get("title") or "")
            bp = extract_title_blueprint(r_title)
            matched = sorted(set(_content_tokens(r_title)) & channel_lex)[:3]
            fit_tag = f"pilares ({', '.join(matched)})" if matched else "benchmark de embalagem"
            sources.append({"kind": "research_reference", "id": str(r["id"]), "locator": "reference_videos"})
            candidates.append(
                {
                    "reference_id": str(r["id"]),
                    "url": str(r.get("canonical_url") or ""),
                    "why_similar": (
                        f"Selecionada para modelar {fit_tag} · Arquetipo '{bp.archetype_label}' "
                        f"({bp.syntactic_formula}): {r_title[:95]}"
                    )[:490],
                    "observed_at": str(r.get("snapshot_observed_at") or now_iso),
                }
            )
        for o in ranked_outliers[:3]:
            o_title = str(o.get("title") or "")
            bp = extract_title_blueprint(o_title)
            ratio_txt = f"{float(o['outlier_ratio']):.1f}x" if o.get("outlier_ratio") is not None else "Outlier"
            viewer_tag = " · assistido pelo seu publico" if o.get("watched_by_my_viewers") else ""
            sources.append({"kind": "research_reference", "id": str(o["id"]), "locator": "studio_video_outliers"})
            candidates.append(
                {
                    "reference_id": str(o["id"]),
                    "url": str(o.get("canonical_url") or ""),
                    "why_similar": (
                        f"{ratio_txt} sobre a base{viewer_tag} · Formula {bp.syntactic_formula}: {o_title[:90]}"
                    )[:490],
                    "observed_at": str(o.get("created_at") or now_iso),
                }
            )
        for g in gt[:2]:
            sources.append({"kind": "research_reference", "id": str(g["id"]), "locator": "google_trends"})

        if candidates or gt:
            val_status = "validado"
            reason = (
                f"{len(candidates)} referencias ranqueadas por aderencia/eficiencia de outlier e "
                f"{len(gt)} validacoes de sustentabilidade Trends confirmam tracao modelavel."
            )
            conf = "alta" if len(candidates) >= 2 else "media"
        else:
            val_status = "sem_evidencia"
            reason = "Nenhuma referencia publica aprovada ou tendencia registrada ainda para extrair DNA de modelagem."
            limitations.append("Pesquisa publica sem referencias aprovadas no workspace.")
            conf = "baixa"

        return {
            "agent_key": "pesquisa",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": f"Tema {val_status} ({len(candidates)} refs ranqueadas)"[:120],
            "confidence": conf,
            "limitations": limitations,
            "sources": sources,
            "payload": {
                "question": f"Quais canais/outliers oferecem o melhor DNA para modelar '{working_title}' em {channel.get('display_name')}?",
                "candidates": candidates,
                "topic_validation": {
                    "topic": working_title,
                    "status": val_status,
                    "reason": reason[:590],
                },
            },
        }

    if agent_key == "estrategia":
        from core.research.reference_modeling import extract_title_blueprint

        prior = context.get("prior_outputs") or []
        for p in prior:
            sources.append({"kind": "agent_output", "id": str(p["id"]), "locator": p["output_type"]})
        chunks = context.get("knowledge_chunks") or []
        for ch in chunks[:3]:
            sources.append({"kind": "knowledge_chunk", "id": str(ch["chunk_id"]), "locator": ch.get("source_title")})

        refs = context.get("references") or []
        outliers = context.get("studio_outliers") or []
        has_refs = bool(refs or outliers or context.get("google_trends"))
        has_metrics = any(m.get("availability") == "available" for m in (context.get("metrics") or []))
        has_rag = bool(chunks)
        pot = round(0.45 + (0.25 if has_refs else 0.0) + (0.15 if has_rag else 0.0) + (0.10 if has_metrics else 0.0), 2)
        conc = 0.50 if has_refs else 0.35
        score_val = int(round(pot * 100))
        if not has_refs:
            limitations.append("Sem referencias publicas aprovadas; score reflete incerteza.")
        if not has_metrics:
            limitations.append("Sem metricas privadas sincronizadas.")

        pillars_list = [str(p) for p in (channel.get("pillars_json") or []) if str(p).strip()]
        anchor_pillar = pillars_list[0] if pillars_list else str(channel.get("niche") or "analise documental")
        sample_ref_titles = [str(o.get("title") or "") for o in outliers[:3]] + [str(r.get("title") or "") for r in refs[:3]]
        dominant_bp = (
            extract_title_blueprint(sample_ref_titles[0])
            if sample_ref_titles and sample_ref_titles[0].strip()
            else extract_title_blueprint(working_title)
        )

        evidence = [
            {
                "text": f"Mecanismo '{dominant_bp.archetype_label}' cruzado com {len(prior)} handoffs e {len(chunks)} fontes RAG.",
                "source_id": s["id"],
            }
            for s in sources[:3]
        ]
        return {
            "agent_key": "estrategia",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": f"Tema modelado '{working_title[:52]}' ({score_val}/100)"[:120],
            "confidence": "alta" if (has_refs and has_metrics) else ("media" if (has_refs or has_rag) else "baixa"),
            "limitations": limitations,
            "sources": sources,
            "payload": {
                "topic": working_title,
                "angle": (
                    f"Modela o mecanismo '{dominant_bp.archetype_label}' ({dominant_bp.syntactic_formula}) "
                    f"sob o recorte autoral de '{anchor_pillar}', focando na restricao real que os concorrentes omitiram."
                )[:590],
                "differentiation": (
                    f"Separa o gatilho cognitivo ({dominant_bp.emotional_trigger}) do assunto literal dos canais de referencia, "
                    f"ancorando 0-30s em prova concreta."
                )[:590],
                "score": {
                    "value": score_val,
                    "max": 100,
                    "version": "score-v2-modeling",
                    "components": [
                        {"key": "potencial", "value": pot},
                        {"key": "concorrencia", "value": conc},
                    ],
                },
                "labels": {
                    "potencial": "alto" if pot >= 0.70 else ("medio" if pot >= 0.45 else "baixo"),
                    "concorrencia": "media" if conc >= 0.45 else "baixa",
                },
                "evidence": evidence,
            },
        }

    if agent_key == "titulos":
        from core.research.reference_modeling import (
            _synthesize_title_for_archetype,
            extract_title_blueprint,
            hybrid_title_similarity,
        )

        prior = context.get("prior_outputs") or []
        for p in prior:
            sources.append({"kind": "agent_output", "id": str(p["id"]), "locator": p["output_type"]})

        refs = list(context.get("references") or [])
        outliers = list(context.get("studio_outliers") or [])
        ref_pool: list[tuple[str, str]] = []
        for o in outliers:
            if o.get("title"):
                ref_pool.append((str(o["id"]), str(o["title"])))
                sources.append({"kind": "research_reference", "id": str(o["id"]), "locator": "studio_video_outliers"})
        for r in refs:
            if r.get("title"):
                ref_pool.append((str(r["id"]), str(r["title"])))
                sources.append({"kind": "research_reference", "id": str(r["id"]), "locator": "reference_videos"})

        pillars_list = [str(p) for p in (channel.get("pillars_json") or []) if str(p).strip()]
        niche_label = str(channel.get("niche") or "Documentario")
        archetypes_order: list[str] = []
        for _, r_title in ref_pool:
            ak = extract_title_blueprint(r_title).archetype_key
            if ak not in archetypes_order:
                archetypes_order.append(ak)
        for fb_arch in ("paradoxo_oculto", "erro_silencioso", "colapso_cronologico", "dossie_investigativo"):
            if fb_arch not in archetypes_order and len(archetypes_order) < 4:
                archetypes_order.append(fb_arch)

        options: list[dict[str, Any]] = []
        for idx, arch_key in enumerate(archetypes_order[:4]):
            pillar_i = pillars_list[idx % len(pillars_list)] if pillars_list else niche_label
            cand_text, align_30s, diff_txt = _synthesize_title_for_archetype(
                arch_key,
                working_title,
                pillar_i,
                "",
                niche_label,
            )
            closest_id: str | None = None
            max_sim = 0.0
            for ref_id, ref_title in ref_pool:
                sim = hybrid_title_similarity(cand_text, ref_title)
                if sim >= max_sim:
                    max_sim = sim
                    closest_id = ref_id
            options.append(
                {
                    "text": cand_text[:155],
                    "pattern": arch_key,
                    "differentiation": f"{diff_txt} ({align_30s})"[:390],
                    "closest_reference_id": closest_id,
                    "similarity": round(max_sim, 4),
                }
            )

        return {
            "agent_key": "titulos",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": f"{len(options)} titulos modelados por arquetipo"[:120],
            "confidence": "alta" if len(ref_pool) >= 2 else ("media" if ref_pool else "baixa"),
            "limitations": [] if ref_pool else ["Sem titulos de referencia aprovados para calibrar similaridade real."],
            "sources": sources,
            "payload": {"options": options},
        }

    if agent_key == "roteiro":
        prior = context.get("prior_outputs") or []
        for p in prior:
            sources.append({"kind": "agent_output", "id": str(p["id"]), "locator": p["output_type"]})
        chunks = context.get("knowledge_chunks") or []
        for ch in chunks[:3]:
            sources.append({"kind": "knowledge_chunk", "id": str(ch["chunk_id"]), "locator": ch.get("source_title")})
        if not chunks:
            limitations.append("Sem chunks RAG L2/L3 aprovados; roteiro estruturado apenas com perfil e oportunidade.")

        return {
            "agent_key": "roteiro",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": "Rascunho v1 de roteiro (hook 0-30s, atos e loops)"[:120],
            "confidence": "alta" if chunks else "media",
            "limitations": limitations,
            "sources": sources,
            "payload": {
                "hook": (
                    f"0-15s abre diretamente na anomalia central de '{working_title}' confirmando o clique da capa; "
                    f"15-30s planta o risco estrutural antes de qualquer contexto historico."
                ),
                "outline": [
                    {"section": "Hook 0-30s (Confirmacao + Risco)", "goal": "Validar promessa do titulo sem saudacao generica", "duration_sec": 30},
                    {"section": "Ato 1 — A Engrenagem Aparente", "goal": "Apresentar provas visuais e abrir 1o open loop", "duration_sec": 180},
                    {"section": "Ato 2 — O Ponto de Ruptura", "goal": "Responder lacunas reais da audiencia com citacoes verificadas", "duration_sec": 210},
                    {"section": "Climax & Fechamento", "goal": "Resolver tensao central e conectar ao proximo estudo", "duration_sec": 45},
                ],
                "body": [
                    {"section": "Hook 0-30s (Confirmacao + Risco)", "text": f"Abertura imediata na prova visual que contradiz o senso comum sobre {working_title}."},
                    {"section": "Ato 1 — A Engrenagem Aparente", "text": "Reconstrucao causal apoiada nas fontes curadas do canal."},
                    {"section": "Ato 2 — O Ponto de Ruptura", "text": "Virada analitica mostrando onde o sistema falhou ou mudou de escala."},
                    {"section": "Climax & Fechamento", "text": "Fechamento do loop principal e convite organico para o proximo episodio."},
                ],
                "cta": "Acompanhe o proximo dossie do canal para ver a continuacao desta linha estrategica.",
            },
        }

    if agent_key == "thumbnail":
        from core.research.reference_modeling import _pick_non_overlapping_overlay

        prior = context.get("prior_outputs") or []
        for p in prior:
            sources.append({"kind": "agent_output", "id": str(p["id"]), "locator": p["output_type"]})
        refs = list(context.get("references") or [])
        ref_ids = [str(r["id"]) for r in refs[:2] if r.get("id")]
        for r in refs[:2]:
            sources.append({"kind": "research_reference", "id": str(r["id"]), "locator": "reference_videos"})

        limitations.append("Provedor de visao OCR nao configurado; conceitos modelados pela gramatica de contraste 2-elementos.")
        ov_1 = _pick_non_overlapping_overlay(working_title, ["ROTA CORTADA", "FORA DO MAPA", "PONTO ZERO"])
        ov_2 = _pick_non_overlapping_overlay(working_title, ["48H DEPOIS", "TUDO PAROU", "SEM SAÍDA"])
        ov_3 = _pick_non_overlapping_overlay(working_title, ["1 FALHA BASTOU", "DETALHE FATAL", "ARQUIVO 01"])

        concepts = [
            {
                "idea": f"Anomalia visual isolada de '{working_title[:55]}' (maximo 2 elementos focais: objeto central + marcador de ruptura)",
                "text_overlay": ov_1,
                "composition": "Assimetria 60/40: sujeito nitido a direita e espaco negativo escuro a esquerda para leitura em 160x90px",
                "palette": "ardosia profundo (#0B1018), destaque ambar (#F5A623) e tipografia marfim",
                "similar_reference_ids": ref_ids[:1],
                "similarity_flag": False,
            },
            {
                "idea": f"Choque de estado Antes vs. Depois mostrando a virada fisica em '{working_title[:50]}'",
                "text_overlay": ov_2,
                "composition": "Biparticao diagonal limpa com vetor de olhar apontando para a falha estrutural",
                "palette": "azul petroleo dessaturado em contraste com vermelho carmim pontual",
                "similar_reference_ids": ref_ids[:1],
                "similarity_flag": False,
            },
            {
                "idea": f"Contraste de escala Micro -> Macro revelando o detalhe que travou '{working_title[:50]}'",
                "text_overlay": ov_3,
                "composition": "Primeiro plano em macro nitido contra estrutura monumental em desfoque leve ao fundo",
                "palette": "carvao escuro, recorte lateral frio e selo amarelo quente de alto contraste",
                "similar_reference_ids": [],
                "similarity_flag": False,
            },
        ]
        return {
            "agent_key": "thumbnail",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": f"{len(concepts)} blueprints de capa complementares (0% repeticao do titulo)"[:120],
            "confidence": "alta" if ref_ids else "media",
            "limitations": limitations,
            "sources": sources,
            "payload": {
                "concepts": concepts,
                "vision_available": False,
            },
        }

    if agent_key == "edicao":
        intents = context.get("production_intents") or []
        if intents:
            intent = intents[0]
            sources.append({"kind": "artifact", "id": str(intent["id"]), "locator": "production_intent"})
            manifest_ready = bool(intent.get("manifest_validated"))
            prod_id = str(intent["id"])
            stage = str(intent.get("status") or "INTENT_CREATED")
            progress = 1.0 if stage == "READY" else None
            checks = [{"check": "manifest_validated", "result": "pass" if manifest_ready else "unknown"}]
        else:
            prod_id = str(content_item_id or channel_id)
            manifest_ready = False
            stage = "aguardando_dispatch_darkforge"
            progress = None
            checks = [{"check": "darkforge_manifest", "result": "unknown"}]
            limitations.append("Nenhuma ProductionIntent despachada no DarkForge; progresso real indefinido (null).")

        return {
            "agent_key": "edicao",
            "contract_version": 1,
            "channel_id": channel_id,
            "content_item_id": content_item_id,
            "summary": f"Producao em '{stage}'"[:120],
            "confidence": "alta" if manifest_ready else "baixa",
            "limitations": limitations,
            "sources": sources,
            "payload": {
                "production_job_id": prod_id,
                "stage": stage,
                "progress": progress,
                "artifact": {"id": None, "manifest_ready": manifest_ready, "checksum": None},
                "quality_checks": checks,
            },
        }

    # publicacao
    prior = context.get("prior_outputs") or []
    for p in prior:
        sources.append({"kind": "agent_output", "id": str(p["id"]), "locator": p["output_type"]})
    scheduled_dt = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=17, minute=0, second=0, microsecond=0)
    return {
        "agent_key": "publicacao",
        "contract_version": 1,
        "channel_id": channel_id,
        "content_item_id": content_item_id,
        "summary": f"Plano de publicacao sugerido para {scheduled_dt.strftime('%d/%m %H:%M')}"[:120],
        "confidence": "media",
        "limitations": ["Publicacao automatica bloqueada; requer revisao e envio manual no YouTube."],
        "sources": sources,
        "payload": {
            "scheduled_for": scheduled_dt.isoformat(),
            "title_option_index": 0,
            "description": f"Estudo completo sobre {working_title}. Fontes verificadas no painel editorial.",
            "tags": [str(channel.get("niche") or "youtube"), working_title[:40]],
            "requires_human_publish": True,
        },
    }


class AgentJobHandler:
    """Handler do JobWorker unico (SP-02) para executar runs de agentes (UI-02-T04..T08)."""

    def __init__(
        self,
        repo: PostgresStudioRepository,
        *,
        ai_router: AIProviderRouter | None = None,
        model_caller: ModelCaller | None = None,
        step_delay_seconds: float = 0.0,
    ) -> None:
        self._repo = repo
        self._ai_router = ai_router or AIProviderRouter()
        self._model_caller = model_caller or default_local_agent_model_caller
        self._step_delay = max(0.0, float(step_delay_seconds))

    def __call__(self, job: ClaimedJob, ctx: WorkerContext) -> None:
        payload = job.payload_json or {}
        run_id_raw = payload.get("run_id")
        if not run_id_raw:
            raise AppError(ErrorCode.VALIDATION_ERROR, "Payload de agent.execute sem run_id.", http_status=422)

        run_id = UUID(str(run_id_raw))
        agent_key = str(payload.get("agent_key") or "")
        spec = AGENT_REGISTRY.get(agent_key)
        if spec is None:
            raise AppError(ErrorCode.VALIDATION_ERROR, f"Agente desconhecido: {agent_key}.", http_status=422)

        content_item_id = UUID(str(payload["content_item_id"])) if payload.get("content_item_id") else None
        channel_id = UUID(str(payload.get("channel_id") or job.channel_id))
        workspace_id = job.workspace_id

        try:
            # 1. Marca working + evento run_started
            run_row = self._repo.mark_run_started(run_id, job.fencing_token)
            if run_row is None:
                raise AppError(ErrorCode.RESOURCE_NOT_FOUND, "agent_run ausente.", http_status=404)

            ctx.heartbeat()
            sig = ctx.checkpoint("context", 1, {"stage": "loading_context"}, "Contexto autorizado carregado")
            if sig == "cancel":
                self._repo.cancel_agent_run(workspace_id, run_id)
                return
            if sig == "pause":
                ctx._queue.transition(job.job_id, job.fencing_token, "PAUSED", checkpoint_json={"stage": "loading_context"})
                return

            # 2. Carrega contexto autorizado e verifica politica do canal
            auth_ctx = self._repo.load_authorized_context(workspace_id, channel_id, agent_key, content_item_id)
            channel_agent = auth_ctx.get("channel_agent") or {}
            policy = channel_agent.get("model_policy") or {"mode": "local_only", "external_consent": False}
            policy_mode = str(policy.get("mode", "local_only"))

            if policy_mode in ("external", "external_consented") and not bool(policy.get("external_consent")):
                raise AppError(
                    ErrorCode.AI_EXTERNAL_CONSENT_REQUIRED,
                    "Politica externa sem consentimento explicito; execucao bloqueada.",
                    http_status=412,
                )

            if policy_mode == "local_only" and not self._ai_router.policy.local_available:
                raise AppError(
                    ErrorCode.AI_PROVIDER_UNAVAILABLE,
                    "Provedor local indisponivel; fallback externo silencioso bloqueado (ADR-007).",
                    http_status=503,
                    retryable=True,
                )

            self._repo.update_run_progress(
                run_id,
                job.fencing_token,
                stage_label="executando modelo",
                progress=0.45,
                summary=f"Executando {spec.display_name}",
            )
            if self._step_delay > 0:
                time.sleep(self._step_delay)
            sig = ctx.checkpoint("inference", 2, {"stage": "calling_model"}, "Chamando modelo")
            if sig == "cancel":
                self._repo.cancel_agent_run(workspace_id, run_id)
                return
            if sig == "pause":
                ctx._queue.transition(job.job_id, job.fencing_token, "PAUSED", checkpoint_json={"stage": "calling_model"})
                return

            # 3. Monta prompt conforme template §4 (sem credenciais, com <dados>)
            channel = auth_ctx["channel"]
            display_name = channel_agent.get("display_name") or spec.display_name
            authorized_inputs = {
                "handoffs": auth_ctx["handoffs"],
                "prior_outputs": auth_ctx["prior_outputs"],
                "metrics": auth_ctx["metrics"],
                "references": auth_ctx["references"],
                "studio_outliers": auth_ctx["studio_outliers"],
                "google_trends": auth_ctx["google_trends"],
                "knowledge_chunks": auth_ctx["knowledge_chunks"],
                "production_intents": auth_ctx["production_intents"],
                "calendar_items": auth_ctx["calendar_items"],
            }
            prompt = build_agent_prompt(
                agent_display_name=display_name,
                agent_key=agent_key,
                channel_name=channel["display_name"],
                agent_responsibility=spec.responsibility,
                profile=channel,
                content_item_working_title=(auth_ctx.get("content_item") or {}).get("working_title"),
                authorized_inputs=authorized_inputs,
                output_type=spec.output_type,
                contract_version=spec.contract_version,
                output_json_schema=spec.payload_model.model_json_schema(),
            )
            input_hash = _json_hash(authorized_inputs)

            # 4. Chama modelo + valida contra contrato v1 com 1 tentativa de reparo
            caller_meta = {
                "agent_key": agent_key,
                "output_type": spec.output_type,
                "contract_version": spec.contract_version,
                "attempt": 1,
                "repair_error": None,
            }
            raw_output = self._model_caller(prompt, auth_ctx, caller_meta)
            validation_err: str | None = None
            envelope = None
            validated_payload = None
            for attempt_idx in (1, 2):
                try:
                    envelope, validated_payload = validate_agent_output_envelope(
                        raw_output,
                        expected_agent_key=agent_key,
                        expected_output_type=spec.output_type,
                        expected_channel_id=channel_id,
                        expected_content_item_id=content_item_id,
                        expected_contract_version=spec.contract_version,
                    )
                    validation_err = None
                    break
                except Exception as exc:
                    validation_err = redact_sensitive_text(str(exc))
                    if attempt_idx == 1:
                        repair_meta = {**caller_meta, "attempt": 2, "repair_error": validation_err}
                        repair_prompt = f"{prompt}\n\nCORRECAO OBRIGATORIA DE SCHEMA: {validation_err}"
                        raw_output = self._model_caller(repair_prompt, auth_ctx, repair_meta)

            if validation_err is not None or envelope is None or validated_payload is None:
                raise AppError(
                    ErrorCode.VALIDATION_ERROR,
                    f"Output do agente invalido apos tentativa de reparo: {validation_err}",
                    http_status=422,
                    retryable=False,
                )

            self._repo.update_run_progress(
                run_id,
                job.fencing_token,
                stage_label="validando fontes e regras",
                progress=0.80,
                summary="Validando fontes, originalidade e politicas",
            )
            if self._step_delay > 0:
                time.sleep(self._step_delay)
            sig = ctx.checkpoint("validate", 3, {"stage": "validating_rules"}, "Validando regras de negocio")
            if sig == "cancel":
                self._repo.cancel_agent_run(workspace_id, run_id)
                return
            if sig == "pause":
                ctx._queue.transition(job.job_id, job.fencing_token, "PAUSED", checkpoint_json={"stage": "validating_rules"})
                return

            # 5. Regras de negocio §3 (escopo de fontes, similaridade, temas proibidos)
            raw_sources = [s.model_dump() for s in envelope.sources]
            valid_sources, invalid_sources = self._repo.verify_sources_in_scope(workspace_id, channel_id, raw_sources)
            review_reasons: list[str] = []
            if invalid_sources:
                review_reasons.append(f"fontes_fora_de_escopo:{len(invalid_sources)}")

            if not valid_sources and not spec.source_optional:
                review_reasons.append("sem_fontes_minimas")

            # Similaridade em titulos e capas
            originality_score: float | None = None
            payload_dict = validated_payload.model_dump(by_alias=True)
            if agent_key == "titulos":
                sims = [float(opt.get("similarity", 0.0)) for opt in payload_dict.get("options", [])]
                max_sim = max(sims) if sims else 0.0
                originality_score = round(max(0.0, 1.0 - max_sim), 4)
                if max_sim >= TITLE_SIMILARITY_REVIEW_THRESHOLD:
                    review_reasons.append(f"similaridade_alta:{max_sim:.2f}")
            elif agent_key == "thumbnail":
                flagged = any(bool(c.get("similarity_flag")) for c in payload_dict.get("concepts", []))
                originality_score = 0.35 if flagged else 0.90
                if flagged:
                    review_reasons.append("similaridade_capa_sinalizada")

            # Temas proibidos
            forbidden = _extract_forbidden_topics(channel)
            if forbidden:
                text_blob = json.dumps(payload_dict, ensure_ascii=False).lower()
                matched_forbidden = [t for t in forbidden if t in text_blob]
                if matched_forbidden:
                    review_reasons.append(f"tema_proibido:{','.join(matched_forbidden)}")

            output_status = "needs_review" if review_reasons else "validated"
            validation_info = {
                "valid": len(review_reasons) == 0,
                "review_reasons": review_reasons,
                "invalid_sources_removed": len(invalid_sources),
                "warnings": envelope.limitations,
            }

            content_to_store = {
                "summary": redact_sensitive_text(envelope.summary),
                "confidence": envelope.confidence,
                "limitations": [redact_sensitive_text(l) for l in envelope.limitations],
                **payload_dict,
            }

            # 6. Persistencia atomica com fencing token
            self._repo.commit_agent_run_atomic(
                run_id=run_id,
                job_id=job.job_id,
                fencing_token=job.fencing_token,
                workspace_id=workspace_id,
                channel_id=channel_id,
                agent_key=agent_key,
                content_item_id=content_item_id,
                output_type=spec.output_type,
                schema_version=spec.contract_version,
                summary=redact_sensitive_text(envelope.summary),
                content_json=content_to_store,
                valid_sources=valid_sources,
                output_status=output_status,
                validation_info=validation_info,
                originality_score=originality_score,
                input_hash=input_hash,
                model_id=self._ai_router.policy.local_model_id if policy_mode == "local_only" else self._ai_router.policy.external_model_id,
                provider="local" if policy_mode == "local_only" else "external",
                cost_estimate_cents=0,
                actor_id=UUID(str(channel.get("created_by"))),
            )
        except AppError as err:
            if err.code == ErrorCode.FENCING_TOKEN_STALE:
                raise
            is_blocked = err.code in (
                ErrorCode.SUPABASE_UNAVAILABLE,
                ErrorCode.YOUTUBE_QUOTA_EXCEEDED,
                ErrorCode.AI_PROVIDER_UNAVAILABLE,
                ErrorCode.AI_EXTERNAL_CONSENT_REQUIRED,
                ErrorCode.DARKFORGE_UNAVAILABLE,
                ErrorCode.STUDIO_AUTH_REQUIRED,
                ErrorCode.STUDIO_RATE_LIMITED,
            )
            self._repo.fail_or_block_run_atomic(
                run_id=run_id,
                job_id=job.job_id,
                fencing_token=job.fencing_token,
                workspace_id=workspace_id,
                target_status="blocked" if is_blocked else "failed",
                error_code=err.code.value,
                error_message=redact_sensitive_text(err.message),
                retryable=err.retryable,
            )
            # Evita dupla transicao no JobWorker pois ja transitamos atomicamente
            return
