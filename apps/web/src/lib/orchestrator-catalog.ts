export type AgentDivisionKey = "editorial_runtime" | "engineering_platform";
export type MissionScopeKey = "editorial" | "engineering" | "full_project";

export type OrchestratorSubagentDTO = {
  key: string;
  lead_key: string;
  division: AgentDivisionKey;
  display_name: string;
  domain: string;
  studio_room_key: string | null;
  OrderIndex: number;
  mission: string;
  skills: string[];
  inputs: string[];
  outputs: string[];
  guardrails: string[];
  depends_on: string[];
  requires_human_gate: boolean;
  trigger_keywords: string[];
};

export type OrchestratorLeadDTO = {
  key: string;
  division: AgentDivisionKey;
  display_name: string;
  role_title: string;
  domain: string;
  studio_agent_key: string | null;
  studio_room_key: string | null;
  mission: string;
  requires_human_approval: boolean;
  depends_on_leads: string[];
  skills: string[];
  invariants: string[];
  subagent_keys: string[];
};

export type OrchestratorMasterDTO = {
  key: string;
  display_name: string;
  version: string;
  mission: string;
  routing_policy: string[];
  global_guardrails: string[];
  lead_agent_keys: string[];
  total_leads: number;
  total_subagents: number;
};

export type OrchestratorPresetMissionDTO = {
  id: string;
  title: string;
  scope: MissionScopeKey;
  objective: string;
};

export type OrchestratorTopologyDTO = {
  master: OrchestratorMasterDTO;
  leads: OrchestratorLeadDTO[];
  subagents: OrchestratorSubagentDTO[];
  PresetMissions: OrchestratorPresetMissionDTO[];
};

export type OrchestratorPlanStepDTO = {
  step_order: number;
  lead_key: string;
  lead_display_name: string;
  subagent_key: string;
  subagent_display_name: string;
  division: AgentDivisionKey;
  domain: string;
  studio_room_key: string | null;
  skills_activated: string[];
  expected_inputs: string[];
  expected_outputs: string[];
  guardrails_enforced: string[];
  depends_on: string[];
  requires_human_gate: boolean;
  rationale: string;
};

export type OrchestratorPlanDTO = {
  plan_id: string;
  objective: string;
  scope: MissionScopeKey;
  selected_lead_keys: string[];
  selected_subagent_keys: string[];
  steps: OrchestratorPlanStepDTO[];
  human_gates_count: number;
  validation_gates: string[];
  limitations: string[];
};

export type OrchestratorExecutedStepDTO = {
  step_order: number;
  lead_key: string;
  subagent_key: string;
  subagent_display_name: string;
  division: AgentDivisionKey;
  domain: string;
  status: "completed" | "waiting_human_gate" | "blocked_guardrail";
  artifact_type: string;
  summary: string;
  checks_passed: string[];
  guardrail_notes: string[];
  requires_human_gate: boolean;
  output_payload: Record<string, unknown>;
};

export type OrchestratorExecutionReportDTO = {
  execution_id: string;
  plan_id: string;
  workspace_id: string;
  channel_id: string | null;
  objective: string;
  scope: MissionScopeKey;
  overall_status: "completed" | "waiting_human_approval" | "blocked_by_guardrail";
  executed_steps: OrchestratorExecutedStepDTO[];
  completed_count: number;
  human_gate_pending_count: number;
  requires_human_publish: boolean;
  auto_publish_enabled: boolean;
  limitations: string[];
  created_at: string;
};

const SANDBOX_SUBAGENTS: OrchestratorSubagentDTO[] = [
  {
    key: "dados.sync_auditor",
    lead_key: "dados",
    division: "editorial_runtime",
    display_name: "Auditor de Sincronizacao & Cursores OAuth",
    domain: "analytics",
    studio_room_key: "sala_dados",
    OrderIndex: 1,
    mission: "Audita escopos OAuth read-only, frescor dos cursores incrementais e orcamento diario de quota da API do YouTube.",
    skills: ["youtube-oauth-readonly", "cursor-freshness-audit", "quota-budget-guard"],
    inputs: ["channel_id", "sync_cursors", "quota_usage"],
    outputs: ["freshness_report", "sync_recommendations"],
    guardrails: ["Escopo estritamente read-only na conta Google.", "Nunca expor tokens ou segredos em logs."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["sync", "sincronizar", "oauth", "cursor", "quota", "analytics", "dados"],
  },
  {
    key: "dados.metric_integrity",
    lead_key: "dados",
    division: "editorial_runtime",
    display_name: "Validador de Integridade & Disponibilidade Honesta",
    domain: "analytics",
    studio_room_key: "sala_dados",
    OrderIndex: 2,
    mission: "Garante que metricas privadas ausentes ou nao sincronizadas sejam marcadas como UNKNOWN (null), jamais fabricando zeros.",
    skills: ["null-availability-enforcer", "anti-fabricated-zero", "period-normalization"],
    inputs: ["raw_metric_facts", "freshness_report"],
    outputs: ["validated_metric_snapshot", "availability_matrix"],
    guardrails: ["Ausencia de sincronizacao jamais vira 0 (availability=unknown, value_num=null)."],
    depends_on: ["dados.sync_auditor"],
    requires_human_gate: false,
    trigger_keywords: ["metrica", "metricas", "views", "zero", "unknown", "integridade", "dados"],
  },
  {
    key: "dados.retention_cohort",
    lead_key: "dados",
    division: "editorial_runtime",
    display_name: "Analista de Coortes, CTR & Retencao 28d/90d",
    domain: "analytics",
    studio_room_key: "sala_dados",
    OrderIndex: 3,
    mission: "Compara janelas de 7d, 28d e 90d do catalogo proprio para diagnosticar quedas de CTR e retencao nos primeiros 30 segundos.",
    skills: ["cohort-delta-28d-90d", "ctr-dropoff-diagnosis", "format-benchmark"],
    inputs: ["validated_metric_snapshot", "channel_videos"],
    outputs: ["cohort_diagnosis", "baseline_anomalies"],
    guardrails: ["Declarar insuficiencia amostral quando o canal possuir menos de 5 videos sincronizados."],
    depends_on: ["dados.metric_integrity"],
    requires_human_gate: false,
    trigger_keywords: ["ctr", "retencao", "coorte", "28d", "90d", "queda", "analytics"],
  },
  {
    key: "pesquisa.studio_trends_scout",
    lead_key: "pesquisa",
    division: "editorial_runtime",
    display_name: "Explorador de Buscas & Lacunas do YouTube Studio",
    domain: "studio_trends",
    studio_room_key: "pesquisa",
    OrderIndex: 1,
    mission: "Extrai termos de alto volume, lacunas de conteudo e videos assistidos pela audiencia na aba Inspiracao.",
    skills: ["studio-inspiration-mining", "content-gap-classification", "audience-overlap-filter"],
    inputs: ["broad_topic", "channel_profile", "studio_session_state"],
    outputs: ["studio_search_terms", "content_gap_hypotheses"],
    guardrails: ["Interromper imediatamente em caso de desafio de login ou STUDIO_SCHEMA_DRIFT."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["inspiracao", "lacuna", "content gap", "buscas", "studio trends", "pesquisa"],
  },
  {
    key: "pesquisa.google_trends_sustainability",
    lead_key: "pesquisa",
    division: "editorial_runtime",
    display_name: "Validador de Sustentabilidade 12m/5y & Breakout",
    domain: "google_trends",
    studio_room_key: "pesquisa",
    OrderIndex: 2,
    mission: "Cruza curvas de 12 meses e 5 anos do Google Trends YouTube Search para separar temas evergreen de picos mortos.",
    skills: ["trends-12m-5y-durability", "dead-peak-filter", "breakout-query-detector"],
    inputs: ["keyword_candidates", "geo", "gprop"],
    outputs: ["sustainability_verdict", "breakout_queries"],
    guardrails: ["Rejeitar picos efemeros com decaimento > 75% sem base recorrente de 5 anos."],
    depends_on: ["pesquisa.studio_trends_scout"],
    requires_human_gate: false,
    trigger_keywords: ["google trends", "evergreen", "breakout", "tendencia", "sustentabilidade", "5 anos", "csv"],
  },
  {
    key: "pesquisa.channel_selector_f1",
    lead_key: "pesquisa",
    division: "editorial_runtime",
    display_name: "Auditor Fase 1 — Selecao de 5-10 Canais de Referencia",
    domain: "reverse_engineering",
    studio_room_key: "pesquisa",
    OrderIndex: 3,
    mission: "Aplica os 6 criterios objetivos da Fase 1 (idioma, mercado, formato viavel, audiencia, recorrencia 90d e exclusao de celebridades).",
    skills: ["re-phase1-six-criteria", "mega-brand-exclusion", "reference-cohort-ranking"],
    inputs: ["candidate_channels", "channel_profile"],
    outputs: ["approved_reference_channels", "rejected_criteria_audit"],
    guardrails: ["Descartar canais movidos apenas por fama pessoal ou mega-marca."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["fase 1", "canais de referencia", "concorrentes", "engenharia reversa"],
  },
  {
    key: "pesquisa.viral_outlier_f2",
    lead_key: "pesquisa",
    division: "editorial_runtime",
    display_name: "Detector Fase 2 — Outliers Virais & Velocidade Views/Dia",
    domain: "reverse_engineering",
    studio_room_key: "pesquisa",
    OrderIndex: 4,
    mission: "Calcula media limpa dos ultimos 20-30 videos, detecta outliers >=3x e filtra falsos positivos.",
    skills: ["re-phase2-outlier-ratio", "views-per-day-velocity", "false-positive-sieve"],
    inputs: ["approved_reference_channels", "recent_videos_sample"],
    outputs: ["validated_viral_outliers", "multi_channel_patterns"],
    guardrails: ["Filtrar breaking news irrepetiveis e collabs com celebridades."],
    depends_on: ["pesquisa.channel_selector_f1"],
    requires_human_gate: false,
    trigger_keywords: ["fase 2", "outlier", "outliers", "viral", "views por dia", "pesquisa"],
  },
  {
    key: "pesquisa.video_autopsy_f3",
    lead_key: "pesquisa",
    division: "editorial_runtime",
    display_name: "Legista Fase 3 — Autopsia de Retencao & Comentarios",
    domain: "reverse_engineering",
    studio_room_key: "pesquisa",
    OrderIndex: 5,
    mission: "Disseca pacote titulo+capa, abertura 0-15s, prova de valor 15-30s, arquetipo narrativo e duvidas reais nos comentarios.",
    skills: ["re-phase3-hook-autopsy", "comment-gap-mining", "narrative-archetype-tagging"],
    inputs: ["validated_viral_outliers", "transcript_notes", "viewer_comments"],
    outputs: ["structured_video_autopsy", "viewer_unanswered_gaps"],
    guardrails: ["Extrair apenas estrutura cognitiva e lacunas; proibido copiar texto literal."],
    depends_on: ["pesquisa.viral_outlier_f2"],
    requires_human_gate: false,
    trigger_keywords: ["fase 3", "autopsia", "comentarios", "abertura", "arquetipo"],
  },
  {
    key: "estrategia.profile_fit_analyst",
    lead_key: "estrategia",
    division: "editorial_runtime",
    display_name: "Analista de Aderencia ao Perfil Editorial",
    domain: "opportunities",
    studio_room_key: "mesa_agentes",
    OrderIndex: 1,
    mission: "Avalia alinhamento estrito da pauta com nicho, posicionamento, pilares ativos e topicos proibidos da versao vigente.",
    skills: ["editorial-profile-fit", "forbidden-topic-blocker", "voice-consistency-check"],
    inputs: ["channel_profile_version", "topic_candidate"],
    outputs: ["editorial_fit_report", "restriction_verdict"],
    guardrails: ["Bloquear imediatamente qualquer pauta que viole topicos proibidos do canal."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["perfil", "pilares", "posicionamento", "nicho", "fit editorial", "estrategia"],
  },
  {
    key: "estrategia.analytics_baseline_analyst",
    lead_key: "estrategia",
    division: "editorial_runtime",
    display_name: "Analista de Baseline Historica do Canal",
    domain: "opportunities",
    studio_room_key: "mesa_agentes",
    OrderIndex: 2,
    mission: "Cruza a hipotese tematica com o historico real do canal proprio, sinalizando confianca reduzida caso faltem dados.",
    skills: ["own-channel-baseline", "confidence-calibration", "format-fit-scoring"],
    inputs: ["validated_metric_snapshot", "cohort_diagnosis"],
    outputs: ["analytics_analyst_report", "confidence_weight"],
    guardrails: ["Marcar insufficient_data=true quando nao houver baseline sincronizada."],
    depends_on: ["dados.metric_integrity"],
    requires_human_gate: false,
    trigger_keywords: ["baseline", "historico", "confianca", "oportunidade", "estrategia"],
  },
  {
    key: "estrategia.public_demand_analyst",
    lead_key: "estrategia",
    division: "editorial_runtime",
    display_name: "Analista de Demanda Publica & Competicao",
    domain: "opportunities",
    studio_room_key: "mesa_agentes",
    OrderIndex: 3,
    mission: "Consolida sinais do YouTube Studio, Google Trends e outliers multi-canal para quantificar demanda real versus saturacao.",
    skills: ["demand-vs-saturation-matrix", "multi-source-triangulation"],
    inputs: ["studio_search_terms", "sustainability_verdict", "multi_channel_patterns"],
    outputs: ["demand_competition_report", "saturation_index"],
    guardrails: ["Exigir ao menos uma evidencia rastreavel antes de atribuir demanda alta."],
    depends_on: ["pesquisa.studio_trends_scout", "pesquisa.google_trends_sustainability"],
    requires_human_gate: false,
    trigger_keywords: ["demanda", "competicao", "saturacao", "mercado", "oportunidade"],
  },
  {
    key: "estrategia.rag_evidence_analyst",
    lead_key: "estrategia",
    division: "editorial_runtime",
    display_name: "Analista de Evidencias Curadas (Knowledge L2/L3)",
    domain: "knowledge_rag",
    studio_room_key: "mesa_agentes",
    OrderIndex: 4,
    mission: "Recupera apenas chunks aprovados em curadoria L2/L3 com busca hibrida para embasar angulo e diferenciacao.",
    skills: ["hybrid-rag-l2-l3", "quarantine-l0-exclusion", "source-rights-verification"],
    inputs: ["workspace_knowledge_index", "topic_candidate"],
    outputs: ["verified_rag_citations", "context_sufficiency_flag"],
    guardrails: ["Fontes L0 em quarentena nunca entram no indice nem em geracoes."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["knowledge", "rag", "fontes", "curadoria", "citacoes", "l2", "l3"],
  },
  {
    key: "estrategia.transferable_mechanism_f4",
    lead_key: "estrategia",
    division: "editorial_runtime",
    display_name: "Sintetizador Fase 4 — Mecanismo Transferivel & Score",
    domain: "opportunities",
    studio_room_key: "mesa_agentes",
    OrderIndex: 5,
    mission: "Une os 4 relatorios analiticos e a Fase 4 gerando Opportunity versionada e EpisodeBrief.",
    skills: ["re-phase4-mechanism-synthesis", "versioned-opportunity-scoring", "episode-brief-drafting"],
    inputs: ["editorial_fit_report", "analytics_analyst_report", "demand_competition_report", "verified_rag_citations"],
    outputs: ["ranked_opportunity", "episode_brief_draft"],
    guardrails: ["Requer aprovacao humana explicita antes de travar o EpisodeBrief."],
    depends_on: [
      "estrategia.profile_fit_analyst",
      "estrategia.analytics_baseline_analyst",
      "estrategia.public_demand_analyst",
      "estrategia.rag_evidence_analyst",
    ],
    requires_human_gate: true,
    trigger_keywords: ["fase 4", "mecanismo", "sintese", "score", "oportunidade", "brief", "estrategia"],
  },
  {
    key: "titulos.formula_extractor",
    lead_key: "titulos",
    division: "editorial_runtime",
    display_name: "Extrator de Formula Estrutural de Packaging",
    domain: "packaging_titles",
    studio_room_key: "mesa_agentes",
    OrderIndex: 1,
    mission: "Decompoe titulos de referencia em padroes sintaticos, ancoras numericas e extensao mobile (<= 60 chars).",
    skills: ["title-syntax-decomposition", "mobile-truncation-check"],
    inputs: ["episode_brief_draft", "reference_titles"],
    outputs: ["editorial_title_formulas", "structural_constraints"],
    guardrails: ["Extrair padrao abstrato, nunca reaproveitar frases exclusivas do concorrente."],
    depends_on: ["estrategia.transferable_mechanism_f4"],
    requires_human_gate: false,
    trigger_keywords: ["formula", "analisar titulo", "packaging", "titulos"],
  },
  {
    key: "titulos.curiosity_gap_writer",
    lead_key: "titulos",
    division: "editorial_runtime",
    display_name: "Redator de Alternativas com Lacuna de Curiosidade",
    domain: "packaging_titles",
    studio_room_key: "mesa_agentes",
    OrderIndex: 2,
    mission: "Gera de 3 a 5 alternativas originais alinhadas a voz do canal e a promessa real do video.",
    skills: ["curiosity-gap-copywriting", "anti-clickbait-promise-alignment"],
    inputs: ["editorial_title_formulas", "channel_voice"],
    outputs: ["title_candidates_list"],
    guardrails: ["Toda promessa do titulo deve ser cumprida nos primeiros 30 segundos do roteiro."],
    depends_on: ["titulos.formula_extractor"],
    requires_human_gate: false,
    trigger_keywords: ["gerar titulos", "alternativas de titulo", "curiosidade", "titulos"],
  },
  {
    key: "titulos.anti_plagiarism_guard",
    lead_key: "titulos",
    division: "editorial_runtime",
    display_name: "Guardiao Anti-Plagio & Similaridade Lexical (< 0.70)",
    domain: "packaging_titles",
    studio_room_key: "mesa_agentes",
    OrderIndex: 3,
    mission: "Calcula similaridade lexical contra todos os titulos de referencia e bloqueia candidatos >= 0.70.",
    skills: ["trigram-cosine-similarity", "originality-gate-blocker"],
    inputs: ["title_candidates_list", "reference_titles"],
    outputs: ["approved_original_titles", "similarity_audit_matrix"],
    guardrails: ["Bloqueio deterministico obrigatorio quando max_similarity >= 0.70."],
    depends_on: ["titulos.curiosity_gap_writer"],
    requires_human_gate: true,
    trigger_keywords: ["plagio", "similaridade", "originalidade", "titulos"],
  },
  {
    key: "roteiro.hook_0_30s_architect",
    lead_key: "roteiro",
    division: "editorial_runtime",
    display_name: "Arquiteto de Gancho 0-15s & Prova de Valor 15-30s",
    domain: "script_retention",
    studio_room_key: "gravacao",
    OrderIndex: 1,
    mission: "Constroi os primeiros 30 segundos eliminando cumprimentos genericos e validando o clique da capa.",
    skills: ["zero-fluff-hook-0-15s", "value-proof-15-30s", "click-confirmation-bridge"],
    inputs: ["approved_original_titles", "episode_brief_draft"],
    outputs: ["opening_30s_script_block"],
    guardrails: ["Proibido iniciar com cumprimentos longos antes do conflito central."],
    depends_on: ["titulos.anti_plagiarism_guard"],
    requires_human_gate: false,
    trigger_keywords: ["gancho", "hook", "0-15s", "15-30s", "roteiro"],
  },
  {
    key: "roteiro.rag_citation_weaver",
    lead_key: "roteiro",
    division: "editorial_runtime",
    display_name: "Tecelao Documental de Evidencias & Citacoes RAG",
    domain: "script_retention",
    studio_room_key: "gravacao",
    OrderIndex: 2,
    mission: "Integra fatos verificados da base curada L2/L3 nos atos do roteiro com rastreabilidade de fonte.",
    skills: ["documentary-fact-weaving", "citation-provenance-link", "prompt-injection-shield"],
    inputs: ["opening_30s_script_block", "verified_rag_citations"],
    outputs: ["cited_narrative_acts", "fact_provenance_map"],
    guardrails: ["Jamais inventar estatisticas ou citacoes fora das fontes curadas."],
    depends_on: ["roteiro.hook_0_30s_architect", "estrategia.rag_evidence_analyst"],
    requires_human_gate: false,
    trigger_keywords: ["fatos", "documentario", "evidencias", "citacao", "roteiro"],
  },
  {
    key: "roteiro.narrative_pacing_editor",
    lead_key: "roteiro",
    division: "editorial_runtime",
    display_name: "Editor de Ritmo, Loops Abertos & Climax",
    domain: "script_retention",
    studio_room_key: "gravacao",
    OrderIndex: 3,
    mission: "Posiciona micro-recompensas, mudancas de tensao a cada 60-90s, resolucao do loop principal e CTA final.",
    skills: ["open-loop-cadence", "retention-valley-prevention", "organic-cta-closing"],
    inputs: ["cited_narrative_acts"],
    outputs: ["complete_retention_script", "pacing_cue_sheet"],
    guardrails: ["Todo loop aberto nos atos iniciais deve ser fechado no climax."],
    depends_on: ["roteiro.rag_citation_weaver"],
    requires_human_gate: true,
    trigger_keywords: ["ritmo", "loops abertos", "climax", "retencao", "roteiro"],
  },
  {
    key: "thumbnail.visual_composition_director",
    lead_key: "thumbnail",
    division: "editorial_runtime",
    display_name: "Diretor de Composicao Visual & Foco Unico",
    domain: "thumbnail_design",
    studio_room_key: "design_thumbnail",
    OrderIndex: 1,
    mission: "Define enquadramento de ate 2 elementos dominantes e pergunta visual imediata em telas pequenas.",
    skills: ["two-element-focal-rule", "mobile-silhouette-legibility", "visual-tension-framing"],
    inputs: ["approved_original_titles", "episode_brief_draft"],
    outputs: ["visual_composition_blueprint"],
    guardrails: ["Proibir poluicao visual com mais de 3 pontos focais concorrentes."],
    depends_on: ["titulos.anti_plagiarism_guard"],
    requires_human_gate: false,
    trigger_keywords: ["capa", "thumbnail", "composicao", "enquadramento", "design"],
  },
  {
    key: "thumbnail.contrast_overlay_copy",
    lead_key: "thumbnail",
    division: "editorial_runtime",
    display_name: "Especialista em Contraste Cromatico & Texto Curto",
    domain: "thumbnail_design",
    studio_room_key: "design_thumbnail",
    OrderIndex: 2,
    mission: "Cria texto de sobreposicao complementar ao titulo (0 a 4 palavras) e paleta de alto contraste.",
    skills: ["four-word-overlay-limit", "title-complementarity-check", "wcag-mobile-contrast"],
    inputs: ["visual_composition_blueprint", "approved_original_titles"],
    outputs: ["thumbnail_overlay_variants", "color_contrast_spec"],
    guardrails: ["Nunca repetir exatamente as mesmas palavras do titulo na capa."],
    depends_on: ["thumbnail.visual_composition_director"],
    requires_human_gate: false,
    trigger_keywords: ["texto da capa", "contraste", "cores", "thumbnail"],
  },
  {
    key: "thumbnail.visual_originality_auditor",
    lead_key: "thumbnail",
    division: "editorial_runtime",
    display_name: "Auditor de Originalidade Visual Anti-Clone",
    domain: "thumbnail_design",
    studio_room_key: "design_thumbnail",
    OrderIndex: 3,
    mission: "Verifica que os conceitos de capa nao clonam layout ou ativos protegidos de canais concorrentes.",
    skills: ["visual-clone-prevention", "asset-rights-check"],
    inputs: ["thumbnail_overlay_variants", "structured_video_autopsy"],
    outputs: ["validated_thumbnail_package"],
    guardrails: ["Bloquear qualquer instrucao que imite identidade visual proprietaria de terceiros."],
    depends_on: ["thumbnail.contrast_overlay_copy"],
    requires_human_gate: true,
    trigger_keywords: ["originalidade visual", "anti-clone", "thumbnail"],
  },
  {
    key: "edicao.brief_freeze_validator",
    lead_key: "edicao",
    division: "editorial_runtime",
    display_name: "Validador de Congelamento & Hash SHA-256 do Brief",
    domain: "production_gateway",
    studio_room_key: "gravacao",
    OrderIndex: 1,
    mission: "Confirma EpisodeBrief APPROVED e valida integridade do hash SHA-256 antes da producao.",
    skills: ["approved-brief-gate", "sha256-immutable-snapshot"],
    inputs: ["episode_brief_id", "complete_retention_script", "validated_thumbnail_package"],
    outputs: ["frozen_brief_manifest"],
    guardrails: ["Rejeitar com 409 VERSION_CONFLICT tentativa de produzir a partir de brief DRAFT."],
    depends_on: ["roteiro.narrative_pacing_editor", "thumbnail.visual_originality_auditor"],
    requires_human_gate: false,
    trigger_keywords: ["congelar brief", "sha256", "producao", "edicao"],
  },
  {
    key: "edicao.idempotent_intent_dispatcher",
    lead_key: "edicao",
    division: "editorial_runtime",
    display_name: "Despachante Idempotente Single-Writer (ADR-005)",
    domain: "production_gateway",
    studio_room_key: "gravacao",
    OrderIndex: 2,
    mission: "Cria e despacha ProductionIntent com Idempotency-Key para o executor externo de midia.",
    skills: ["single-writer-gateway", "idempotency-key-dedup", "external-executor-handoff"],
    inputs: ["frozen_brief_manifest", "idempotency_key"],
    outputs: ["production_intent_record", "dispatch_receipt"],
    guardrails: ["Zero renderizacao pesada de midia dentro do servidor web ou da API."],
    depends_on: ["edicao.brief_freeze_validator"],
    requires_human_gate: false,
    trigger_keywords: ["intent", "despachar", "single-writer", "producao", "edicao"],
  },
  {
    key: "edicao.manifest_checksum_verifier",
    lead_key: "edicao",
    division: "editorial_runtime",
    display_name: "Verificador de Manifesto & Reconciliacao de Storage",
    domain: "jobs_storage",
    studio_room_key: "gravacao",
    OrderIndex: 3,
    mission: "Valida checksums de artefatos gerados e reconcilia objetos entre banco de metadados e storage.",
    skills: ["manifest-checksum-audit", "storage-orphan-reconcile"],
    inputs: ["production_intent_record", "storage_bucket_state"],
    outputs: ["verified_production_manifest", "storage_reconcile_report"],
    guardrails: ["Detectar uploads incompletos ou orfaos antes de liberar checklist de publicacao."],
    depends_on: ["edicao.idempotent_intent_dispatcher"],
    requires_human_gate: false,
    trigger_keywords: ["manifesto", "checksum", "storage", "reconciliar", "edicao"],
  },
  {
    key: "publicacao.metadata_seo_packager",
    lead_key: "publicacao",
    division: "editorial_runtime",
    display_name: "Empacotador de Descricao, Capitulos & Metadados",
    domain: "publication",
    studio_room_key: "estrategia_publicacao",
    OrderIndex: 1,
    mission: "Monta descricao otimizada, timestamps de capitulos verificados, tags semanticas e comentario fixado.",
    skills: ["youtube-chapters-builder", "above-the-fold-description", "pinned-comment-hook"],
    inputs: ["approved_original_titles", "complete_retention_script", "verified_production_manifest"],
    outputs: ["publication_metadata_bundle"],
    guardrails: ["Nao incluir tags enganosas desconectadas do conteudo real."],
    depends_on: ["edicao.manifest_checksum_verifier"],
    requires_human_gate: false,
    trigger_keywords: ["descricao", "capitulos", "timestamps", "seo", "publicacao"],
  },
  {
    key: "publicacao.editorial_calendar_scheduler",
    lead_key: "publicacao",
    division: "editorial_runtime",
    display_name: "Agendador de Janela & Calendario Editorial",
    domain: "calendar",
    studio_room_key: "estrategia_publicacao",
    OrderIndex: 2,
    mission: "Posiciona o episodio na grade do calendario editorial respeitando cadencia e fuso do canal.",
    skills: ["cadence-slot-planner", "timezone-window-alignment"],
    inputs: ["publication_metadata_bundle", "channel_calendar_items"],
    outputs: ["calendar_schedule_slot"],
    guardrails: ["Sempre gravar auto_publish_enabled=false em todo item do calendario."],
    depends_on: ["publicacao.metadata_seo_packager"],
    requires_human_gate: false,
    trigger_keywords: ["calendario", "agendar", "janela", "horario", "publicacao"],
  },
  {
    key: "publicacao.human_gate_enforcer",
    lead_key: "publicacao",
    division: "editorial_runtime",
    display_name: "Fiscal de Publicacao Humana Obrigatoria (ADR-002)",
    domain: "publication",
    studio_room_key: "estrategia_publicacao",
    OrderIndex: 3,
    mission: "Executa checklist final e mantem bloqueio absoluto de postagem automatica ate acao humana.",
    skills: ["adr002-no-autopublish", "rights-and-compliance-checklist", "manual-publish-audit"],
    inputs: ["calendar_schedule_slot", "publication_metadata_bundle"],
    outputs: ["final_human_publish_package"],
    guardrails: ["PROIBIDO realizar upload ou publicacao automatica na API do YouTube (requires_human_publish=true)."],
    depends_on: ["publicacao.editorial_calendar_scheduler"],
    requires_human_gate: true,
    trigger_keywords: ["publicar", "upload", "checklist final", "publicacao"],
  },
  {
    key: "eng.core_boundary_guardian",
    lead_key: "arquitetura_api",
    division: "engineering_platform",
    display_name: "Fiscal de Pureza Hexagonal do Dominio (core/)",
    domain: "hexagonal_architecture",
    studio_room_key: null,
    OrderIndex: 1,
    mission: "Inspeciona imports e contratos em core/ garantindo zero acoplamento com frameworks web ou automacao.",
    skills: ["hexagonal-ports-and-adapters", "ast-import-boundary-audit", "strict-contract-models"],
    inputs: ["core_module_tree", "contracts_schemas"],
    outputs: ["boundary_compliance_verdict"],
    guardrails: ["Bloquear qualquer import de framework HTTP ou navegador dentro de core/."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["hexagonal", "core", "arquitetura", "contratos", "dominio"],
  },
  {
    key: "eng.domain_router_architect",
    lead_key: "arquitetura_api",
    division: "engineering_platform",
    display_name: "Arquiteto de Rotas Semanticas FastAPI & OpenAPI",
    domain: "api_routing",
    studio_room_key: null,
    OrderIndex: 2,
    mission: "Organiza endpoints REST por contexto delimitado com envelopes padronizados de erro.",
    skills: ["semantic-domain-routers", "error-envelope-standardization", "openapi-tag-governance"],
    inputs: ["api_routes_package", "boundary_compliance_verdict"],
    outputs: ["openapi_route_topology"],
    guardrails: ["Proibir nomenclatura acoplada a subplanos legados."],
    depends_on: ["eng.core_boundary_guardian"],
    requires_human_gate: false,
    trigger_keywords: ["rotas", "fastapi", "api", "endpoints", "openapi"],
  },
  {
    key: "eng.http_pool_lifespan_tuner",
    lead_key: "arquitetura_api",
    division: "engineering_platform",
    display_name: "Especialista em Pool TCP/TLS Keep-Alive & Lifespan",
    domain: "backend_performance",
    studio_room_key: null,
    OrderIndex: 3,
    mission: "Gerencia clientes HTTP persistentes com limites de keep-alive no lifespan da API.",
    skills: ["persistent-connection-pooling", "fastapi-lifespan-cleanup", "retry-backoff-tuning"],
    inputs: ["adapter_http_clients", "service_container"],
    outputs: ["pool_efficiency_report"],
    guardrails: ["Nunca instanciar cliente HTTP descartavel a cada query."],
    depends_on: ["eng.domain_router_architect"],
    requires_human_gate: false,
    trigger_keywords: ["pool", "keep-alive", "latencia", "lifespan", "performance"],
  },
  {
    key: "sec.rls_tenant_isolator",
    lead_key: "dados_seguranca",
    division: "engineering_platform",
    display_name: "Auditor de Isolamento Multi-Tenant RLS & RBAC",
    domain: "database_security",
    studio_room_key: null,
    OrderIndex: 1,
    mission: "Verifica politicas RLS nas migracoes SQL e checagens obrigatorias de papel em toda operacao.",
    skills: ["postgres-rls-audit", "workspace-rbac-enforcement", "cross-tenant-penetration-check"],
    inputs: ["sql_migrations", "workspace_service_calls"],
    outputs: ["tenant_isolation_matrix"],
    guardrails: ["Requisicoes entre tenants distintos devem falhar com 403 WORKSPACE_FORBIDDEN."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["rls", "multi-tenant", "workspace", "rbac", "banco"],
  },
  {
    key: "sec.secret_vault_hygiene",
    lead_key: "dados_seguranca",
    division: "engineering_platform",
    display_name: "Guardiao de Cofre Criptografico & Higiene de Segredos",
    domain: "appsec_secrets",
    studio_room_key: null,
    OrderIndex: 2,
    mission: "Audita criptografia de tokens OAuth, redacao automatica de logs e ausencia de credenciais na UI.",
    skills: ["token-vault-encryption", "sensitive-log-redaction", "client-bundle-secret-scan"],
    inputs: ["web_source_bundle", "diagnostics_exporter", "token_vault"],
    outputs: ["secret_hygiene_audit"],
    guardrails: ["Chaves privilegiadas de servidor jamais podem aparecer no bundle cliente."],
    depends_on: ["sec.rls_tenant_isolator"],
    requires_human_gate: false,
    trigger_keywords: ["segredo", "segredos", "token", "credenciais", "login", "seguranca"],
  },
  {
    key: "sec.csrf_origin_sentinel",
    lead_key: "dados_seguranca",
    division: "engineering_platform",
    display_name: "Sentinela de Origem Confiavel, JWT & Anti-CSRF",
    domain: "appsec_auth",
    studio_room_key: null,
    OrderIndex: 3,
    mission: "Valida assinatura JWT, bloqueia mutacoes vindas de origens nao autorizadas e previne XSS.",
    skills: ["jwt-signature-verification", "trusted-origin-csrf-guard", "xss-sink-elimination"],
    inputs: ["api_mutation_routes", "jwt_verifier_config"],
    outputs: ["auth_perimeter_report"],
    guardrails: ["Bloquear mutacoes HTTP com cabecalho Origin fora da lista confiavel."],
    depends_on: ["sec.secret_vault_hygiene"],
    requires_human_gate: false,
    trigger_keywords: ["csrf", "origin", "jwt", "autenticacao", "xss", "seguranca"],
  },
  {
    key: "ops.fencing_lease_recovery",
    lead_key: "automacao_resiliencia",
    division: "engineering_platform",
    display_name: "Controlador de Leases Fencing Token & Recuperacao de Jobs",
    domain: "workers_queue",
    studio_room_key: null,
    OrderIndex: 1,
    mission: "Coordena claim atomico de jobs, heartbeats, fencing_token contra workers zumbis e checkpoints.",
    skills: ["fencing-token-concurrency", "lease-expiry-recovery", "pause-resume-cancel-control"],
    inputs: ["job_queue_state", "worker_daemon_leases"],
    outputs: ["worker_lease_health"],
    guardrails: ["Bloquear conclusao falsa de escrita quando o banco estiver inacessivel (ADR-015)."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["worker", "daemon", "job", "fila", "lease", "fencing"],
  },
  {
    key: "ops.dom_drift_detector",
    lead_key: "automacao_resiliencia",
    division: "engineering_platform",
    display_name: "Detector de Deriva de Seletores DOM (STUDIO_SCHEMA_DRIFT)",
    domain: "browser_scrapers",
    studio_room_key: null,
    OrderIndex: 2,
    mission: "Gerencia cadeias versionadas de seletores nos coletores assistidos e diferencia lista vazia de quebra DOM.",
    skills: ["versioned-selector-chains", "dom-drift-classification", "sanitized-diagnostic-snapshot"],
    inputs: ["scraper_dom_probes", "selector_registry"],
    outputs: ["selector_drift_report"],
    guardrails: ["Nunca mascarar quebra estrutural da pagina como '0 resultados encontrados'."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["scraper", "seletor", "dom", "drift", "youtube studio"],
  },
  {
    key: "ops.upstream_circuit_breaker",
    lead_key: "automacao_resiliencia",
    division: "engineering_platform",
    display_name: "Disjuntor Deslizante Anti-Bloqueio (STUDIO_CIRCUIT_OPEN)",
    domain: "browser_scrapers",
    studio_room_key: null,
    OrderIndex: 3,
    mission: "Protege sessoes abrindo circuito deslizante apos falhas consecutivas e orientando fallback via CSV.",
    skills: ["sliding-window-circuit-breaker", "half-open-probe-recovery", "csv-fallback-routing"],
    inputs: ["selector_drift_report", "upstream_failure_window"],
    outputs: ["circuit_breaker_state"],
    guardrails: ["Cortar execucoes repetidas imediatamente quando o circuito estiver OPEN."],
    depends_on: ["ops.dom_drift_detector"],
    requires_human_gate: false,
    trigger_keywords: ["circuit breaker", "disjuntor", "bloqueio", "resiliencia", "caos"],
  },
  {
    key: "fe.codesplit_shell_architect",
    lead_key: "frontend_qa_caos",
    division: "engineering_platform",
    display_name: "Arquiteto de Shell Modular & Code-Splitting Next.js",
    domain: "frontend_architecture",
    studio_room_key: null,
    OrderIndex: 1,
    mission: "Mantem page.tsx enxuto (< 260 linhas, zero useState local) com next/dynamic por secao e zero estilos inline.",
    skills: ["nextjs-dynamic-codesplitting", "context-shell-isolation", "zero-inline-style-discipline"],
    inputs: ["web_app_shell", "modular_sections"],
    outputs: ["frontend_bundle_audit"],
    guardrails: ["Proibir regressao monolitica em page.tsx."],
    depends_on: [],
    requires_human_gate: false,
    trigger_keywords: ["frontend", "next", "page.tsx", "modular", "code-splitting", "ui"],
  },
  {
    key: "fe.studio_25d_state_reducer",
    lead_key: "frontend_qa_caos",
    division: "engineering_platform",
    display_name: "Engenheiro do Diorama 2.5D, Reducer & Acessibilidade",
    domain: "studio_25d_ui",
    studio_room_key: null,
    OrderIndex: 2,
    mission: "Evolui o palco isometrico 2.5D de 6 salas e 8 agentes com reducer imutavel e foco por teclado.",
    skills: ["immutable-studio-reducer", "isometric-hud-ergonomics", "wcag-keyboard-reduced-motion"],
    inputs: ["studio_components", "studio_reducer_events"],
    outputs: ["studio_ui_verification"],
    guardrails: ["Manter paridade estrita com as 6 salas e 8 agentes do Estudio."],
    depends_on: ["fe.codesplit_shell_architect"],
    requires_human_gate: false,
    trigger_keywords: ["2.5d", "diorama", "reducer", "salas", "hud", "estudio"],
  },
  {
    key: "qa.stress_chaos_gatekeeper",
    lead_key: "frontend_qa_caos",
    division: "engineering_platform",
    display_name: "Guardiao de Gates 4D: Funcional, Seguranca, Estresse & Caos",
    domain: "quality_chaos_engineering",
    studio_room_key: null,
    OrderIndex: 3,
    mission: "Executa baterias de concorrencia, injecao de falhas upstream, seguranca e contratos antes de aprovar entregas.",
    skills: ["4d-gate-verification", "concurrent-stress-harness", "chaos-fault-injection"],
    inputs: ["pytest_suites", "node_frontend_tests", "production_build_check"],
    outputs: ["release_gate_certificate"],
    guardrails: ["Nenhuma subetapa avanca sem 100% dos testes funcionais, seguranca, estresse e caos verdes."],
    depends_on: [
      "eng.http_pool_lifespan_tuner",
      "sec.csrf_origin_sentinel",
      "ops.fencing_lease_recovery",
      "ops.upstream_circuit_breaker",
      "fe.studio_25d_state_reducer",
    ],
    requires_human_gate: false,
    trigger_keywords: ["teste", "testes", "estresse", "stress", "caos", "chaos", "qa", "gate"],
  },
];

function subKeysFor(leadKey: string): string[] {
  return SANDBOX_SUBAGENTS.filter((s) => s.lead_key === leadKey).map((s) => s.key);
}

const SANDBOX_LEADS: OrchestratorLeadDTO[] = [
  {
    key: "dados",
    division: "editorial_runtime",
    display_name: "Analista de Dados",
    role_title: "Lider de Analytics, Sincronizacao OAuth & Metricas Honestas",
    domain: "analytics",
    studio_agent_key: "dados",
    studio_room_key: "sala_dados",
    mission: "Coordena coleta OAuth read-only, integridade de metricas (ausencia != zero) e diagnostico de retencao/CTR.",
    requires_human_approval: false,
    depends_on_leads: [],
    skills: ["youtube-analytics-v2", "honest-null-metrics", "cohort-diagnostics"],
    invariants: ["Metrica privada nao sincronizada permanece UNKNOWN (null), nunca zero fabricado."],
    subagent_keys: subKeysFor("dados"),
  },
  {
    key: "pesquisa",
    division: "editorial_runtime",
    display_name: "Pesquisador",
    role_title: "Lider de Pesquisa, Tendencias & Engenharia Reversa (Fases 1 a 3)",
    domain: "research_intelligence",
    studio_agent_key: "pesquisa",
    studio_room_key: "pesquisa",
    mission: "Comanda descoberta no YouTube Studio, validacao 5y no Google Trends e Fases 1 a 3 de Engenharia Reversa.",
    requires_human_approval: false,
    depends_on_leads: ["dados"],
    skills: ["studio-trends", "google-trends-5y", "reverse-engineering-f1-f3"],
    invariants: ["Extrair mecanismos cognitivos sem copiar temas ou roteiros literalmente."],
    subagent_keys: subKeysFor("pesquisa"),
  },
  {
    key: "estrategia",
    division: "editorial_runtime",
    display_name: "Estrategista Chefe",
    role_title: "Estrategista Chefe, 4 Analistas de Oportunidade & Sintese Fase 4",
    domain: "editorial_strategy",
    studio_agent_key: "estrategia",
    studio_room_key: "mesa_agentes",
    mission: "Orquestra os 4 analistas especializados (Fit, Baseline, Demanda, RAG L2/L3) e sintetiza mecanismo Fase 4.",
    requires_human_approval: true,
    depends_on_leads: ["dados", "pesquisa"],
    skills: ["multi-analyst-opportunity-engine", "hybrid-rag-curation", "phase4-synthesis"],
    invariants: ["Score deterministico e versionado; fontes em quarentena L0 bloqueadas."],
    subagent_keys: subKeysFor("estrategia"),
  },
  {
    key: "titulos",
    division: "editorial_runtime",
    display_name: "Especialista em Titulos",
    role_title: "Lider de Packaging Verbal & Protecao Anti-Plagio",
    domain: "packaging_titles",
    studio_agent_key: "titulos",
    studio_room_key: "mesa_agentes",
    mission: "Transforma o mecanismo editorial em alternativas originais de titulo auditadas contra plagio (< 0.70).",
    requires_human_approval: true,
    depends_on_leads: ["estrategia"],
    skills: ["title-formula-engineering", "lexical-originality-guard"],
    invariants: ["Bloquear aprovacao automaticamente se max_similarity >= 0.70."],
    subagent_keys: subKeysFor("titulos"),
  },
  {
    key: "roteiro",
    division: "editorial_runtime",
    display_name: "Roteirista",
    role_title: "Lider de Roteirizacao Documental & Engenharia de Retencao",
    domain: "script_retention",
    studio_agent_key: "roteiro",
    studio_room_key: "gravacao",
    mission: "Dirige abertura 0-15s, prova 15-30s, tecelagem de evidencias RAG verificadas e loops abertos.",
    requires_human_approval: true,
    depends_on_leads: ["estrategia", "titulos"],
    skills: ["retention-hook-architecture", "rag-grounded-scriptwriting"],
    invariants: ["Zero invencao factual fora das fontes curadas."],
    subagent_keys: subKeysFor("roteiro"),
  },
  {
    key: "thumbnail",
    division: "editorial_runtime",
    display_name: "Designer de Capa",
    role_title: "Lider de Direcao Visual, Contraste Mobile & Anti-Clone",
    domain: "thumbnail_design",
    studio_agent_key: "thumbnail",
    studio_room_key: "design_thumbnail",
    mission: "Cria conceitos visuais com foco unico, texto complementar curto (<= 4 palavras) e auditoria anti-clone.",
    requires_human_approval: true,
    depends_on_leads: ["estrategia", "titulos"],
    skills: ["mobile-first-thumbnail-direction", "visual-originality-check"],
    invariants: ["Texto da capa complementa o titulo sem repeti-lo."],
    subagent_keys: subKeysFor("thumbnail"),
  },
  {
    key: "edicao",
    division: "editorial_runtime",
    display_name: "Editor / Producao",
    role_title: "Lider de Gateway Single-Writer de Producao & Storage",
    domain: "production_gateway",
    studio_agent_key: "edicao",
    studio_room_key: "gravacao",
    mission: "Valida congelamento SHA-256 do EpisodeBrief APPROVED, despacha ProductionIntent idempotente e reconcilia storage.",
    requires_human_approval: false,
    depends_on_leads: ["roteiro", "thumbnail"],
    skills: ["single-writer-production-intent", "sha256-brief-freeze", "storage-reconciliation"],
    invariants: ["Somente EpisodeBrief APPROVED gera ProductionIntent."],
    subagent_keys: subKeysFor("edicao"),
  },
  {
    key: "publicacao",
    division: "editorial_runtime",
    display_name: "Estrategia de Publicacao",
    role_title: "Guardiao de Metadados, Calendario & Publicacao Manual Humana",
    domain: "publication",
    studio_agent_key: "publicacao",
    studio_room_key: "estrategia_publicacao",
    mission: "Consolida pacote final de capitulos/SEO, agenda no calendario e impoe trava de publicacao manual humana.",
    requires_human_approval: true,
    depends_on_leads: ["edicao"],
    skills: ["metadata-packaging", "editorial-calendar", "human-publish-gate"],
    invariants: ["requires_human_publish=true e auto_publish_enabled=false em 100% dos fluxos."],
    subagent_keys: subKeysFor("publicacao"),
  },
  {
    key: "arquitetura_api",
    division: "engineering_platform",
    display_name: "Arquiteto Hexagonal & API de Dominios",
    role_title: "Lider de Arquitetura Limpa, Rotas FastAPI & Performance HTTP",
    domain: "backend_architecture",
    studio_agent_key: null,
    studio_room_key: null,
    mission: "Garante pureza hexagonal em core/, roteamento semantico por dominio e pool TCP/TLS keep-alive.",
    requires_human_approval: false,
    depends_on_leads: [],
    skills: ["hexagonal-architecture", "domain-driven-fastapi", "connection-pool-lifespan"],
    invariants: ["Zero imports de infraestrutura em core/."],
    subagent_keys: subKeysFor("arquitetura_api"),
  },
  {
    key: "dados_seguranca",
    division: "engineering_platform",
    display_name: "Especialista em Banco RLS & Seguranca AppSec",
    role_title: "Lider de Isolamento Multi-Tenant, Cofre de Tokens & Perimetro Auth",
    domain: "security_database",
    studio_agent_key: null,
    studio_room_key: null,
    mission: "Protege isolamento por workspace_id (RLS + RBAC), cofre de credenciais, higiene cliente e anti-CSRF.",
    requires_human_approval: false,
    depends_on_leads: ["arquitetura_api"],
    skills: ["supabase-postgres-rls", "secret-vault-redaction", "jwt-origin-security"],
    invariants: ["Zero vazamento cross-tenant (403 WORKSPACE_FORBIDDEN)."],
    subagent_keys: subKeysFor("dados_seguranca"),
  },
  {
    key: "automacao_resiliencia",
    division: "engineering_platform",
    display_name: "Engenheiro de Workers, Filas & Scrapers Anti-Drift",
    role_title: "Lider de Concorrencia Assincrona, Seletores DOM & Circuit Breakers",
    domain: "workers_scrapers",
    studio_agent_key: null,
    studio_room_key: null,
    mission: "Mantem workers com fencing_token e blinda coletores contra mudancas silenciosas de DOM e bloqueios.",
    requires_human_approval: false,
    depends_on_leads: ["arquitetura_api"],
    skills: ["fencing-lease-workers", "dom-drift-detection", "sliding-circuit-breaker"],
    invariants: ["Quebra de seletor gera STUDIO_SCHEMA_DRIFT explicito, nunca falso vazio."],
    subagent_keys: subKeysFor("automacao_resiliencia"),
  },
  {
    key: "frontend_qa_caos",
    division: "engineering_platform",
    display_name: "Lider de Frontend Modular, Estudio 2.5D & QA de Caos",
    role_title: "Arquiteto Next.js Code-Split, Palco 2.5D & Engenharia de Qualidade 4D",
    domain: "frontend_and_qa",
    studio_agent_key: null,
    studio_room_key: null,
    mission: "Governa a decomposicao modular Next.js, o Estudio 2.5D e a aprovacao nos gates de Estresse e Caos.",
    requires_human_approval: false,
    depends_on_leads: ["arquitetura_api", "dados_seguranca", "automacao_resiliencia"],
    skills: ["nextjs-modular-shell", "studio-25d-reducer", "4d-stress-chaos-testing"],
    invariants: ["page.tsx < 260 linhas com secoes lazy-loaded e zero inline styles."],
    subagent_keys: subKeysFor("frontend_qa_caos"),
  },
];

const SANDBOX_PRESETS: OrchestratorPresetMissionDTO[] = [
  {
    id: "editorial_full_episode",
    title: "Pipeline Completo de Episodio (Dados -> Pesquisa -> Brief -> Roteiro -> Capa -> Publicacao Manual)",
    scope: "editorial",
    objective:
      "Descobrir lacuna sustentavel no nicho do canal, validar outliers Fases 1-4, aprovar oportunidade e titulo original anti-plagio, estruturar roteiro 0-30s com fontes L2/L3, capa mobile, intent de producao e pacote final de publicacao manual.",
  },
  {
    id: "research_reverse_engineering",
    title: "Investigacao Profunda de Outliers & Sustentabilidade 5 Anos (Fases 1 a 4)",
    scope: "editorial",
    objective:
      "Auditar 5-10 canais de referencia (Fase 1), filtrar outliers reais por views por dia (Fase 2), executar autopsia de gancho e comentarios (Fase 3), cruzar Google Trends 5 anos e sintetizar mecanismo Fase 4.",
  },
  {
    id: "engineering_hardening_audit",
    title: "Auditoria Completa de Arquitetura, Seguranca RLS, Scrapers Anti-Drift & Caos 4D",
    scope: "engineering",
    objective:
      "Verificar pureza hexagonal em core, rotas semanticas FastAPI, pool keep-alive, isolamento multi-tenant RLS, higiene de segredos e CSRF, deteccao de drift DOM com circuit breaker nos scrapers e bateria de estresse e caos.",
  },
  {
    id: "full_project_end_to_end",
    title: "Operacao Total DarkForge (12 Agentes Lideres + 40 Subagentes em Todo o Projeto)",
    scope: "full_project",
    objective:
      "Executar coordenacao integrada de todos os dominios editoriais do Estudio 2.5D e todos os subsistemas de engenharia, seguranca, workers, scrapers e qualidade do DarkForge Channel OS.",
  },
];

export const SANDBOX_ORCHESTRATOR_TOPOLOGY: OrchestratorTopologyDTO = {
  master: {
    key: "darkforge-master-orchestrator",
    display_name: "Orquestrador Mestre DarkForge",
    version: "2.0.0",
    mission:
      "Seleciona, ordena em grafo aciclico (DAG) e coordena os 12 Agentes Lideres e 40 Subagentes especializados em todo o ecossistema DarkForge — unindo operacao editorial de canais YouTube e engenharia de plataforma, seguranca, resiliencia e qualidade.",
    routing_policy: [
      "1. Classificar o escopo da missao (editorial, engineering ou full_project) e identificar dominios afetados.",
      "2. Selecionar apenas os Agentes Lideres e Subagentes necessarios e resolver dependencias topologicas (DAG sem ciclos).",
      "3. Aplicar guardrails obrigatorios: honestidade de metricas (UNKNOWN != 0), anti-plagio (< 0.70), isolamento RLS e zero auto-publicacao.",
      "4. Pausar nos gates de aprovacao humana (estrategia, titulos, roteiro, thumbnail, publicacao) e validar bateria 4D.",
    ],
    global_guardrails: [
      "ADR-002: Publicacao sempre manual pelo operador humano (requires_human_publish=true, auto_publish_enabled=false).",
      "ADR-004: Isolamento estrito por workspace_id (RLS + RBAC) e zero exposicao de chaves privilegiadas na camada cliente.",
      "ADR-005: Gateway Single-Writer idempotente para producao externa sem processamento pesado de midia na API/Web.",
      "ADR-007: Determinismo local-first e rastreabilidade completa de evidencias sem fabricar metricas ausentes.",
      "ADR-015: Modo degradado explicito quando infraestrutura critica estiver indisponivel — zero falso sucesso.",
    ],
    lead_agent_keys: SANDBOX_LEADS.map((l) => l.key),
    total_leads: SANDBOX_LEADS.length,
    total_subagents: SANDBOX_SUBAGENTS.length,
  },
  leads: SANDBOX_LEADS,
  subagents: SANDBOX_SUBAGENTS,
  PresetMissions: SANDBOX_PRESETS,
};

function topologicalSortSandbox(selectedKeys: Set<string>): OrchestratorSubagentDTO[] {
  const byKey = new Map(SANDBOX_SUBAGENTS.map((s) => [s.key, s]));
  const expanded = new Set<string>();

  const expand = (k: string) => {
    if (expanded.has(k)) return;
    const item = byKey.get(k);
    if (!item) return;
    expanded.add(k);
    for (const dep of item.depends_on) {
      expand(dep);
    }
  };
  for (const k of selectedKeys) expand(k);

  const orderIdx = new Map(SANDBOX_SUBAGENTS.map((s, idx) => [s.key, idx]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const k of expanded) {
    inDegree.set(k, 0);
    dependents.set(k, []);
  }
  for (const k of expanded) {
    const item = byKey.get(k)!;
    for (const dep of item.depends_on) {
      if (expanded.has(dep)) {
        inDegree.set(k, (inDegree.get(k) ?? 0) + 1);
        dependents.get(dep)!.push(k);
      }
    }
  }

  const ready = [...expanded]
    .filter((k) => (inDegree.get(k) ?? 0) === 0)
    .sort((a, b) => (orderIdx.get(a) ?? 0) - (orderIdx.get(b) ?? 0));

  const out: OrchestratorSubagentDTO[] = [];
  while (ready.length > 0) {
    const cur = ready.shift()!;
    out.push(byKey.get(cur)!);
    for (const nxt of dependents.get(cur) ?? []) {
      const nextDeg = (inDegree.get(nxt) ?? 1) - 1;
      inDegree.set(nxt, nextDeg);
      if (nextDeg === 0) {
        ready.push(nxt);
      }
    }
    ready.sort((a, b) => (orderIdx.get(a) ?? 0) - (orderIdx.get(b) ?? 0));
  }
  return out;
}

export function buildSandboxMissionPlan(body: {
  objective: string;
  scope?: MissionScopeKey;
  lead_keys?: string[];
  subagent_keys?: string[];
}): OrchestratorPlanDTO {
  const scope = body.scope ?? "full_project";
  const cleanObjective = body.objective.trim();
  const leadByKey = new Map(SANDBOX_LEADS.map((l) => [l.key, l]));

  let selected = new Set<string>();
  if (body.subagent_keys && body.subagent_keys.length > 0) {
    selected = new Set(body.subagent_keys);
  } else if (body.lead_keys && body.lead_keys.length > 0) {
    const lk = new Set(body.lead_keys);
    selected = new Set(SANDBOX_SUBAGENTS.filter((s) => lk.has(s.lead_key)).map((s) => s.key));
  } else if (scope === "full_project") {
    selected = new Set(SANDBOX_SUBAGENTS.map((s) => s.key));
  } else {
    const targetDiv: AgentDivisionKey = scope === "editorial" ? "editorial_runtime" : "engineering_platform";
    const low = cleanObjective.toLowerCase();
    for (const s of SANDBOX_SUBAGENTS) {
      if (s.division !== targetDiv) continue;
      if (s.trigger_keywords.some((kw) => low.includes(kw))) {
        selected.add(s.key);
      }
    }
    if (selected.size === 0) {
      selected = new Set(SANDBOX_SUBAGENTS.filter((s) => s.division === targetDiv).map((s) => s.key));
    }
  }

  const ordered = topologicalSortSandbox(selected);
  const seenLeads: string[] = [];
  const steps: OrchestratorPlanStepDTO[] = ordered.map((sub, idx) => {
    const lead = leadByKey.get(sub.lead_key)!;
    if (!seenLeads.includes(lead.key)) seenLeads.push(lead.key);
    return {
      step_order: idx + 1,
      lead_key: lead.key,
      lead_display_name: lead.display_name,
      subagent_key: sub.key,
      subagent_display_name: sub.display_name,
      division: sub.division,
      domain: sub.domain,
      studio_room_key: sub.studio_room_key,
      skills_activated: [...sub.skills],
      expected_inputs: [...sub.inputs],
      expected_outputs: [...sub.outputs],
      guardrails_enforced: [...sub.guardrails],
      depends_on: [...sub.depends_on],
      requires_human_gate: sub.requires_human_gate,
      rationale: sub.mission,
    };
  });

  return {
    plan_id: `plan-sb-${steps.length}-${cleanObjective.length}`,
    objective: cleanObjective,
    scope,
    selected_lead_keys: seenLeads,
    selected_subagent_keys: ordered.map((s) => s.key),
    steps,
    human_gates_count: ordered.filter((s) => s.requires_human_gate).length,
    validation_gates: [
      "Gate 1 — Contratos & Pureza Hexagonal (core/ sem acoplamento HTTP/UI)",
      "Gate 2 — Seguranca AppSec, Isolamento RLS & Anti-Plagio (< 0.70)",
      "Gate 3 — Estresse Concorrente & Reuso de Conexoes",
      "Gate 4 — Engenharia de Caos (Drift DOM, Circuit Breaker & Modo Degradado)",
    ],
    limitations: [
      "Execucao deterministica local-first (ADR-007): metricas ausentes permanecem UNKNOWN ate sincronizacao real.",
      "Publicacao final no YouTube permanece 100% manual pelo operador humano (ADR-002).",
    ],
  };
}
