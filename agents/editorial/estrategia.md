# Agente Líder: Estrategista (`estrategia`)

- **Divisão**: `editorial_runtime`
- **Título Operacional**: Estrategista Chefe, 4 Analistas de Oportunidade & Sintese Fase 4
- **Domínio**: `editorial_strategy`
- **Sala do Estúdio 2.5D**: `mesa_agentes`
- **Aprovação Humana Direta**: `True`
- **Skills Principais**: `multi-analyst-opportunity-engine`, `hybrid-rag-curation`, `phase4-synthesis`

## Missão
Orquestra os 4 analistas especializados (Fit, Baseline, Demanda, RAG L2/L3) e sintetiza o mecanismo transferivel em Opportunity e EpisodeBrief.

## Invariantes Invioláveis
- Score deterministico e versionado com limitacoes explicitas.
- Fontes em quarentena (L0) sao bloqueadas no RAG.

## Subagentes Especializados (5)

### 1. Analista de Aderencia ao Perfil Editorial (`estrategia.profile_fit_analyst`)
- **Domínio**: `opportunities` · **Gate Humano**: `False`
- **Missão**: Avalia alinhamento estrito da pauta com nicho, posicionamento, pilares ativos e topicos proibidos da versao vigente do canal.
- **Skills**: `editorial-profile-fit`, `forbidden-topic-blocker`, `voice-consistency-check`
- **Entradas**: `channel_profile_version`, `topic_candidate`
- **Saídas**: `editorial_fit_report`, `restriction_verdict`
- **Dependências DAG**: Nó raiz independente
- **Guardrails**: Bloquear imediatamente qualquer pauta que viole restrictions_json.forbidden_topics.

### 2. Analista de Baseline Historica do Canal (`estrategia.analytics_baseline_analyst`)
- **Domínio**: `opportunities` · **Gate Humano**: `False`
- **Missão**: Cruza a hipotese tematica com o historico real do canal proprio, sinalizando confianca reduzida caso faltem dados sincronizados.
- **Skills**: `own-channel-baseline`, `confidence-calibration`, `format-fit-scoring`
- **Entradas**: `validated_metric_snapshot`, `cohort_diagnosis`
- **Saídas**: `analytics_analyst_report`, `confidence_weight`
- **Dependências DAG**: `dados.metric_integrity`
- **Guardrails**: Marcar insufficient_data=true quando nao houver baseline sincronizada.

### 3. Analista de Demanda Publica & Competicao (`estrategia.public_demand_analyst`)
- **Domínio**: `opportunities` · **Gate Humano**: `False`
- **Missão**: Consolida sinais do YouTube Studio, Google Trends e outliers multi-canal para quantificar demanda real versus saturacao.
- **Skills**: `demand-vs-saturation-matrix`, `multi-source-triangulation`
- **Entradas**: `studio_search_terms`, `sustainability_verdict`, `multi_channel_patterns`
- **Saídas**: `demand_competition_report`, `saturation_index`
- **Dependências DAG**: `pesquisa.studio_trends_scout`, `pesquisa.google_trends_sustainability`
- **Guardrails**: Exigir ao menos uma evidencia rastreavel antes de atribuir demanda alta.

### 4. Analista de Evidencias Curadas (Knowledge L2/L3) (`estrategia.rag_evidence_analyst`)
- **Domínio**: `knowledge_rag` · **Gate Humano**: `False`
- **Missão**: Recupera apenas chunks aprovados em curadoria L2/L3 com busca hibrida FTS + vetorial para embasar angulo e diferenciacao.
- **Skills**: `hybrid-rag-l2-l3`, `quarantine-l0-exclusion`, `source-rights-verification`
- **Entradas**: `workspace_knowledge_index`, `topic_candidate`
- **Saídas**: `verified_rag_citations`, `context_sufficiency_flag`
- **Dependências DAG**: Nó raiz independente
- **Guardrails**: Fontes L0 em quarentena nunca entram no indice nem em geracoes. | Isolar conteudo recuperado em delimitadores seguros contra prompt injection.

### 5. Sintetizador Fase 4 — Mecanismo Transferivel & Score (`estrategia.transferable_mechanism_f4`)
- **Domínio**: `opportunities` · **Gate Humano**: `True`
- **Missão**: Une os 4 relatorios analiticos e a Fase 4 ([Tema Proprio] + [Angulo Novo] + [Emocao] + [Estrutura]) gerando Opportunity e EpisodeBrief.
- **Skills**: `re-phase4-mechanism-synthesis`, `versioned-opportunity-scoring`, `episode-brief-drafting`
- **Entradas**: `editorial_fit_report`, `analytics_analyst_report`, `demand_competition_report`, `verified_rag_citations`
- **Saídas**: `ranked_opportunity`, `episode_brief_draft`
- **Dependências DAG**: `estrategia.profile_fit_analyst`, `estrategia.analytics_baseline_analyst`, `estrategia.public_demand_analyst`, `estrategia.rag_evidence_analyst`
- **Guardrails**: Score transparente e versionado; jamais prometer fine-tuning automatico. | Requer aprovacao humana explicita antes de travar o EpisodeBrief.
