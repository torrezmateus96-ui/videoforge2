export type ModelingOutlierSampleDTO = {
  title: string;
  views: number;
  days_since_upload: number;
  thumbnail_cue: string;
  thumbnail_overlay: string;
  topic_tag: string;
  unanswered_comment?: string;
};

export type ModelingCandidateChannelDTO = {
  external_channel_id: string;
  display_name: string;
  handle: string;
  language: string;
  market_country: string;
  subscriber_count: number;
  recent_views_sample: number[];
  recent_90d_views: number[];
  production_format: string;
  niche_tags: string[];
  editorial_pillars: string[];
  is_celebrity_or_mega_brand: boolean;
  relies_on_breaking_news: boolean;
  outlier_samples: ModelingOutlierSampleDTO[];
};

export type ChannelModelingScorecardDTO = {
  external_channel_id: string;
  display_name: string;
  handle: string;
  approved: boolean;
  cohort_tier: string;
  cohort_label: string;
  modeling_fitness_score: number;
  trimmed_median_views: number;
  raw_mean_views: number;
  subscriber_count: number;
  views_to_sub_median_ratio: number;
  peak_outlier_to_sub_ratio: number;
  repeatable_outliers_count: number;
  max_outlier_ratio: number;
  velocity_views_per_day: number;
  recommended_axes: string[];
  dimension_scores: Record<string, number>;
  strengths: string[];
  rejection_reasons: string[];
};

export type ModeledThemeProposalDTO = {
  theme_id: string;
  theme_headline: string;
  core_tension: string;
  untapped_sub_angle: string;
  psychographic_trigger: string;
  target_pillar: string;
  inspired_by_channels: string[];
  cross_channel_support: number;
  differentiation_guardrail: string;
};

export type ModeledTitleProposalDTO = {
  option_index: number;
  title: string;
  char_count: number;
  mobile_fit: boolean;
  archetype_key: string;
  archetype_label: string;
  syntactic_formula: string;
  inspired_by_reference: string;
  max_similarity: number;
  originality_passed: boolean;
  promise_0_30s_alignment: string;
  differentiation_note: string;
};

export type ModeledThumbnailProposalDTO = {
  concept_index: number;
  paired_title: string;
  concept_label: string;
  focal_subject: string;
  visual_conflict: string;
  overlay_text: string;
  overlay_word_count: number;
  overlay_repeats_title: boolean;
  composition_grid: string;
  color_polarity: string;
  inspired_by_reference: string;
};

export type ReferenceModelingPlaybookDTO = {
  focus_topic: string;
  target_channel: string;
  cohort_summary: {
    evaluated_count: number;
    approved_count: number;
    rejected_count: number;
    direct_peers_count: number;
    growth_catalysts_count: number;
    adjacent_packaging_count: number;
    cohort_health: "forte" | "parcial" | "insuficiente";
    methodology_note: string;
  };
  approved_channels: ChannelModelingScorecardDTO[];
  rejected_channels: ChannelModelingScorecardDTO[];
  extracted_dna: {
    dominant_archetypes: string[];
    syntactic_formulas: string[];
    audience_unanswered_gaps: string[];
  };
  modeled_themes: ModeledThemeProposalDTO[];
  modeled_titles: ModeledTitleProposalDTO[];
  modeled_thumbnails: ModeledThumbnailProposalDTO[];
};

export type ModelingPlaybookRequestDTO = {
  channel_name: string;
  niche: string;
  editorial_theme: string;
  pillars: string[];
  language: string;
  market_country: string;
  feasible_formats: string[];
  audience_tags: string[];
  forbidden_topics: string[];
  min_outlier_ratio?: number;
  focus_topic: string;
  custom_angle?: string;
  candidates: ModelingCandidateChannelDTO[];
};

export const DEFAULT_MODELING_CANDIDATES: ModelingCandidateChannelDTO[] = [
  {
    external_channel_id: "UC_PEER_CARTOGRAFIA",
    display_name: "Cartografia Invisível",
    handle: "@cartografiainvisivel",
    language: "pt-BR",
    market_country: "BR",
    subscriber_count: 28500,
    recent_views_sample: [
      6200, 7100, 5900, 6800, 7400, 6500, 6100, 7300, 6900, 5800, 64000, 92000, 118000,
    ],
    recent_90d_views: [7300, 64000, 118000],
    production_format: "faceless_essay",
    niche_tags: ["geopolitica", "cartografia", "historia", "rotas maritimas"],
    editorial_pillars: ["Cartografia historica", "Geopolitica classica"],
    is_celebrity_or_mega_brand: false,
    relies_on_breaking_news: false,
    outlier_samples: [
      {
        title: "Por Que Este Estreito de 33 km Travou Três Impérios?",
        views: 118000,
        days_since_upload: 19,
        thumbnail_cue: "Mapa escuro em alto contraste com gargalo vermelho e zero poluicao",
        thumbnail_overlay: "SEM PASSAGEM",
        topic_tag: "rotas estrategicas",
        unanswered_comment: "Faltou mostrar como os navios contornavam no inverno sem radar!",
      },
      {
        title: "O Erro de Cálculo no Tratado que Redesenhou o Atlântico",
        views: 92000,
        days_since_upload: 41,
        thumbnail_cue: "Pergaminho com linha divisoria ambar deslocada sobre o oceano",
        thumbnail_overlay: "1 GRAU A MAIS",
        topic_tag: "cartografia historica",
        unanswered_comment: "Qual foi o custo financeiro real dessa mudanca para Lisboa?",
      },
    ],
  },
  {
    external_channel_id: "UC_CATALYST_ARQUIVO",
    display_name: "Dossiê das Nações",
    handle: "@dossiedasnacoes",
    language: "pt-BR",
    market_country: "BR",
    subscriber_count: 84000,
    recent_views_sample: [
      14000, 16500, 15200, 13800, 17100, 15900, 14600, 16000, 15400, 14900, 98000, 164000, 210000,
    ],
    recent_90d_views: [16000, 98000, 210000],
    production_format: "long_documentary",
    niche_tags: ["documentario historico", "economia maritima", "imperios", "geopolitica"],
    editorial_pillars: ["Economia maritima", "Geopolitica classica"],
    is_celebrity_or_mega_brand: false,
    relies_on_breaking_news: false,
    outlier_samples: [
      {
        title: "As 48 Horas que Colapsaram o Porto Mais Rico do Século XVII",
        views: 210000,
        days_since_upload: 24,
        thumbnail_cue: "Comparacao antes/depois do porto bloqueado com selo cronologico",
        thumbnail_overlay: "48H PARA O FIM",
        topic_tag: "economia maritima",
        unanswered_comment: "Quais rotas alternativas assumiram esse fluxo logo depois?",
      },
      {
        title: "O Arquivo Naval que Ninguém Abriu por 120 Anos",
        views: 164000,
        days_since_upload: 58,
        thumbnail_cue: "Documento naval timbrado com uma linha grifada em ouro",
        thumbnail_overlay: "ARQUIVO LACRADO",
        topic_tag: "documentos primarios",
      },
    ],
  },
  {
    external_channel_id: "UC_ADJACENT_ENGENHARIA",
    display_name: "Engenharia de Escala",
    handle: "@engenhariadeescala",
    language: "pt-BR",
    market_country: "BR",
    subscriber_count: 62000,
    recent_views_sample: [
      11000, 12400, 10800, 11900, 12100, 10500, 11600, 12300, 11200, 10900, 88000, 142000,
    ],
    recent_90d_views: [12300, 88000, 142000],
    production_format: "faceless_essay",
    niche_tags: ["infraestrutura", "logistica global", "megaprojetos"],
    editorial_pillars: ["Logistica", "Engenharia"],
    is_celebrity_or_mega_brand: false,
    relies_on_breaking_news: false,
    outlier_samples: [
      {
        title: "Como 1 Peça de Aço Travou um Canal Interoceânico Inteiro",
        views: 142000,
        days_since_upload: 27,
        thumbnail_cue: "Contraste de escala micro-macro entre comporta gigante e trava vermelha",
        thumbnail_overlay: "1 PEÇA TRAVOU",
        topic_tag: "logistica maritima",
      },
    ],
  },
  {
    external_channel_id: "UC_TRAP_GIGANTE_TV",
    display_name: "Portal Global News TV",
    handle: "@portalglobalnewstv",
    language: "pt-BR",
    market_country: "BR",
    subscriber_count: 2400000,
    recent_views_sample: [
      42000, 48000, 51000, 45000, 49000, 44000, 52000, 47000, 46000, 50000, 65000, 72000,
    ],
    recent_90d_views: [48000, 72000],
    production_format: "tv_broadcast_clip",
    niche_tags: ["noticias", "geopolitica", "plantao"],
    editorial_pillars: ["Plantao diario"],
    is_celebrity_or_mega_brand: true,
    relies_on_breaking_news: true,
    outlier_samples: [
      {
        title: "URGENTE: Plantão Completo Sobre a Crise Internacional de Hoje",
        views: 72000,
        days_since_upload: 3,
        thumbnail_cue: "Bancada de TV com 4 apresentadores e tarja vermelha poluida",
        thumbnail_overlay: "PLANTÃO AGORA",
        topic_tag: "plantao",
      },
    ],
  },
  {
    external_channel_id: "UC_TRAP_ONE_HIT",
    display_name: "Curiosidades Aleatórias Express",
    handle: "@curiosidadesexpress",
    language: "pt-BR",
    market_country: "BR",
    subscriber_count: 95000,
    recent_views_sample: [
      1800, 2100, 1950, 2200, 1700, 2050, 1900, 2150, 1850, 2000, 48000,
    ],
    recent_90d_views: [1900, 2100],
    production_format: "faceless_essay",
    niche_tags: ["curiosidades", "historia"],
    editorial_pillars: ["Listas gerais"],
    is_celebrity_or_mega_brand: false,
    relies_on_breaking_news: false,
    outlier_samples: [
      {
        title: "10 Fatos Curiosos Sobre Navios Antigos",
        views: 48000,
        days_since_upload: 140,
        thumbnail_cue: "Colagem confusa com 5 fotos pequenas e setas aleatorias",
        thumbnail_overlay: "10 FATOS!",
        topic_tag: "curiosidades",
      },
    ],
  },
];

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "um", "uma",
  "por", "para", "com", "sem", "sob", "sobre", "que", "como", "qual", "quais",
  "mais", "menos", "tudo", "todos", "todas", "the", "and", "for", "with",
]);

function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9áàâãéêíóôõúç]+/g) ?? []).filter(
    (t) => t.length >= 3 && !STOPWORDS.has(t)
  );
}

function computeTrimmedMedianBaseline(views: number[]): { baseline: number; rawMean: number } {
  const cleaned = views.map((v) => Math.max(0, Math.round(v))).sort((a, b) => a - b);
  if (cleaned.length === 0) return { baseline: 0, rawMean: 0 };
  const rawMean = cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
  const trimCount = cleaned.length >= 8 ? Math.max(2, Math.round(cleaned.length * 0.22)) : 0;
  const core = cleaned.slice(0, Math.max(1, cleaned.length - trimCount));
  const mid = Math.floor(core.length / 2);
  const med = core.length % 2 === 1 ? core[mid] : (core[mid - 1] + core[mid]) / 2;
  const cap = med > 0 ? med * 3.0 : rawMean;
  const trimMean = core.reduce((a, b) => a + Math.min(b, cap), 0) / core.length;
  return {
    baseline: Number((0.75 * med + 0.25 * trimMean).toFixed(2)),
    rawMean: Number(rawMean.toFixed(2)),
  };
}

function classifyTitleBlueprint(title: string) {
  const low = title.toLowerCase();
  if (/\b(erro|falha|armadilha|ignorado|silencios|esquecid)\b/.test(low)) {
    return {
      key: "erro_silencioso",
      label: "Anomalia ou Erro Silencioso",
      formula: "[Sistema/Entidade] + [Falha Invisível] + [Efeito Irreversível]",
    };
  }
  if (/\b(colapso|sumiu|desapareceu|noite|horas|queda|fim)\b/.test(low)) {
    return {
      key: "colapso_cronologico",
      label: "Ruptura Cronológica de Alto Risco",
      formula: "[Marco Temporal Curto] + [Evento de Ruptura] + [Causa Oculta]",
    };
  }
  if (/\b(por que|paradoxo|impossivel|contra|apesar|nunca)\b/.test(low) || title.includes("?")) {
    return {
      key: "paradoxo_oculto",
      label: "Paradoxo Contra-Intuitivo",
      formula: "[Crença Comum Quebrada] + [Restrição Real] + [Pergunta Implícita]",
    };
  }
  if (/\b\d+\b/.test(low) || /\b(escala|unico|maior|menor)\b/.test(low)) {
    return {
      key: "escala_assimetrica",
      label: "Contraste de Escala Assimétrica",
      formula: "[Detalhe Mínimo / Âncora Numérica] -> [Impacto Macroproporcional]",
    };
  }
  if (/\b(arquivo|mapa|dossie|documento|rota|tratado)\b/.test(low)) {
    return {
      key: "dossie_investigativo",
      label: "Dossiê de Prova Primária",
      formula: "[Evidência Concreta] + [O Que Ela Escondia] + [Mudança de Cenário]",
    };
  }
  return {
    key: "causa_sistemica",
    label: "Engrenagem Sistêmica Oculta",
    formula: "[Fenômeno Conhecido] + [Mecanismo Real Por Trás] + [Consequência Duradoura]",
  };
}

function hybridTitleSimilarity(a: string, b: string): number {
  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  const union = new Set([...ta, ...tb]).size;
  return Number((inter / Math.max(1, union)).toFixed(4));
}

export function buildSandboxModelingPlaybook(req: ModelingPlaybookRequestDTO): ReferenceModelingPlaybookDTO {
  const minMult = Math.max(1.8, req.min_outlier_ratio ?? 3.0);
  const targetLex = new Set(
    contentTokens([req.niche, req.editorial_theme, ...req.pillars, ...req.audience_tags].join(" "))
  );
  const compatibleFormats = new Set([
    "faceless_essay",
    "long_documentary",
    "documentary",
    "map_investigation",
    "archive_narrative",
    "long",
    ...req.feasible_formats.map((f) => f.toLowerCase()),
  ]);

  const cards: ChannelModelingScorecardDTO[] = req.candidates.map((cand) => {
    const sampleViews = [...cand.recent_views_sample];
    for (const o of cand.outlier_samples) {
      if (!sampleViews.includes(o.views)) sampleViews.push(o.views);
    }
    const { baseline, rawMean } = computeTrimmedMedianBaseline(sampleViews);
    const subs = Math.max(1, cand.subscriber_count || 1);
    const outlierFloor = Math.max(1000, baseline * minMult);
    const outlierHits = sampleViews.filter((v) => baseline > 0 && v >= outlierFloor);
    const peakViews = sampleViews.length > 0 ? Math.max(...sampleViews) : 0;
    const maxRatio = baseline > 0 ? Number((peakViews / baseline).toFixed(2)) : 0;
    const viewsToSubMedian = Number((baseline / subs).toFixed(4));
    const peakToSub = Number((peakViews / subs).toFixed(4));

    const strengths: string[] = [];
    const rejections: string[] = [];

    let effScore = peakToSub >= 2.0 ? 17 : peakToSub >= 0.75 ? 12.5 : peakToSub >= 0.25 ? 7 : 2;
    if (peakToSub >= 1.2) {
      strengths.push(
        `Outliers furam a bolha de inscritos (${peakToSub.toFixed(1)}x os inscritos no pico) — sinal puro de Título + Thumb.`
      );
    }
    if (viewsToSubMedian >= 0.04) effScore += 8;
    else if (subs >= 500000 && viewsToSubMedian < 0.03) {
      rejections.push("Baixa eficiência views/inscritos (< 3%): canal gigante sustentado por inércia antiga.");
    }

    const recent90 = cand.recent_90d_views.filter((v) => v >= Math.max(1000, baseline * 1.35));
    let repScore = outlierHits.length >= 3 ? 16 : outlierHits.length === 2 ? 12.5 : outlierHits.length === 1 ? 4 : 0;
    if (outlierHits.length >= 2) {
      strengths.push(`${outlierHits.length} outliers reprodutíveis acima de ${minMult.toFixed(1)}x (${maxRatio}x máx).`);
    } else if (outlierHits.length === 1) {
      rejections.push("Apenas 1 outlier isolado (risco de sorte única sem padrão replicável).");
    } else {
      rejections.push(`Nenhum outlier >= ${minMult.toFixed(1)}x sobre a mediana limpa.`);
    }
    if (recent90.length > 0) repScore += 9;
    else rejections.push("Sem tração comprovada na janela recente de 90 dias.");

    const compatFmt =
      compatibleFormats.has(cand.production_format.toLowerCase()) &&
      cand.production_format !== "tv_broadcast_clip";
    const fmtScore = compatFmt ? 14 : 2;
    if (compatFmt) strengths.push(`Formato viável para sua operação (${cand.production_format}).`);
    else rejections.push(`Formato de produção inviável (${cand.production_format}).`);

    const candLex = new Set(
      contentTokens(
        [...cand.niche_tags, ...cand.editorial_pillars, ...cand.outlier_samples.map((o) => o.title)].join(" ")
      )
    );
    const overlap: string[] = [];
    for (const t of candLex) if (targetLex.has(t)) overlap.push(t);
    const overlapRatio = targetLex.size > 0 ? overlap.length / Math.max(1, Math.min(targetLex.size, 8)) : 0.25;
    const themScore = 5 + (overlapRatio >= 0.3 ? 10 : overlapRatio >= 0.1 ? 6.5 : 2);
    if (overlap.length > 0) strengths.push(`Interseção editorial (${overlap.slice(0, 3).join(", ")}).`);

    const isAuthorityTrap =
      cand.is_celebrity_or_mega_brand ||
      cand.relies_on_breaking_news ||
      (subs >= 800000 && maxRatio < 2.4);
    const authScore = isAuthorityTrap ? 0 : 10;
    if (isAuthorityTrap) {
      rejections.push(
        cand.relies_on_breaking_news
          ? "Depende de breaking news efêmeras (impossível modelar perenidade)."
          : "Armadilha de autoridade/celebridade: cliques vêm da fama pregressa, não da embalagem."
      );
    }

    const dnaScore = cand.outlier_samples.length > 0 ? 8.5 : 5.5;
    const totalScore = Number((effScore + repScore + fmtScore + themScore + authScore + dnaScore).toFixed(1));
    const approved = !isAuthorityTrap && compatFmt && outlierHits.length >= 2 && recent90.length > 0 && totalScore >= 58;

    let cohortTier = "descartado_baixa_aderencia";
    let cohortLabel = "Descartado · Baixa Aderência";
    let recommendedAxes: string[] = [];

    if (approved) {
      if (overlapRatio >= 0.22) {
        recommendedAxes = ["temas", "titulos", "thumbnails"];
        if (subs <= 150000 && peakToSub >= 1.2) {
          cohortTier = "par_direto_alta_eficiencia";
          cohortLabel = "Par Direto · Alta Eficiência";
        } else {
          cohortTier = "catalisador_crescimento";
          cohortLabel = "Catalisador de Outliers";
        }
      } else {
        recommendedAxes = ["titulos", "thumbnails"];
        cohortTier = "benchmark_embalagem_adjacente";
        cohortLabel = "Benchmark de Embalagem (Subnicho Adjacente)";
      }
    } else if (isAuthorityTrap) {
      cohortTier = "descartado_armadilha_autoridade";
      cohortLabel = "Descartado · Armadilha de Autoridade";
    } else if (outlierHits.length < 2) {
      cohortTier = "descartado_hit_isolado";
      cohortLabel = "Descartado · Sem Repetibilidade";
    }

    const topVel =
      cand.outlier_samples.length > 0
        ? Math.max(...cand.outlier_samples.map((o) => Math.round(o.views / Math.max(1, o.days_since_upload))))
        : 0;

    return {
      external_channel_id: cand.external_channel_id,
      display_name: cand.display_name,
      handle: cand.handle,
      approved,
      cohort_tier: cohortTier,
      cohort_label: cohortLabel,
      modeling_fitness_score: totalScore,
      trimmed_median_views: baseline,
      raw_mean_views: rawMean,
      subscriber_count: subs,
      views_to_sub_median_ratio: viewsToSubMedian,
      peak_outlier_to_sub_ratio: peakToSub,
      repeatable_outliers_count: outlierHits.length,
      max_outlier_ratio: maxRatio,
      velocity_views_per_day: topVel,
      recommended_axes: recommendedAxes,
      dimension_scores: {
        packaging_efficiency: effScore,
        outlier_repeatability: repScore,
        format_parity: fmtScore,
        thematic_psychographic: themScore,
        authority_independence: authScore,
        packaging_dna_clarity: dnaScore,
      },
      strengths: strengths.slice(0, 4),
      rejection_reasons: rejections.slice(0, 4),
    };
  });

  const approvedChannels = cards
    .filter((c) => c.approved)
    .sort((a, b) => b.modeling_fitness_score - a.modeling_fitness_score);
  const rejectedChannels = cards
    .filter((c) => !c.approved)
    .sort((a, b) => b.modeling_fitness_score - a.modeling_fitness_score);

  const approvedSet = new Set(approvedChannels.map((c) => c.external_channel_id));
  const approvedOutliers = req.candidates
    .filter((c) => approvedSet.has(c.external_channel_id))
    .flatMap((c) => c.outlier_samples.map((o) => ({ channelName: c.display_name, sample: o })));

  const cleanTopic = req.focus_topic.trim();
  const pillars = req.pillars.length > 0 ? req.pillars : [req.niche || "Análise Documental"];
  const p1 = pillars[0];
  const p2 = pillars[1] ?? p1;
  const baseAngle = (req.custom_angle ?? "").trim() || `impacto estrutural sob a ótica de ${p1.toLowerCase()}`;
  const gaps = approvedOutliers.map((x) => x.sample.unanswered_comment || "").filter(Boolean);
  const allRefTitles = req.candidates.flatMap((c) => c.outlier_samples.map((o) => o.title));

  const modeledThemes: ModeledThemeProposalDTO[] = [
    {
      theme_id: "theme-axis-1",
      theme_headline: `${cleanTopic}: A Engrenagem Logística e o Ponto Cego de ${p1}`,
      core_tension: "Sistema aparentemente sólido colapsando por uma restrição física ou econômica ignorada.",
      untapped_sub_angle: baseAngle,
      psychographic_trigger: "Desejo de descobrir a engrenagem real por trás da explicação superficial.",
      target_pillar: p1,
      inspired_by_channels: approvedChannels.slice(0, 3).map((c) => c.display_name),
      cross_channel_support: Math.max(1, approvedChannels.length),
      differentiation_guardrail:
        "Modela a tensão estrutural validada na coorte, aplicando 100% ao recorte autoral do seu canal.",
    },
    {
      theme_id: "theme-axis-2",
      theme_headline: `A Decisão Crítica de 48h que Redesenhou ${cleanTopic}`,
      core_tension: "Compressão temporal onde uma única escolha alterou décadas de resultado.",
      untapped_sub_angle: gaps[0]
        ? `Responder à lacuna real dos comentários: "${gaps[0]}"`
        : `Reconstrução cronológica focada em ${p2.toLowerCase()}`,
      psychographic_trigger: "Imersão de risco real e consequência irreversível.",
      target_pillar: p2,
      inspired_by_channels: approvedChannels.slice(0, 3).map((c) => c.display_name),
      cross_channel_support: Math.max(1, approvedChannels.length),
      differentiation_guardrail: "Cobre exatamente o detalhe prático que os vídeos concorrentes deixaram em aberto.",
    },
    {
      theme_id: "theme-axis-3",
      theme_headline: `O Registro / Mapa Esquecido que Muda a Leitura de ${cleanTopic}`,
      core_tension: "Evidência documental primária contradizendo a versão popular do nicho.",
      untapped_sub_angle: `Investigação guiada por prova visual em ${p2.toLowerCase()}`,
      psychographic_trigger: "Curiosidade forense ancorada em artefato tangível nos primeiros 15 segundos.",
      target_pillar: p2,
      inspired_by_channels: approvedChannels.slice(0, 3).map((c) => c.display_name),
      cross_channel_support: Math.max(1, approvedChannels.length),
      differentiation_guardrail: "Substitui opinião genérica por leitura visual de fonte primária.",
    },
  ];

  const titleSpecs = [
    {
      key: "paradoxo_oculto",
      label: "Paradoxo Contra-Intuitivo",
      formula: "[Crença Comum Quebrada] + [Restrição Real] + [Pergunta Implícita]",
      title:
        cleanTopic.length <= 32
          ? `Por Que ${cleanTopic} Funcionava Contra Todas as Regras?`
          : `O Paradoxo Real Por Trás de ${cleanTopic}`,
      align: `0-15s confronta a crença comum sobre '${cleanTopic}' com o dado real logo na abertura.`,
      diff: "Constrói lacuna epistêmica genuína sem adjetivos apelativos.",
    },
    {
      key: "erro_silencioso",
      label: "Anomalia ou Erro Silencioso",
      formula: "[Sistema/Entidade] + [Falha Invisível] + [Efeito Irreversível]",
      title:
        cleanTopic.length <= 30
          ? `O Erro de Cálculo em ${cleanTopic} que Mudou ${p1}`
          : `${cleanTopic}: A Falha Silenciosa Ignorada`,
      align: `0-15s exibe imediatamente o ponto exato da falha estrutural em '${cleanTopic}'.`,
      diff: "Desloca a narrativa para causa técnica verificável alinhada aos pilares do canal.",
    },
    {
      key: "colapso_cronologico",
      label: "Ruptura Cronológica de Alto Risco",
      formula: "[Marco Temporal Curto] + [Evento de Ruptura] + [Causa Oculta]",
      title:
        cleanTopic.length <= 30
          ? `As 48 Horas que Selaram o Destino de ${cleanTopic}`
          : `O Ponto de Ruptura que Redefiniu ${cleanTopic}`,
      align: "Abre no clímax cronológico antes de recuar para explicar a cadeia causal.",
      diff: "Recorte temporal cirúrgico em vez de resumo enciclopédico.",
    },
    {
      key: "escala_assimetrica",
      label: "Contraste de Escala Assimétrica",
      formula: "[Detalhe Mínimo / Âncora Numérica] -> [Impacto Macroproporcional]",
      title:
        cleanTopic.length <= 28
          ? `Como 1 Detalhe em ${cleanTopic} Travou ${p2}`
          : `O Detalhe Mínimo que Redesenhou ${cleanTopic}`,
      align: "15-30s dimensiona a desproporção entre o gatilho pequeno e o efeito macro.",
      diff: "Contraste micro-macro ancorado em causa mensurável.",
    },
    {
      key: "dossie_investigativo",
      label: "Dossiê de Prova Primária",
      formula: "[Evidência Concreta] + [O Que Ela Escondia] + [Mudança de Cenário]",
      title: `${cleanTopic}: O Que o Registro Esquecido Revela na Prática`,
      align: "0-15s mostra na tela o mapa, documento ou diagrama central que sustenta a tese.",
      diff: "Ancora a promessa em prova material concreta.",
    },
  ];

  const modeledTitles: ModeledTitleProposalDTO[] = titleSpecs.map((sp, idx) => {
    const sims = allRefTitles.map((rt) => hybridTitleSimilarity(sp.title, rt));
    const maxSim = sims.length > 0 ? Math.max(...sims) : 0.14;
    const refMatch = approvedOutliers[idx % Math.max(1, approvedOutliers.length)]?.sample.title ?? "Padrão multi-canal";
    return {
      option_index: idx + 1,
      title: sp.title,
      char_count: sp.title.length,
      mobile_fit: sp.title.length <= 64,
      archetype_key: sp.key,
      archetype_label: sp.label,
      syntactic_formula: sp.formula,
      inspired_by_reference: refMatch,
      max_similarity: maxSim,
      originality_passed: maxSim < 0.7,
      promise_0_30s_alignment: sp.align,
      differentiation_note: sp.diff,
    };
  });

  const pickOverlay = (pairedTitle: string, candidatesOv: string[]) => {
    const tSet = new Set(contentTokens(pairedTitle));
    for (const ov of candidatesOv) {
      const ovToks = contentTokens(ov);
      if (ovToks.every((w) => !tSet.has(w))) return ov;
    }
    return "PONTO ZERO";
  };

  const thumbSpecs = [
    {
      label: "Anomalia Cartográfica / Prova Isolada",
      focal: `Recorte em macro de mapa ou artefato central de '${cleanTopic}' com marcador luminoso único (máx. 2 elementos).`,
      conflict: "Contraste entre a rota/estrutura inteira e o ponto exato da ruptura destacado em zoom.",
      overlays: ["ROTA CORTADA", "FORA DO MAPA", "PONTO ZERO"],
      grid: "Assimetria 60/40: objeto focal nítido à direita, espaço negativo escuro à esquerda para leitura mobile.",
      palette: "Ardósia profundo (#0B1018) · destaque âmbar (#F5A623) · tipografia marfim (#F8FAFC).",
    },
    {
      label: "Comparação Antes vs. Depois da Ruptura",
      focal: `Divisão limpa em 2 estados físicos de '${cleanTopic}' (auge estrutural vs bloqueio).`,
      conflict: "Choque imediato de estado que força a pergunta visual: 'o que provocou essa transição?'",
      overlays: ["TUDO PAROU", "SEM SAÍDA", "ANTES DO FIM"],
      grid: "Bipartição diagonal limpa sem poluir o centro; silhueta legível em 160x90px.",
      palette: "Azul petróleo dessaturado em contraste com vermelho carmim pontual de alerta.",
    },
    {
      label: "Escala Desproporcional (Micro -> Macro)",
      focal: `Elemento gatilho minúsculo em primeiro plano contra a escala monumental de '${p1}'.`,
      conflict: "Desequilíbrio visual deliberado mostrando como um fator pequeno travou uma estrutura gigante.",
      overlays: ["1 FALHA BASTOU", "CUSTO REAL", "EFEITO DOMINÓ"],
      grid: "Regra dos terços com linha guia direcionando o olhar do detalhe menor para o impacto de fundo.",
      palette: "Carvão de alto contraste · luz de recorte fria · selo tipográfico amarelo quente.",
    },
    {
      label: "Dossiê Documental com Lacuna Grifada",
      focal: `Registro histórico/técnico autêntico ligado a '${cleanTopic}' com uma única linha destacada.`,
      conflict: "Sensação de evidência primária que contradiz a versão convencional.",
      overlays: ["ARQUIVO 01", "NÃO CONTARAM", "CAUSA OCULTA"],
      grid: "Enquadramento frontal levemente angulado (8°) com vinheta escura nas bordas.",
      palette: "Papel envelhecido dessaturado sobre base grafite · grifo âmbar vivo · texto branco puro.",
    },
  ];

  const modeledThumbnails: ModeledThumbnailProposalDTO[] = thumbSpecs.map((tpl, idx) => {
    const paired = modeledTitles[idx % modeledTitles.length].title;
    const overlay = pickOverlay(paired, tpl.overlays);
    const refCue = approvedOutliers[idx % Math.max(1, approvedOutliers.length)];
    return {
      concept_index: idx + 1,
      paired_title: paired,
      concept_label: tpl.label,
      focal_subject: tpl.focal,
      visual_conflict: tpl.conflict,
      overlay_text: overlay,
      overlay_word_count: overlay.split(/\s+/).length,
      overlay_repeats_title: false,
      composition_grid: tpl.grid,
      color_polarity: tpl.palette,
      inspired_by_reference: refCue
        ? `${refCue.channelName} (${refCue.sample.thumbnail_cue})`
        : "Gramática de alto contraste da coorte aprovada",
    };
  });

  const bps = approvedOutliers.map((x) => classifyTitleBlueprint(x.sample.title));

  return {
    focus_topic: cleanTopic,
    target_channel: req.channel_name,
    cohort_summary: {
      evaluated_count: cards.length,
      approved_count: approvedChannels.length,
      rejected_count: rejectedChannels.length,
      direct_peers_count: approvedChannels.filter((c) => c.cohort_tier === "par_direto_alta_eficiencia").length,
      growth_catalysts_count: approvedChannels.filter((c) => c.cohort_tier === "catalisador_crescimento").length,
      adjacent_packaging_count: approvedChannels.filter((c) => c.cohort_tier === "benchmark_embalagem_adjacente")
        .length,
      cohort_health:
        approvedChannels.length >= 3 ? "forte" : approvedChannels.length >= 1 ? "parcial" : "insuficiente",
      methodology_note:
        "Seleção ponderada por Eficiência Views/Inscritos, Mediana Aparada (resistente a hits isolados), Paridade de Formato e Separação de Eixos (Tema vs Título vs Thumbnail).",
    },
    approved_channels: approvedChannels,
    rejected_channels: rejectedChannels,
    extracted_dna: {
      dominant_archetypes: Array.from(new Set(bps.map((b) => b.label))).slice(0, 4),
      syntactic_formulas: Array.from(new Set(bps.map((b) => b.formula))).slice(0, 4),
      audience_unanswered_gaps: gaps.slice(0, 4),
    },
    modeled_themes: modeledThemes,
    modeled_titles: modeledTitles,
    modeled_thumbnails: modeledThumbnails,
  };
}
