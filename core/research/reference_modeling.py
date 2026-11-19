from __future__ import annotations

import re
import statistics
from dataclasses import asdict, dataclass, field
from typing import Any

from core.errors import AppError, ErrorCode
from core.generation.title_thumbnail import FORBIDDEN_UNVERIFIED_PROMISES

_STOPWORDS_PT_EN = frozenset(
    {
        "de",
        "da",
        "do",
        "das",
        "dos",
        "em",
        "no",
        "na",
        "nos",
        "nas",
        "um",
        "uma",
        "uns",
        "umas",
        "por",
        "para",
        "com",
        "sem",
        "sob",
        "sobre",
        "que",
        "como",
        "qual",
        "quais",
        "quando",
        "onde",
        "isso",
        "isto",
        "esse",
        "essa",
        "este",
        "esta",
        "mais",
        "menos",
        "muito",
        "muita",
        "tudo",
        "todos",
        "todas",
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "into",
        "over",
        "why",
        "how",
    }
)

_COMPATIBLE_FORMAT_GROUPS: dict[str, frozenset[str]] = {
    "documentary_faceless": frozenset(
        {
            "faceless_essay",
            "long_documentary",
            "documentary",
            "map_investigation",
            "archive_narrative",
            "visual_essay",
            "investigative_doc",
            "long",
        }
    ),
    "educational_screen": frozenset(
        {
            "screen_breakdown",
            "case_study",
            "whiteboard_essay",
            "faceless_essay",
            "long",
        }
    ),
    "short_vertical": frozenset({"short", "shorts_narrative", "vertical_doc"}),
}

_INCOMPATIBLE_HIGH_FAME_FORMATS = frozenset(
    {
        "celebrity_vlog",
        "reality_tv_cut",
        "daily_gossip_live",
        "tv_broadcast_clip",
        "multi_cam_celebrity_podcast",
    }
)


@dataclass(frozen=True)
class ReferenceOutlierSample:
    title: str
    views: int
    days_since_upload: int = 30
    thumbnail_cue: str = ""
    thumbnail_overlay: str = ""
    topic_tag: str = ""
    unanswered_comment: str = ""


@dataclass(frozen=True)
class ModelingChannelCandidate:
    external_channel_id: str
    display_name: str
    language: str = "pt-BR"
    market_country: str = "BR"
    subscriber_count: int = 25_000
    recent_views_sample: list[int] = field(default_factory=list)
    recent_90d_views: list[int] = field(default_factory=list)
    production_format: str = "faceless_essay"
    niche_tags: list[str] = field(default_factory=list)
    editorial_pillars: list[str] = field(default_factory=list)
    is_celebrity_or_mega_brand: bool = False
    relies_on_breaking_news: bool = False
    outlier_samples: list[ReferenceOutlierSample] = field(default_factory=list)
    handle: str = ""


@dataclass(frozen=True)
class ModelingTargetProfile:
    channel_name: str
    niche: str
    editorial_theme: str = ""
    pillars: list[str] = field(default_factory=list)
    language: str = "pt-BR"
    market_country: str = "BR"
    feasible_formats: list[str] = field(default_factory=lambda: ["faceless_essay", "long_documentary"])
    audience_tags: list[str] = field(default_factory=list)
    forbidden_topics: list[str] = field(default_factory=list)
    min_outlier_ratio: float = 3.0


@dataclass(frozen=True)
class ChannelModelingScorecard:
    external_channel_id: str
    display_name: str
    handle: str
    approved: bool
    cohort_tier: str
    cohort_label: str
    modeling_fitness_score: float
    trimmed_median_views: float
    raw_mean_views: float
    subscriber_count: int
    views_to_sub_median_ratio: float
    peak_outlier_to_sub_ratio: float
    repeatable_outliers_count: int
    max_outlier_ratio: float
    velocity_views_per_day: float
    recommended_axes: list[str]
    dimension_scores: dict[str, float]
    strengths: list[str]
    rejection_reasons: list[str]


@dataclass(frozen=True)
class TitleBlueprint:
    archetype_key: str
    archetype_label: str
    syntactic_formula: str
    emotional_trigger: str
    curiosity_mechanic: str
    source_title: str


@dataclass(frozen=True)
class ModeledThemeProposal:
    theme_id: str
    theme_headline: str
    core_tension: str
    untapped_sub_angle: str
    psychographic_trigger: str
    target_pillar: str
    inspired_by_channels: list[str]
    cross_channel_support: int
    differentiation_guardrail: str


@dataclass(frozen=True)
class ModeledTitleProposal:
    option_index: int
    title: str
    char_count: int
    mobile_fit: bool
    archetype_key: str
    archetype_label: str
    syntactic_formula: str
    inspired_by_reference: str
    max_similarity: float
    originality_passed: bool
    promise_0_30s_alignment: str
    differentiation_note: str


@dataclass(frozen=True)
class ModeledThumbnailProposal:
    concept_index: int
    paired_title: str
    concept_label: str
    focal_subject: str
    visual_conflict: str
    overlay_text: str
    overlay_word_count: int
    overlay_repeats_title: bool
    composition_grid: str
    color_polarity: str
    inspired_by_reference: str


def _content_tokens(text: str, min_len: int = 3) -> list[str]:
    raw = re.findall(r"[a-z0-9áàâãéêíóôõúç]+", text.lower())
    return [t for t in raw if len(t) >= min_len and t not in _STOPWORDS_PT_EN]


def _char_trigrams(text: str) -> set[str]:
    norm = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9áàâãéêíóôõúç ]+", " ", text.lower())).strip()
    if len(norm) < 3:
        return {norm} if norm else set()
    return {norm[i : i + 3] for i in range(len(norm) - 2)}


def hybrid_title_similarity(candidate: str, reference: str) -> float:
    """
    Combina Jaccard de palavras-chave de conteudo (55%) + Jaccard de trigramas de caracteres (45%)
    para detectar tanto copia literal quanto parafrase cosmetica de titulos concorrentes.
    """
    ca_toks = set(_content_tokens(candidate, min_len=2))
    rb_toks = set(_content_tokens(reference, min_len=2))
    if not ca_toks or not rb_toks:
        return 0.0
    word_jaccard = len(ca_toks & rb_toks) / max(1, len(ca_toks | rb_toks))

    ca_tri = _char_trigrams(candidate)
    rb_tri = _char_trigrams(reference)
    tri_jaccard = len(ca_tri & rb_tri) / max(1, len(ca_tri | rb_tri)) if (ca_tri and rb_tri) else 0.0

    combined = (0.55 * word_jaccard) + (0.45 * tri_jaccard)
    # Preserva piso de Jaccard literal caso todos os tokens coincidam
    return round(max(combined, word_jaccard * 0.92), 4)


def compute_trimmed_median_baseline(views: list[int]) -> tuple[float, float]:
    """
    Retorna (trimmed_median_baseline, raw_mean).
    Remove o topo de outliers extremos (22% superiores, min 2 quando amostra >= 8) e aplica Winsorization
    em 3x a mediana para impedir que 2 ou 3 mega-hits inflamem a base e escondam outliers legitimos de 4x-6x.
    """
    cleaned = sorted(max(0, int(v)) for v in views if isinstance(v, (int, float)))
    if not cleaned:
        return 0.0, 0.0
    raw_mean = sum(cleaned) / len(cleaned)
    if len(cleaned) >= 8:
        trim_top = max(2, round(len(cleaned) * 0.22))
        core_slice = cleaned[: max(1, len(cleaned) - trim_top)]
    else:
        core_slice = cleaned
    med = float(statistics.median(core_slice))
    cap = med * 3.0 if med > 0 else raw_mean
    winsorized = [min(float(v), cap) for v in core_slice]
    trimmed_mean = sum(winsorized) / len(winsorized)
    baseline = (0.75 * med) + (0.25 * trimmed_mean)
    return round(max(1.0, baseline), 2) if raw_mean > 0 else 0.0, round(raw_mean, 2)


def _are_formats_compatible(candidate_format: str, target_formats: list[str]) -> tuple[bool, bool]:
    """Retorna (exact_match, group_compatible)."""
    cf = candidate_format.strip().lower()
    if cf in _INCOMPATIBLE_HIGH_FAME_FORMATS:
        return False, False
    tf_set = {f.strip().lower() for f in target_formats if f.strip()}
    if cf in tf_set:
        return True, True
    for group_members in _COMPATIBLE_FORMAT_GROUPS.values():
        if cf in group_members and (tf_set & group_members):
            return False, True
    return False, False


def extract_title_blueprint(title: str) -> TitleBlueprint:
    """Classifica um titulo outlier em um dos 6 arquetipos cognitivos transferiveis."""
    clean = title.strip()
    low = clean.lower()

    if re.search(r"\b(erro|falha|armadilha|ignorado|silencios[oa]|ninguem viu|esquecid[oa])\b", low):
        return TitleBlueprint(
            archetype_key="erro_silencioso",
            archetype_label="Anomalia ou Erro Silencioso",
            syntactic_formula="[Sistema/Entidade] + [Falha Invisivel] + [Efeito Irreversivel]",
            emotional_trigger="alerta_analitico",
            curiosity_mechanic="Revela o ponto exato onde uma estrutura aparentemente solida falhou.",
            source_title=clean,
        )
    if re.search(r"\b(colapso|sumiu|desapareceu|noite|horas|queda|fim|ruina)\b", low):
        return TitleBlueprint(
            archetype_key="colapso_cronologico",
            archetype_label="Ruptura Cronológica de Alto Risco",
            syntactic_formula="[Marco Temporal Curto] + [Evento de Ruptura] + [Causa Oculta]",
            emotional_trigger="urgencia_documental",
            curiosity_mechanic="Comprime uma transformacao drastica em uma janela de tempo concreta.",
            source_title=clean,
        )
    if re.search(r"\b(por que|why|paradoxo|impossivel|contra|apesar|nunca)\b", low) or "?" in clean:
        return TitleBlueprint(
            archetype_key="paradoxo_oculto",
            archetype_label="Paradoxo Contra-Intuitivo",
            syntactic_formula="[Crenca Comum Quebrada] + [Restricao Real] + [Pergunta Implicita]",
            emotional_trigger="curiosidade_epistemica",
            curiosity_mechanic="Confronta o senso comum da audiencia com uma restricao fisica, economica ou historica.",
            source_title=clean,
        )
    if re.search(r"\b\d+[.,]?\d*\b", low) or re.search(r"\b(bilhoes|milhoes|escala|unico|maior|menor)\b", low):
        return TitleBlueprint(
            archetype_key="escala_assimetrica",
            archetype_label="Contraste de Escala Assimétrica",
            syntactic_formula="[Detalhe Minimo / Ancora Numerica] -> [Impacto Macroproporcional]",
            emotional_trigger="espanto_proporcional",
            curiosity_mechanic="Contrasta uma causa especifica e mensuravel com uma consequencia gigantesca.",
            source_title=clean,
        )
    if re.search(r"\b(arquivo|mapa|dossie|documento|rota|plano|tratado|codigo)\b", low):
        return TitleBlueprint(
            archetype_key="dossie_investigativo",
            archetype_label="Dossiê de Prova Primária",
            syntactic_formula="[Evidencia Concreta] + [O Que Ela Escondia] + [Mudanca de Cenario]",
            emotional_trigger="investigacao_forense",
            curiosity_mechanic="Ancora a promessa em um artefato tangivel (mapa, registro, tratado, engenharia).",
            source_title=clean,
        )
    return TitleBlueprint(
        archetype_key="causa_sistemica",
        archetype_label="Engrenagem Sistêmica Oculta",
        syntactic_formula="[Fenomeno Conhecido] + [Mecanismo Real Por Tras] + [Consequencia Duradoura]",
        emotional_trigger="clareza_estrategica",
        curiosity_mechanic="Substitui explicacoes superficiais pela engrenagem estrutural que move o tema.",
        source_title=clean,
    )


def score_reference_channel_for_modeling(
    candidate: ModelingChannelCandidate,
    target: ModelingTargetProfile,
) -> ChannelModelingScorecard:
    """
    Avalia um canal candidato em 6 dimensoes (0-100) para decidir:
    1) Se deve entrar na coorte de referencia ou ser descartado (ex.: armadilha de autoridade / hit isolado).
    2) Qual o papel exato do canal na modelagem: Temas + Titulos + Thumbs vs apenas Embalagem (Titulos + Thumbs).
    """
    strengths: list[str] = []
    rejections: list[str] = []

    sample_views = list(candidate.recent_views_sample)
    if candidate.outlier_samples:
        for osmp in candidate.outlier_samples:
            if osmp.views not in sample_views:
                sample_views.append(osmp.views)

    baseline, raw_mean = compute_trimmed_median_baseline(sample_views)
    subs = max(1, int(candidate.subscriber_count or 1))
    min_mult = max(1.8, float(target.min_outlier_ratio))

    outlier_floor = max(1_000.0, baseline * min_mult)
    outlier_hits = [v for v in sample_views if baseline > 0 and v >= outlier_floor]
    peak_views = max(sample_views, default=0)
    max_ratio = round(peak_views / baseline, 2) if baseline > 0 else 0.0

    views_to_sub_median = round(baseline / subs, 4) if baseline > 0 else 0.0
    peak_to_sub_ratio = round(peak_views / subs, 4) if peak_views > 0 else 0.0

    # Velocidade recente (views/dia) dos outliers
    velocities: list[float] = []
    for osmp in candidate.outlier_samples:
        if osmp.views >= outlier_floor:
            velocities.append(osmp.views / max(1, osmp.days_since_upload))
    if not velocities and candidate.recent_90d_views:
        velocities.append(max(candidate.recent_90d_views) / 30.0)
    top_velocity = round(max(velocities, default=0.0), 1)

    # 1. Eficiencia de Packaging sobre Inscritos (0..25)
    # Canais que fazem 2x-10x o numero de inscritos nos outliers provam poder puro de Titulo+Thumb+Tema!
    eff_score = 0.0
    if peak_to_sub_ratio >= 2.0:
        eff_score += 17.0
        strengths.append(
            f"Outliers furam a bolha de inscritos ({peak_to_sub_ratio:.1f}x os inscritos no pico) — sinal puro de Titulo + Thumb."
        )
    elif peak_to_sub_ratio >= 0.75:
        eff_score += 12.5
        strengths.append(f"Boa conversao fora da base inscrita ({peak_to_sub_ratio:.2f}x inscritos no pico).")
    elif peak_to_sub_ratio >= 0.25:
        eff_score += 7.0
    else:
        eff_score += 2.0

    if 0.04 <= views_to_sub_median <= 1.5:
        eff_score += 8.0
    elif views_to_sub_median > 1.5:
        eff_score += 8.0
    elif subs >= 500_000 and views_to_sub_median < 0.03:
        rejections.append("Baixa eficiencia views/inscritos (< 3%): canal gigante sustentado por inercia antiga.")

    # 2. Repetibilidade Real de Outliers sobre Mediana Limpa (0..25)
    rep_score = 0.0
    recent_90 = [v for v in candidate.recent_90d_views if v >= max(1_000.0, baseline * 1.35)]
    if not recent_90 and any(o.days_since_upload <= 90 and o.views >= outlier_floor for o in candidate.outlier_samples):
        recent_90 = [o.views for o in candidate.outlier_samples if o.days_since_upload <= 90]

    if len(outlier_hits) >= 3:
        rep_score += 16.0
        strengths.append(f"{len(outlier_hits)} outliers reprodutiveis acima de {min_mult:.1f}x da mediana limpa ({max_ratio:.1f}x max).")
    elif len(outlier_hits) == 2:
        rep_score += 12.5
        strengths.append(f"Padrao repetido ({len(outlier_hits)} outliers >= {min_mult:.1f}x; pico {max_ratio:.1f}x).")
    elif len(outlier_hits) == 1:
        rep_score += 4.0
        rejections.append("Apenas 1 outlier isolado (risco de sorte unica sem padrao replicavel).")
    else:
        rejections.append(f"Nenhum outlier claro >= {min_mult:.1f}x sobre a mediana limpa.")

    if recent_90:
        rep_score += 9.0
    else:
        rejections.append("Sem tracao comprovada na janela recente de 90 dias.")

    # 3. Paridade de Formato & Viabilidade de Producao (0..15)
    exact_fmt, compat_fmt = _are_formats_compatible(candidate.production_format, target.feasible_formats)
    if exact_fmt:
        fmt_score = 15.0
        strengths.append(f"Formato 100% compativel com sua operacao ({candidate.production_format}).")
    elif compat_fmt:
        fmt_score = 11.5
        strengths.append(f"Formato adaptavel com baixo atrito ({candidate.production_format}).")
    else:
        fmt_score = 2.0
        rejections.append(f"Formato de producao inviavel ou incompativel ({candidate.production_format}).")

    # 4. Aderencia Tematica, Idioma & Psicografia da Audiencia (0..15)
    lang_match = candidate.language.split("-")[0].lower() == target.language.split("-")[0].lower()
    target_lex = set(
        _content_tokens(
            " ".join([target.niche, target.editorial_theme] + list(target.pillars) + list(target.audience_tags))
        )
    )
    cand_lex = set(
        _content_tokens(
            " ".join(
                list(candidate.niche_tags)
                + list(candidate.editorial_pillars)
                + [o.title for o in candidate.outlier_samples]
                + [o.topic_tag for o in candidate.outlier_samples]
            )
        )
    )
    overlap_terms = sorted(target_lex & cand_lex)
    overlap_ratio = len(overlap_terms) / max(1, min(len(target_lex), 8)) if target_lex else 0.0

    them_score = 0.0
    if lang_match:
        them_score += 5.0
    else:
        # Canal gringo do mesmo formato ainda pode servir de benchmark de embalagem se tiver overlap forte!
        them_score += 2.5

    if overlap_ratio >= 0.35:
        them_score += 10.0
        strengths.append(f"Forte aderencia editorial nos pilares ({', '.join(overlap_terms[:4])}).")
    elif overlap_ratio >= 0.12:
        them_score += 6.5
        strengths.append(f"Subnicho adjacente util para modelar estrutura ({', '.join(overlap_terms[:3])}).")
    else:
        them_score += 2.0
        if not lang_match:
            rejections.append("Baixa intersecao tematica/psicografica e mercado distinto.")

    # Checa violacao de topicos proibidos no DNA do canal candidato
    forbidden_norm = [f.strip().lower() for f in target.forbidden_topics if f.strip()]
    cand_blob = " ".join(candidate.niche_tags + [o.title for o in candidate.outlier_samples]).lower()
    violated_forbidden = [f for f in forbidden_norm if f in cand_blob]
    if violated_forbidden:
        rejections.append(f"Conflita com topicos proibidos do canal ({', '.join(violated_forbidden)}).")

    # 5. Independencia de Autoridade / Anti-Armadilha de Fama (0..10)
    is_authority_trap = (
        candidate.is_celebrity_or_mega_brand
        or candidate.relies_on_breaking_news
        or (subs >= 800_000 and max_ratio < 2.4)
        or (baseline >= 250_000 and max_ratio < 2.2)
    )
    if not is_authority_trap:
        auth_score = 10.0
    else:
        auth_score = 0.0
        if candidate.relies_on_breaking_news:
            rejections.append("Depende de breaking news efemeras (impossivel modelar perenidade).")
        else:
            rejections.append(
                "Armadilha de autoridade/celebridade: cliques vem da fama pregressa, nao da embalagem modelavel."
            )

    # 6. Clareza de DNA de Titulo & Thumbnail (0..10)
    dna_score = 0.0
    if candidate.outlier_samples:
        distinct_archs = {extract_title_blueprint(o.title).archetype_key for o in candidate.outlier_samples}
        has_thumb_cues = sum(1 for o in candidate.outlier_samples if o.thumbnail_cue.strip())
        dna_score = min(10.0, 4.0 + len(distinct_archs) * 2.0 + min(3.0, has_thumb_cues * 1.5))
    elif len(outlier_hits) >= 2:
        dna_score = 6.0

    total_score = round(eff_score + rep_score + fmt_score + them_score + auth_score + dna_score, 1)

    # Determinacao de aprovacao e eixos recomendados de modelagem
    hard_blocked = (
        is_authority_trap
        or bool(violated_forbidden)
        or not compat_fmt
        or len(outlier_hits) < 2
        or not recent_90
    )

    recommended_axes: list[str] = []
    if not hard_blocked and total_score >= 58.0:
        approved = True
        if overlap_ratio >= 0.25 and lang_match:
            recommended_axes = ["temas", "titulos", "thumbnails"]
            if subs <= 150_000 and peak_to_sub_ratio >= 1.2:
                cohort_tier = "par_direto_alta_eficiencia"
                cohort_label = "Par Direto · Alta Eficiência"
            else:
                cohort_tier = "catalisador_crescimento"
                cohort_label = "Catalisador de Outliers"
        else:
            # Subnicho adjacente ou outro idioma com formato viavel: modela Titulos + Thumbs + Mecanismo, sem copiar tema literal
            recommended_axes = ["titulos", "thumbnails"]
            cohort_tier = "benchmark_embalagem_adjacente"
            cohort_label = "Benchmark de Embalagem (Subnicho Adjacente)"
            strengths.append(
                "Ideal para modelar sintaxe de Titulo e contraste de Thumbnail, adaptando o Tema aos seus pilares."
            )
    else:
        approved = False
        if is_authority_trap:
            cohort_tier = "descartado_armadilha_autoridade"
            cohort_label = "Descartado · Armadilha de Autoridade"
        elif len(outlier_hits) < 2:
            cohort_tier = "descartado_hit_isolado"
            cohort_label = "Descartado · Sem Repetibilidade"
        else:
            cohort_tier = "descartado_baixa_aderencia"
            cohort_label = "Descartado · Baixa Aderência"

    return ChannelModelingScorecard(
        external_channel_id=candidate.external_channel_id,
        display_name=candidate.display_name,
        handle=candidate.handle or f"@{re.sub(r'[^a-z0-9]', '', candidate.display_name.lower())[:18]}",
        approved=approved,
        cohort_tier=cohort_tier,
        cohort_label=cohort_label,
        modeling_fitness_score=total_score,
        trimmed_median_views=baseline,
        raw_mean_views=raw_mean,
        subscriber_count=subs,
        views_to_sub_median_ratio=views_to_sub_median,
        peak_outlier_to_sub_ratio=peak_to_sub_ratio,
        repeatable_outliers_count=len(outlier_hits),
        max_outlier_ratio=max_ratio,
        velocity_views_per_day=top_velocity,
        recommended_axes=recommended_axes,
        dimension_scores={
            "packaging_efficiency": round(eff_score, 1),
            "outlier_repeatability": round(rep_score, 1),
            "format_parity": round(fmt_score, 1),
            "thematic_psychographic": round(them_score, 1),
            "authority_independence": round(auth_score, 1),
            "packaging_dna_clarity": round(dna_score, 1),
        },
        strengths=strengths[:4],
        rejection_reasons=rejections[:4],
    )


def _synthesize_title_for_archetype(
    archetype_key: str,
    topic: str,
    pillar: str,
    angle: str,
    niche: str,
) -> tuple[str, str, str]:
    """
    Gera (titulo_modelado, alinhamento_0_30s, nota_diferenciacao) ancorado na formula cognitiva
    extraida das referencias, sem cliches vazios e respeitando orcamento visual mobile.
    """
    clean_topic = topic.strip().rstrip(".!?")
    short_pillar = (pillar.strip() or niche.strip() or "contexto real").rstrip(".!?")
    short_angle = angle.strip().rstrip(".!?")

    if archetype_key == "erro_silencioso":
        title = (
            f"O Erro de Cálculo em {clean_topic} que Mudou {short_pillar}"
            if len(clean_topic) <= 32
            else f"{clean_topic}: A Falha Silenciosa Ignorada"
        )
        hook_align = f"0-15s mostra imediatamente a falha estrutural em '{clean_topic}' com evidencia visual primaria."
        diff = "Desloca a narrativa para a falha tecnica/sistemica verificavel, sem sensacionalismo."
    elif archetype_key == "colapso_cronologico":
        title = (
            f"As 48 Horas que Selaram o Destino de {clean_topic}"
            if len(clean_topic) <= 30
            else f"O Ponto de Ruptura que Redefiniu {clean_topic}"
        )
        hook_align = f"Abre no instante exato da virada cronologica de '{clean_topic}' antes de recuar para a origem."
        diff = "Recorte temporal cirurgico focado no momento de decisao, evitando resumo enciclopedico."
    elif archetype_key == "paradoxo_oculto":
        title = (
            f"Por Que {clean_topic} Funcionava Contra Todas as Regras?"
            if len(clean_topic) <= 32
            else f"O Paradoxo Real Por Trás de {clean_topic}"
        )
        hook_align = f"Confronta a crenca popular sobre '{clean_topic}' com o dado real logo na primeira frase."
        diff = "Constroi lacuna epistemica genuina baseada em restricao real do pilar editorial."
    elif archetype_key == "escala_assimetrica":
        title = (
            f"Como 1 Detalhe em {clean_topic} Travou {short_pillar}"
            if len(clean_topic) <= 28
            else f"O Detalhe Mínimo que Redesenhou {clean_topic}"
        )
        hook_align = "15-30s dimensiona a desproporcao entre o pequeno gatilho inicial e o efeito em larga escala."
        diff = "Aplica contraste micro-macro ancorado em causa mensuravel do seu nicho."
    elif archetype_key == "dossie_investigativo":
        anchor_detail = short_angle if (short_angle and len(short_angle) <= 26) else "o Registro Esquecido"
        title = (
            f"{clean_topic}: O Que {anchor_detail} Revela na Prática"
            if len(clean_topic) <= 28
            else f"O Registro Oculto que Explica {clean_topic}"
        )
        hook_align = "0-15s exibe na tela o mapa, documento ou diagrama central que sustenta a tese."
        diff = "Ancora a curiosidade em prova documental concreta alinhada ao posicionamento do canal."
    else:
        title = (
            f"A Engrenagem Invisível que Move {clean_topic}"
            if len(clean_topic) <= 36
            else f"{clean_topic}: A Engrenagem Estrutural Real"
        )
        hook_align = f"Apresenta o mecanismo central de '{clean_topic}' sem introducao generica ou pedido de inscricao."
        diff = "Modela a relacao causa-efeito profunda sob a voz autoral do canal."

    return title[:95], hook_align, diff


def _pick_non_overlapping_overlay(title: str, candidate_overlays: list[str]) -> str:
    """Escolhe um texto curto (1-3 palavras) que tenha 0% de sobreposicao com as palavras de conteudo do titulo."""
    title_words = set(_content_tokens(title, min_len=3))
    for ov in candidate_overlays:
        ov_words = set(_content_tokens(ov, min_len=3))
        if not (title_words & ov_words):
            return ov
    return "ANTES DO FIM"


def build_complete_modeling_plan(
    *,
    candidates: list[ModelingChannelCandidate],
    target: ModelingTargetProfile,
    focus_topic: str,
    custom_angle: str = "",
) -> dict[str, Any]:
    """
    Pipeline completo de Selecao Inteligente de Canais de Referencia + Modelagem Tripla:
    1. Avalia e ranqueia canais candidatos (aprovados por coorte vs descartados com diagnostico).
    2. Extrai o DNA de Temas, Formulas de Titulo e Gramatica de Thumbnail dos outliers aprovados.
    3. Gera propostas modeladas e auditadas contra plagio/repeticao para o topico do canal.
    """
    clean_topic = focus_topic.strip()
    if len(clean_topic) < 2:
        raise AppError(ErrorCode.VALIDATION_ERROR, "Informe um tema base valido para modelagem.", http_status=422)

    blocked_terms = [t.lower().strip() for t in target.forbidden_topics if t.strip()]
    for term in blocked_terms:
        if term in clean_topic.lower() or (custom_angle and term in custom_angle.lower()):
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                f"Tema ou angulo viola restricao editorial do canal: '{term}'.",
                http_status=422,
            )

    scorecards = [score_reference_channel_for_modeling(c, target) for c in candidates]
    approved_cards = sorted(
        [s for s in scorecards if s.approved],
        key=lambda x: x.modeling_fitness_score,
        reverse=True,
    )
    rejected_cards = sorted(
        [s for s in scorecards if not s.approved],
        key=lambda x: x.modeling_fitness_score,
        reverse=True,
    )

    approved_ids = {s.external_channel_id for s in approved_cards}
    theme_channel_ids = {s.external_channel_id for s in approved_cards if "temas" in s.recommended_axes}

    # Coleta amostras de outliers apenas dos canais aprovados (evitando contaminar modelagem com canais ruins!)
    approved_outliers: list[tuple[ModelingChannelCandidate, ReferenceOutlierSample, ChannelModelingScorecard]] = []
    card_by_id = {s.external_channel_id: s for s in approved_cards}
    for cand in candidates:
        if cand.external_channel_id not in approved_ids:
            continue
        sc = card_by_id[cand.external_channel_id]
        for osmp in cand.outlier_samples:
            approved_outliers.append((cand, osmp, sc))

    # Ordena outliers pelo multiplo sobre a mediana limpa do respectivo canal
    approved_outliers.sort(
        key=lambda item: (item[1].views / max(1.0, item[2].trimmed_median_views)),
        reverse=True,
    )

    all_ref_titles = [o.title for c in candidates for o in c.outlier_samples if o.title.strip()]
    extracted_blueprints: list[TitleBlueprint] = [
        extract_title_blueprint(osmp.title) for _, osmp, _ in approved_outliers if osmp.title.strip()
    ]

    pillars = [p.strip() for p in target.pillars if p.strip()] or [target.niche or "Analise Documental"]
    primary_pillar = pillars[0]
    secondary_pillar = pillars[1] if len(pillars) > 1 else primary_pillar
    base_angle = custom_angle.strip() or f"impacto estrutural sob a otica de {primary_pillar.lower()}"

    # 1. MODELAGEM DE TEMAS (separa Tema Macro, Sub-angulo Inexplorado e Lacuna de Audiencia)
    theme_source_names = [
        s.display_name for s in approved_cards if s.external_channel_id in theme_channel_ids
    ] or [s.display_name for s in approved_cards[:3]]
    comment_gaps = [
        osmp.unanswered_comment.strip()
        for _, osmp, _ in approved_outliers
        if osmp.unanswered_comment.strip()
    ]
    gap_focus = comment_gaps[0] if comment_gaps else f"Como '{clean_topic}' funcionava nos bastidores reais"

    modeled_themes = [
        ModeledThemeProposal(
            theme_id="theme-axis-1",
            theme_headline=f"{clean_topic}: A Engrenagem Logística e o Ponto Cego de {primary_pillar}",
            core_tension="Sistema aparentemente invencivel colapsando por uma restricao fisica ou economica ignorada.",
            untapped_sub_angle=base_angle,
            psychographic_trigger="Desejo de entender a causa real por tras da versao simplificada.",
            target_pillar=primary_pillar,
            inspired_by_channels=theme_source_names[:3],
            cross_channel_support=max(1, len(theme_source_names)),
            differentiation_guardrail="Modela a tensao estrutural validada na coorte, aplicando 100% ao recorte autoral do seu canal.",
        ),
        ModeledThemeProposal(
            theme_id="theme-axis-2",
            theme_headline=f"A Decisão Crítica de 48h que Redesenhou {clean_topic}",
            core_tension="Compressao temporal onde uma unica escolha alterou décadas de resultado.",
            untapped_sub_angle=f"Reconstrucao cronologica respondendo a lacuna da audiencia: '{gap_focus[:90]}'",
            psychographic_trigger="Imersao de risco real e consequencia irreversivel.",
            target_pillar=secondary_pillar,
            inspired_by_channels=theme_source_names[:3],
            cross_channel_support=max(1, len(approved_cards)),
            differentiation_guardrail="Responde diretamente ao que os comentarios dos concorrentes reclamaram que faltou explicar.",
        ),
        ModeledThemeProposal(
            theme_id="theme-axis-3",
            theme_headline=f"O Mapa / Documento Esquecido que Muda a Leitura de {clean_topic}",
            core_tension="Evidencia material contradizendo a narrativa convencional do nicho.",
            untapped_sub_angle=f"Investigacao guiada por prova visual em {secondary_pillar.lower()}",
            psychographic_trigger="Curiosidade forense baseada em prova concreta logo nos primeiros 15 segundos.",
            target_pillar=secondary_pillar,
            inspired_by_channels=[s.display_name for s in approved_cards[:3]],
            cross_channel_support=max(1, len(approved_cards)),
            differentiation_guardrail="Substitui opiniao abstrata por leitura visual de fonte primaria.",
        ),
    ]

    # 2. MODELAGEM DE TITULOS (usa os arquetipos reais extraidos dos outliers aprovados + guardiao anti-plagio)
    default_archetype_order = [
        "paradoxo_oculto",
        "erro_silencioso",
        "dossie_investigativo",
        "colapso_cronologico",
        "escala_assimetrica",
    ]
    ordered_archetypes: list[tuple[str, TitleBlueprint | None]] = []
    seen_arch: set[str] = set()
    for bp in extracted_blueprints:
        if bp.archetype_key not in seen_arch:
            seen_arch.add(bp.archetype_key)
            ordered_archetypes.append((bp.archetype_key, bp))
    for fallback_key in default_archetype_order:
        if fallback_key not in seen_arch and len(ordered_archetypes) < 5:
            seen_arch.add(fallback_key)
            ordered_archetypes.append((fallback_key, None))

    modeled_titles: list[ModeledTitleProposal] = []
    for idx, (arch_key, ref_bp) in enumerate(ordered_archetypes[:5], start=1):
        pillar_for_row = pillars[(idx - 1) % len(pillars)]
        cand_title, align_30s, diff_note = _synthesize_title_for_archetype(
            arch_key,
            clean_topic,
            pillar_for_row,
            base_angle,
            target.niche,
        )
        blueprint_meta = ref_bp or extract_title_blueprint(cand_title)
        sims = [hybrid_title_similarity(cand_title, ref_t) for ref_t in all_ref_titles]
        max_sim = round(max(sims, default=0.0), 4)
        has_bad_promise = any(p in cand_title.lower() for p in FORBIDDEN_UNVERIFIED_PROMISES)
        passed_orig = (max_sim < 0.70) and not has_bad_promise

        modeled_titles.append(
            ModeledTitleProposal(
                option_index=idx,
                title=cand_title,
                char_count=len(cand_title),
                mobile_fit=len(cand_title) <= 64,
                archetype_key=arch_key,
                archetype_label=blueprint_meta.archetype_label,
                syntactic_formula=blueprint_meta.syntactic_formula,
                inspired_by_reference=ref_bp.source_title if ref_bp else "Padrao sintatico multi-canal da coorte",
                max_similarity=max_sim,
                originality_passed=passed_orig,
                promise_0_30s_alignment=align_30s,
                differentiation_note=diff_note,
            )
        )

    # 3. MODELAGEM DE THUMBNAILS (gramatica visual de 2 elementos + overlay complementar sem repetir o titulo)
    ref_thumb_cues = [
        (cand.display_name, osmp.thumbnail_cue)
        for cand, osmp, _ in approved_outliers
        if osmp.thumbnail_cue.strip()
    ]
    thumb_templates = [
        {
            "label": "Anomalia Cartográfica / Prova Isolada",
            "focal": f"Recorte em macro de mapa ou artefato central de '{clean_topic}' com marcador luminoso unico (max. 2 elementos).",
            "conflict": "Contraste entre a rota/estrutura oficial inteira e o ponto exato da ruptura destacado em zoom.",
            "overlays": ["A ROTA CORTADA", "PONTO ZERO", "FORA DO MAPA", "DADO OCULTO"],
            "grid": " Assimetria 60/40: objeto focal nitido a direita, respiro negativo escuro a esquerda para leitura mobile.",
            "palette": "Fundo ardosia profundo (#0B1018) + destaque ambar/ouro (#F5A623) + tipografia marfim (#F8FAFC).",
        },
        {
            "label": "Comparação Antes vs. Depois da Ruptura",
            "focal": f"Divisao limpa em 2 estados fisicos de '{clean_topic}' (auge estrutural vs colapso/bloqueio).",
            "conflict": "Choque imediato de estado que forca a pergunta visual: 'o que provocou essa transicao?'",
            "overlays": ["48H DEPOIS", "TUDO PAROU", "SEM SAÍDA", "COLAPSO REAL"],
            "grid": "Biparticao diagonal limpa sem poluir o centro; silhueta legivel em 160x90px.",
            "palette": "Contraste frio-quente: azul petroleo dessaturado vs vermelho carmim pontual de alerta.",
        },
        {
            "label": "Escala Desproporcional (Micro -> Macro)",
            "focal": f"Elemento gatilho minusculo em primeiro plano contra a escala monumental de '{primary_pillar}'.",
            "conflict": "Desequilibrio visual deliberado mostrando como um fator pequeno travou uma estrutura gigante.",
            "overlays": ["1 FALHA BASTOU", "DETALHE FATAL", "CUSTO BILIONÁRIO", "EFEITO DOMINÓ"],
            "grid": "Regra dos tercos com linha guia direcionando o olhar do detalhe menor para o impacto de fundo.",
            "palette": "Preto carvao de alto contraste, luz de recorte lateral fria e selo tipografico amarelo quente.",
        },
        {
            "label": "Dossiê Documental com Lacuna Censurada",
            "focal": f"Registro historico/tecnico autentico ligado a '{clean_topic}' com uma unica linha grifada.",
            "conflict": "Sensacao de evidencia recem-descoberta que contradiz a explicacao comum.",
            "overlays": ["REGISTRO REAL", "NÃO CONTARAM", "ARQUIVO 01", "A CAUSA REAL"],
            "grid": "Enquadramento frontal levemente angulado (8 graus) com vinheta escura nas bordas.",
            "palette": "Papel envelhecido dessaturado sobre base grafite, grifo ambar vivo e texto branco puro.",
        },
    ]

    modeled_thumbnails: list[ModeledThumbnailProposal] = []
    for idx, tpl in enumerate(thumb_templates, start=1):
        paired_t = modeled_titles[(idx - 1) % len(modeled_titles)].title
        chosen_overlay = _pick_non_overlapping_overlay(paired_t, tpl["overlays"])
        ref_source = (
            f"{ref_thumb_cues[(idx - 1) % len(ref_thumb_cues)][0]} ({ref_thumb_cues[(idx - 1) % len(ref_thumb_cues)][1]})"
            if ref_thumb_cues
            else "Gramatica de alto contraste da coorte aprovada"
        )
        ov_words = chosen_overlay.split()
        repeats = bool(set(_content_tokens(paired_t, min_len=3)) & set(_content_tokens(chosen_overlay, min_len=3)))
        modeled_thumbnails.append(
            ModeledThumbnailProposal(
                concept_index=idx,
                paired_title=paired_t,
                concept_label=tpl["label"],
                focal_subject=tpl["focal"],
                visual_conflict=tpl["conflict"],
                overlay_text=chosen_overlay,
                overlay_word_count=len(ov_words),
                overlay_repeats_title=repeats,
                composition_grid=tpl["grid"].strip(),
                color_polarity=tpl["palette"],
                inspired_by_reference=ref_source,
            )
        )

    return {
        "focus_topic": clean_topic,
        "target_channel": target.channel_name,
        "cohort_summary": {
            "evaluated_count": len(scorecards),
            "approved_count": len(approved_cards),
            "rejected_count": len(rejected_cards),
            "direct_peers_count": sum(1 for s in approved_cards if s.cohort_tier == "par_direto_alta_eficiencia"),
            "growth_catalysts_count": sum(1 for s in approved_cards if s.cohort_tier == "catalisador_crescimento"),
            "adjacent_packaging_count": sum(
                1 for s in approved_cards if s.cohort_tier == "benchmark_embalagem_adjacente"
            ),
            "cohort_health": (
                "forte"
                if len(approved_cards) >= 3
                else ("parcial" if len(approved_cards) >= 1 else "insuficiente")
            ),
            "methodology_note": (
                "Selecao ponderada por Eficiencia Views/Inscritos, Mediana Aparada (resistente a hits isolados), "
                "Paridade de Formato e Separacao de Eixos (Tema vs Titulo vs Thumbnail)."
            ),
        },
        "approved_channels": [asdict(s) for s in approved_cards],
        "rejected_channels": [asdict(s) for s in rejected_cards],
        "extracted_dna": {
            "dominant_archetypes": [bp.archetype_label for bp in extracted_blueprints[:4]],
            "syntactic_formulas": list(dict.fromkeys(bp.syntactic_formula for bp in extracted_blueprints))[:4],
            "audience_unanswered_gaps": comment_gaps[:4],
        },
        "modeled_themes": [asdict(t) for t in modeled_themes],
        "modeled_titles": [asdict(t) for t in modeled_titles],
        "modeled_thumbnails": [asdict(th) for th in modeled_thumbnails],
    }


def default_modeling_candidate_presets() -> list[dict[str, Any]]:
    """
    Coorte realista pre-calibrada para demonstrar imediatamente por que canais eficientes sao aprovados
    e por que canais gigantes movidos a fama ou canais de 1 hit isolado sao descartados pelos agentes.
    """
    return [
        asdict(
            ModelingChannelCandidate(
                external_channel_id="UC_PEER_CARTOGRAFIA",
                display_name="Cartografia Invisível",
                handle="@cartografiainvisivel",
                language="pt-BR",
                market_country="BR",
                subscriber_count=28_500,
                recent_views_sample=[
                    6_200, 7_100, 5_900, 6_800, 7_400, 6_500, 6_100, 7_300, 6_900, 5_800,
                    64_000, 92_000, 118_000,
                ],
                recent_90d_views=[7_300, 64_000, 118_000],
                production_format="faceless_essay",
                niche_tags=["geopolitica", "cartografia", "historia", "rotas maritimas"],
                editorial_pillars=["Cartografia historica", "Geopolitica classica"],
                is_celebrity_or_mega_brand=False,
                outlier_samples=[
                    ReferenceOutlierSample(
                        title="Por Que Este Estreito de 33 km Travou Três Impérios?",
                        views=118_000,
                        days_since_upload=19,
                        thumbnail_cue="Mapa escuro em alto contraste com gargalo vermelho e zero poluicao",
                        thumbnail_overlay="SEM PASSAGEM",
                        topic_tag="rotas estrategicas",
                        unanswered_comment="Faltou mostrar como os navios contornavam no inverno sem radar!",
                    ),
                    ReferenceOutlierSample(
                        title="O Erro de Cálculo no Tratado que Redesenhou o Atlântico",
                        views=92_000,
                        days_since_upload=41,
                        thumbnail_cue="Pergaminho com linha divisoria ambar deslocada sobre o oceano",
                        thumbnail_overlay="1 GRAU A MAIS",
                        topic_tag="cartografia historica",
                        unanswered_comment="Qual foi o custo financeiro real dessa mudanca para Lisboa?",
                    ),
                ],
            )
        ),
        asdict(
            ModelingChannelCandidate(
                external_channel_id="UC_CATALYST_ARQUIVO",
                display_name="Dossiê das Nações",
                handle="@dossiedasnacoes",
                language="pt-BR",
                market_country="BR",
                subscriber_count=84_000,
                recent_views_sample=[
                    14_000, 16_500, 15_200, 13_800, 17_100, 15_900, 14_600, 16_000, 15_400, 14_900,
                    98_000, 164_000, 210_000,
                ],
                recent_90d_views=[16_000, 98_000, 210_000],
                production_format="long_documentary",
                niche_tags=["documentario historico", "economia maritima", "imperios", "geopolitica"],
                editorial_pillars=["Economia maritima", "Geopolitica classica"],
                is_celebrity_or_mega_brand=False,
                outlier_samples=[
                    ReferenceOutlierSample(
                        title="As 48 Horas que Colapsaram o Porto Mais Rico do Século XVII",
                        views=210_000,
                        days_since_upload=24,
                        thumbnail_cue="Comparacao antes/depois do porto bloqueado com selo cronologico",
                        thumbnail_overlay="48H PARA O FIM",
                        topic_tag="economia maritima",
                        unanswered_comment="Quais rotas alternativas assumiram esse fluxo logo depois?",
                    ),
                    ReferenceOutlierSample(
                        title="O Arquivo Naval que Ninguém Abriu por 120 Anos",
                        views=164_000,
                        days_since_upload=58,
                        thumbnail_cue="Documento naval timbrado com uma linha grifada em ouro",
                        thumbnail_overlay="ARQUIVO LACRADO",
                        topic_tag="documentos primarios",
                    ),
                ],
            )
        ),
        asdict(
            ModelingChannelCandidate(
                external_channel_id="UC_ADJACENT_ENGENHARIA",
                display_name="Engenharia de Escala",
                handle="@engenhariadeescala",
                language="pt-BR",
                market_country="BR",
                subscriber_count=62_000,
                recent_views_sample=[
                    11_000, 12_400, 10_800, 11_900, 12_100, 10_500, 11_600, 12_300, 11_200, 10_900,
                    88_000, 142_000,
                ],
                recent_90d_views=[12_300, 88_000, 142_000],
                production_format="faceless_essay",
                niche_tags=["infraestrutura", "logistica global", "megaprojetos"],
                editorial_pillars=["Logistica", "Engenharia"],
                is_celebrity_or_mega_brand=False,
                outlier_samples=[
                    ReferenceOutlierSample(
                        title="Como 1 Peça de Aço Travou um Canal Interoceânico Inteiro",
                        views=142_000,
                        days_since_upload=27,
                        thumbnail_cue=" Contraste de escala micro-macro entre comporta gigante e trava vermelha",
                        thumbnail_overlay="1 PEÇA TRAVOU",
                        topic_tag="logistica maritima",
                    ),
                ],
            )
        ),
        asdict(
            ModelingChannelCandidate(
                external_channel_id="UC_TRAP_GIGANTE_TV",
                display_name="Portal Global News TV",
                handle="@portalglobalnewstv",
                language="pt-BR",
                market_country="BR",
                subscriber_count=2_400_000,
                recent_views_sample=[
                    42_000, 48_000, 51_000, 45_000, 49_000, 44_000, 52_000, 47_000, 46_000, 50_000,
                    65_000, 72_000,
                ],
                recent_90d_views=[48_000, 72_000],
                production_format="tv_broadcast_clip",
                niche_tags=["noticias", "geopolitica", "plantao"],
                editorial_pillars=["Plantao diario"],
                is_celebrity_or_mega_brand=True,
                relies_on_breaking_news=True,
                outlier_samples=[
                    ReferenceOutlierSample(
                        title="URGENTE: Plantão Completo Sobre a Crise Internacional de Hoje",
                        views=72_000,
                        days_since_upload=3,
                        thumbnail_cue="Bancada de TV com 4 apresentadores e tarja vermelha poluida",
                        thumbnail_overlay="PLANTÃO AGORA",
                        topic_tag="plantao",
                    ),
                ],
            )
        ),
        asdict(
            ModelingChannelCandidate(
                external_channel_id="UC_TRAP_ONE_HIT",
                display_name="Curiosidades Aleatórias Express",
                handle="@curiosidadesexpress",
                language="pt-BR",
                market_country="BR",
                subscriber_count=95_000,
                recent_views_sample=[
                    1_800, 2_100, 1_950, 2_200, 1_700, 2_050, 1_900, 2_150, 1_850, 2_000,
                    48_000,
                ],
                recent_90d_views=[1_900, 2_100],
                production_format="faceless_essay",
                niche_tags=["curiosidades", "historia"],
                editorial_pillars=["Listas gerais"],
                is_celebrity_or_mega_brand=False,
                outlier_samples=[
                    ReferenceOutlierSample(
                        title="10 Fatos Curiosos Sobre Navios Antigos",
                        views=48_000,
                        days_since_upload=140,
                        thumbnail_cue="Colagem confusa com 5 fotos pequenas e setas aleatorias",
                        thumbnail_overlay="10 FATOS!",
                        topic_tag="curiosidades",
                    ),
                ],
            )
        ),
    ]
