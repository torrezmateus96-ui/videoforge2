from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from uuid import UUID, uuid4

import httpx
import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from apps.api.config import Settings
from apps.api.main import create_app
from core.errors import AppError, ErrorCode
from core.research.channel_selector import (
    ReferenceChannelCandidate,
    TargetChannelFit,
    evaluate_reference_channel,
)
from core.research.reference_modeling import (
    ModelingChannelCandidate,
    ModelingTargetProfile,
    ReferenceOutlierSample,
    _content_tokens,
    build_complete_modeling_plan,
    compute_trimmed_median_baseline,
    default_modeling_candidate_presets,
    hybrid_title_similarity,
    score_reference_channel_for_modeling,
)
from core.studio.contracts import validate_agent_output_envelope
from core.studio.registry import AGENT_REGISTRY
from workers.agents.handler import default_local_agent_model_caller


def _preset_domain_candidates() -> list[ModelingChannelCandidate]:
    raw = default_modeling_candidate_presets()
    return [
        ModelingChannelCandidate(
            external_channel_id=c["external_channel_id"],
            display_name=c["display_name"],
            handle=c.get("handle", ""),
            language=c.get("language", "pt-BR"),
            market_country=c.get("market_country", "BR"),
            subscriber_count=int(c.get("subscriber_count") or 0),
            recent_views_sample=list(c.get("recent_views_sample", [])),
            recent_90d_views=list(c.get("recent_90d_views", [])),
            production_format=c.get("production_format", "faceless_essay"),
            niche_tags=list(c.get("niche_tags", [])),
            editorial_pillars=list(c.get("editorial_pillars", [])),
            is_celebrity_or_mega_brand=bool(c.get("is_celebrity_or_mega_brand", False)),
            relies_on_breaking_news=bool(c.get("relies_on_breaking_news", False)),
            outlier_samples=[ReferenceOutlierSample(**o) for o in c.get("outlier_samples", [])],
        )
        for c in raw
    ]


def test_trimmed_median_resists_mega_outlier_inflation_and_cohort_routing() -> None:
    """
    1) Verifica que a mediana aparada nao deixa 2 mega-outliers destruirem a linha de base.
    2) Verifica que canais eficientes sao separados em Pares Diretos (3 eixos) vs Adjacentes (Titulos+Thumbs),
       enquanto Mega-Canal de TV por fama e Canal de 1 Hit Isolado sao descartados.
    """
    views_with_spikes = [
        6_000, 6_400, 5_900, 6_800, 7_100, 6_300, 6_500, 6_200, 7_000, 6_700,
        42_000, 380_000, 610_000,
    ]
    trimmed_base, raw_mean = compute_trimmed_median_baseline(views_with_spikes)
    # A media bruta (~84k) esconderia o outlier legitimo de 42k (6.4x a base real de ~6.5k)!
    assert raw_mean > 80_000
    assert 6_000 <= trimmed_base <= 10_500
    assert (42_000 / trimmed_base) >= 4.0

    target = ModelingTargetProfile(
        channel_name="Atlas Sombrio",
        niche="Documentario Historico & Geopolitica",
        editorial_theme="Rotas estrategicas, tratados e fronteiras invisiveis",
        pillars=["Cartografia historica", "Geopolitica classica", "Economia maritima"],
        language="pt-BR",
        market_country="BR",
        feasible_formats=["faceless_essay", "long_documentary"],
        audience_tags=["historia", "geopolitica", "mapas"],
        forbidden_topics=["fofoca de celebridades", "apostas ilegais"],
        min_outlier_ratio=3.0,
    )

    plan = build_complete_modeling_plan(
        candidates=_preset_domain_candidates(),
        target=target,
        focus_topic="O Estreito de Ormuz e o Gargalo Energetico Global",
        custom_angle="Como 33 km de rota naval ditam o seguro maritimo mundial",
    )

    assert plan["cohort_summary"]["evaluated_count"] == 5
    assert plan["cohort_summary"]["approved_count"] == 3
    assert plan["cohort_summary"]["rejected_count"] == 2
    assert plan["cohort_summary"]["cohort_health"] == "forte"

    approved_by_id = {c["external_channel_id"]: c for c in plan["approved_channels"]}
    rejected_by_id = {c["external_channel_id"]: c for c in plan["rejected_channels"]}

    assert "UC_PEER_CARTOGRAFIA" in approved_by_id
    assert approved_by_id["UC_PEER_CARTOGRAFIA"]["recommended_axes"] == ["temas", "titulos", "thumbnails"]
    assert "UC_CATALYST_ARQUIVO" in approved_by_id
    assert approved_by_id["UC_CATALYST_ARQUIVO"]["recommended_axes"] == ["temas", "titulos", "thumbnails"]

    # Subnicho adjacente (Engenharia/Infraestrutura) modela apenas Embalagem (Titulos + Thumbnails), sem copiar tema literal!
    assert "UC_ADJACENT_ENGENHARIA" in approved_by_id
    assert approved_by_id["UC_ADJACENT_ENGENHARIA"]["recommended_axes"] == ["titulos", "thumbnails"]
    assert approved_by_id["UC_ADJACENT_ENGENHARIA"]["cohort_tier"] == "benchmark_embalagem_adjacente"

    # Descartados corretamente: TV gigante por inercia/fama e canal de 1 hit isolado
    assert len(rejected_by_id) == 2
    tiers_rejected = {c["cohort_tier"] for c in rejected_by_id.values()}
    assert "descartado_armadilha_autoridade" in tiers_rejected
    assert "descartado_hit_isolado" in tiers_rejected

    # Verifica os 3 eixos de modelagem gerados
    assert len(plan["modeled_themes"]) == 3
    assert len(plan["modeled_titles"]) == 5
    assert len(plan["modeled_thumbnails"]) == 4

    distinct_archetypes = {t["archetype_key"] for t in plan["modeled_titles"]}
    assert len(distinct_archetypes) >= 4
    for t in plan["modeled_titles"]:
        assert t["max_similarity"] < 0.70
        assert t["originality_passed"] is True

    for th in plan["modeled_thumbnails"]:
        assert 1 <= th["overlay_word_count"] <= 3
        assert th["overlay_repeats_title"] is False
        paired_tokens = set(_content_tokens(th["paired_title"], min_len=3))
        overlay_tokens = set(_content_tokens(th["overlay_text"], min_len=3))
        assert not (paired_tokens & overlay_tokens), f"Overlay repetiu palavra do titulo: {th}"


def test_studio_agents_contracts_and_sp19_lazy_giant_guard() -> None:
    """
    Garante que os agentes do Estudio 2.5D (pesquisa, estrategia, titulos, roteiro, thumbnail)
    produzem envelopes 100% aderentes aos contratos Pydantic estritos (extra='forbid') usando a nova modelagem,
    e que o seletor SP-19 bloqueia mega-canais preguicosos (< 3% views/subs).
    """
    lazy_giant = ReferenceChannelCandidate(
        external_channel_id="UC_LAZY_MEGA_1800K",
        display_name="Portal Gigante Inerte",
        language="pt-BR",
        market_country="BR",
        subscriber_count=1_800_000,
        recent_video_views_90d=[22_000, 25_000, 31_000],
        all_recent_20_30_views=[18_000] * 18 + [24_000, 39_000],
        production_format="faceless_essay",
        audience_profile_tags=["historia", "curiosidades"],
        is_celebrity_or_mega_brand=False,
    )
    fit = TargetChannelFit(
        language="pt-BR",
        market_country="BR",
        feasible_formats=["faceless_essay"],
        target_audience_tags=["historia"],
        min_outlier_ratio=3.0,
    )
    eval_lazy = evaluate_reference_channel(lazy_giant, fit)
    assert eval_lazy.approved is False
    assert "fame_independence" in eval_lazy.failed_criteria

    channel_id = str(uuid4())
    content_item_id = str(uuid4())
    ref_a = str(uuid4())
    ref_b = str(uuid4())
    out_a = str(uuid4())
    ctx = {
        "channel": {
            "id": channel_id,
            "display_name": "Atlas Sombrio",
            "niche": "Geopolitica e Cartografia",
            "editorial_theme": "Fronteiras estrategicas e comercio maritimo",
            "pillars_json": ["Cartografia historica", "Geopolitica naval"],
            "profile_version_id": str(uuid4()),
            "version_number": 2,
        },
        "content_item": {
            "id": content_item_id,
            "working_title": "O Canal de Suez e o Bloqueio de Seis Dias",
        },
        "references": [
            {
                "id": ref_a,
                "title": "Video aleatorio sobre culinaria medieval",
                "canonical_url": "https://youtube.com/watch?v=aaa111",
                "curation_status": "pending",
                "public_views": 90_000,
            },
            {
                "id": ref_b,
                "title": "Por Que Esta Fronteira Naval da Cartografia Travou o Comercio?",
                "canonical_url": "https://youtube.com/watch?v=bbb222",
                "curation_status": "approved",
                "public_views": 145_000,
            },
        ],
        "studio_outliers": [
            {
                "id": out_a,
                "title": "O Erro Silencioso no Tratado Maritimo do Atlântico",
                "canonical_url": "https://youtube.com/watch?v=ccc333",
                "outlier_ratio": 7.4,
                "watched_by_my_viewers": True,
            }
        ],
        "google_trends": [{"id": str(uuid4())}],
        "prior_outputs": [],
        "knowledge_chunks": [],
        "metrics": [],
    }

    for agent_key in ("pesquisa", "estrategia", "titulos", "roteiro", "thumbnail"):
        spec = AGENT_REGISTRY[agent_key]
        raw_out = default_local_agent_model_caller(
            prompt="teste deterministico",
            context=ctx,
            meta={"agent_key": agent_key, "output_type": spec.output_type, "contract_version": spec.contract_version},
        )
        env, payload = validate_agent_output_envelope(
            raw_out,
            expected_agent_key=agent_key,
            expected_output_type=spec.output_type,
            expected_channel_id=UUID(channel_id),
            expected_content_item_id=UUID(content_item_id),
            expected_contract_version=spec.contract_version,
        )
        assert env.agent_key == agent_key
        if agent_key == "pesquisa":
            # A referencia aprovada com intersecao de pilares (ref_b) deve vir ANTES da referencia sem intersecao (ref_a)!
            cand_ids = [str(c.reference_id) for c in payload.candidates]
            assert cand_ids.index(ref_b) < cand_ids.index(ref_a)
        elif agent_key == "titulos":
            patterns = [opt.pattern for opt in payload.options]
            assert len(set(patterns)) == len(patterns)
            assert all(opt.similarity < 0.70 for opt in payload.options)
        elif agent_key == "thumbnail":
            w_tokens = set(_content_tokens(ctx["content_item"]["working_title"], min_len=3))
            for concept in payload.concepts:
                ov_tokens = set(_content_tokens(concept.text_overlay, min_len=3))
                assert not (w_tokens & ov_tokens)


def test_security_http_csrf_rbac_and_forbidden_topics() -> None:
    """
    Valida seguranca nas rotas HTTP /api/v1/research/modeling/*:
    CSRF Origin, JWT obrigatorio, isolamento cross-tenant, RBAC VIEWER vs EDITOR e bloqueio de topicos proibidos.
    """
    secret = "modeling-jwt-secret-minimum-32-bytes-ok!!"
    settings = Settings(
        next_public_supabase_url="https://modeling.supabase.co",
        next_public_supabase_publishable_key="sb_pub_modeling",
        supabase_jwt_secret=secret,
        web_origin="http://127.0.0.1:3000",
    )
    app = create_app(settings=settings)
    ws_editor = uuid4()
    ws_viewer = uuid4()
    ws_foreign = uuid4()
    user_uid = uuid4()

    def _mock_rest(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "workspace_members" in url:
            if f"eq.{ws_editor}" in url:
                return httpx.Response(
                    200,
                    json=[{"id": str(uuid4()), "workspace_id": str(ws_editor), "user_id": str(user_uid), "role": "editor"}],
                )
            if f"eq.{ws_viewer}" in url:
                return httpx.Response(
                    200,
                    json=[{"id": str(uuid4()), "workspace_id": str(ws_viewer), "user_id": str(user_uid), "role": "viewer"}],
                )
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[])

    app.state.container.supabase_client._transport = httpx.MockTransport(_mock_rest)
    token = pyjwt.encode({"sub": str(user_uid), "aud": "authenticated"}, secret, algorithm="HS256")

    with TestClient(app) as tc:
        # 1. Sem JWT -> 401
        r_unauth = tc.get("/api/v1/research/modeling/presets", headers={"X-Workspace-Id": str(ws_editor)})
        assert r_unauth.status_code == 401

        # 2. CSRF Origin malicioso -> 403
        r_csrf = tc.post(
            "/api/v1/research/modeling/playbook",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Workspace-Id": str(ws_editor),
                "Origin": "https://evil-phishing.example",
            },
            json={"focus_topic": "Rotas do Artico"},
        )
        assert r_csrf.status_code == 403

        # 3. Cross-tenant -> 403 WORKSPACE_FORBIDDEN
        r_foreign = tc.get(
            "/api/v1/research/modeling/presets",
            headers={"Authorization": f"Bearer {token}", "X-Workspace-Id": str(ws_foreign)},
        )
        assert r_foreign.status_code == 403
        assert r_foreign.json()["code"] == "WORKSPACE_FORBIDDEN"

        # 4. VIEWER pode ler presets (200), mas NAO pode disparar geracao de playbook (403)
        r_viewer_get = tc.get(
            "/api/v1/research/modeling/presets",
            headers={"Authorization": f"Bearer {token}", "X-Workspace-Id": str(ws_viewer)},
        )
        assert r_viewer_get.status_code == 200
        assert len(r_viewer_get.json()["candidates"]) == 5

        r_viewer_post = tc.post(
            "/api/v1/research/modeling/playbook",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Workspace-Id": str(ws_viewer),
                "Origin": "http://127.0.0.1:3000",
            },
            json={"focus_topic": "Rotas do Artico"},
        )
        assert r_viewer_post.status_code == 403

        # 5. Topico proibido na requisicao -> 422 VALIDATION_ERROR
        r_forbidden = tc.post(
            "/api/v1/research/modeling/playbook",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Workspace-Id": str(ws_editor),
                "Origin": "http://127.0.0.1:3000",
            },
            json={
                "focus_topic": "Segredos de cassino online na geopolitica",
                "forbidden_topics": ["cassino online"],
            },
        )
        assert r_forbidden.status_code == 422
        assert r_forbidden.json()["code"] == "VALIDATION_ERROR"

        # 6. Execucao autorizada -> 200 com playbook completo
        r_ok = tc.post(
            "/api/v1/research/modeling/playbook",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Workspace-Id": str(ws_editor),
                "Origin": "http://127.0.0.1:3000",
            },
            json={
                "channel_name": "Atlas Sombrio",
                "niche": "Geopolitica & Historia",
                "pillars": ["Cartografia historica", "Economia maritima"],
                "focus_topic": "A Ferrovia Transiberiana e o Calculo Imperial",
            },
        )
        assert r_ok.status_code == 200
        pb = r_ok.json()["playbook"]
        assert pb["cohort_summary"]["approved_count"] == 3
        assert len(pb["modeled_titles"]) == 5


def test_stress_400_concurrent_modeling_runs_and_chaos_edge_cases() -> None:
    """
    Estresse: 400 execucoes concorrentes de build_complete_modeling_plan em 16 threads (< 4.0s).
    Caos: inscritos=0, listas de views vazias, negativos, spikes de 50M e deteccao de parafrase proxima.
    """
    candidates = _preset_domain_candidates()
    target = ModelingTargetProfile(
        channel_name="Canal Stress",
        niche="Historia e Geopolitica",
        pillars=["Cartografia", "Rotas maritimas"],
    )
    topics = [
        "O Canal do Panama e a Engenharia Impossivel",
        "O Tratado de Tordesilhas e o Meridiano Errado",
        "A Rota da Seda Maritima no Seculo XXI",
        "O Cabo da Boa Esperanca e o Seguro Naval",
    ]

    t0 = time.perf_counter()

    def _run_one(idx: int) -> int:
        res = build_complete_modeling_plan(
            candidates=candidates,
            target=target,
            focus_topic=f"{topics[idx % len(topics)]} #{idx}",
        )
        return len(res["modeled_titles"]) + len(res["modeled_thumbnails"])

    with ThreadPoolExecutor(max_workers=16) as pool:
        futs = [pool.submit(_run_one, i) for i in range(400)]
        totals = [f.result() for f in as_completed(futs)]

    elapsed = time.perf_counter() - t0
    assert len(totals) == 400
    assert all(v == 9 for v in totals)
    assert elapsed < 4.0, f"400 execucoes concorrentes excederam orcamento: {elapsed:.2f}s"

    # Caos: inscritos = 0, views vazias ou negativas, spike extremo de 50M
    chaos_cand = ModelingChannelCandidate(
        external_channel_id="UC_CHAOS_ZERO",
        display_name="Canal Zero Dados",
        subscriber_count=0,
        recent_views_sample=[],
        recent_90d_views=[],
        production_format="unknown_alien_format",
    )
    sc_zero = score_reference_channel_for_modeling(chaos_cand, target)
    assert sc_zero.approved is False
    assert sc_zero.trimmed_median_views == 0.0

    base_neg, mean_neg = compute_trimmed_median_baseline([-500, 0, 0, 50_000_000])
    assert base_neg >= 0.0
    assert mean_neg >= 0.0

    # Caos: deteccao de parafrase cosmetica / copia quase literal
    sim_near_copy = hybrid_title_similarity(
        "Por Que Este Estreito de 33 km Travou Tres Imperios?",
        "Por que esse estreito de 33 km travou tres imperios no mundo?",
    )
    assert sim_near_copy >= 0.70

    with pytest.raises(AppError) as exc_empty:
        build_complete_modeling_plan(candidates=candidates, target=target, focus_topic=" ")
    assert exc_empty.value.code == ErrorCode.VALIDATION_ERROR
