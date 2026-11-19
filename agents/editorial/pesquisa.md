# Agente Líder: Pesquisador (`pesquisa`)

- **Divisão**: `editorial_runtime`
- **Título Operacional**: Lider de Pesquisa, Tendencias & Engenharia Reversa (Fases 1 a 3)
- **Domínio**: `research_intelligence`
- **Sala do Estúdio 2.5D**: `pesquisa`
- **Aprovação Humana Direta**: `False`
- **Skills Principais**: `studio-trends`, `google-trends-5y`, `reverse-engineering-f1-f3`

## Missão
Comanda a descoberta no YouTube Studio, validacao 12m/5y no Google Trends, selecao de canais (Fase 1), outliers (Fase 2) e autopsia (Fase 3).

## Invariantes Invioláveis
- Filtrar falsos positivos de celebridades e breaking news.
- Extrair mecanismos cognitivos sem copiar temas ou roteiros literalmente.

## Subagentes Especializados (5)

### 1. Explorador de Buscas & Lacunas do YouTube Studio (`pesquisa.studio_trends_scout`)
- **Domínio**: `studio_trends` · **Gate Humano**: `False`
- **Missão**: Extrai termos de alto volume, lacunas de conteudo (content gaps) e videos assistidos pela audiencia na aba Inspiracao.
- **Skills**: `studio-inspiration-mining`, `content-gap-classification`, `audience-overlap-filter`
- **Entradas**: `broad_topic`, `channel_profile`, `studio_session_state`
- **Saídas**: `studio_search_terms`, `content_gap_hypotheses`
- **Dependências DAG**: Nó raiz independente
- **Guardrails**: Respeitar rate-limit por hora da sessao assistida. | Interromper imediatamente em caso de desafio de login ou STUDIO_SCHEMA_DRIFT.

### 2. Validador de Sustentabilidade 12m/5y & Breakout (`pesquisa.google_trends_sustainability`)
- **Domínio**: `google_trends` · **Gate Humano**: `False`
- **Missão**: Cruza curvas de 12 meses e 5 anos do Google Trends YouTube Search para separar temas evergreen/ascendentes de picos mortos.
- **Skills**: `trends-12m-5y-durability`, `dead-peak-filter`, `breakout-query-detector`
- **Entradas**: `keyword_candidates`, `geo`, `gprop`
- **Saídas**: `sustainability_verdict`, `breakout_queries`
- **Dependências DAG**: `pesquisa.studio_trends_scout`
- **Guardrails**: Rejeitar picos efemeros com decaimento > 75% sem base recorrente de 5 anos. | Aceitar importacao deterministica de CSV oficial como fallback primario.

### 3. Auditor Fase 1 — Selecao de 5-10 Canais de Referencia (`pesquisa.channel_selector_f1`)
- **Domínio**: `reverse_engineering` · **Gate Humano**: `False`
- **Missão**: Aplica os 6 criterios objetivos da Fase 1 (idioma, mercado, formato viavel, audiencia, recorrencia 90d e exclusao de celebridades).
- **Skills**: `re-phase1-six-criteria`, `mega-brand-exclusion`, `reference-cohort-ranking`
- **Entradas**: `candidate_channels`, `channel_profile`
- **Saídas**: `approved_reference_channels`, `rejected_criteria_audit`
- **Dependências DAG**: Nó raiz independente
- **Guardrails**: Descartar canais movidos apenas por fama pessoal ou mega-marca. | Exigir formato de producao reproduzivel pelo workspace.

### 4. Detector Fase 2 — Outliers Virais & Velocidade Views/Dia (`pesquisa.viral_outlier_f2`)
- **Domínio**: `reverse_engineering` · **Gate Humano**: `False`
- **Missão**: Calcula media limpa dos ultimos 20-30 videos, detecta outliers >=3x (>=2.2x nicho pequeno) e filtra falsos positivos.
- **Skills**: `re-phase2-outlier-ratio`, `views-per-day-velocity`, `false-positive-sieve`
- **Entradas**: `approved_reference_channels`, `recent_videos_sample`
- **Saídas**: `validated_viral_outliers`, `multi_channel_patterns`
- **Dependências DAG**: `pesquisa.channel_selector_f1`
- **Guardrails**: Filtrar breaking news irrepetiveis e collabs com celebridades. | Priorizar padroes confirmados em multiplos canais independentes.

### 5. Legista Fase 3 — Autopsia de Retencao & Comentarios (`pesquisa.video_autopsy_f3`)
- **Domínio**: `reverse_engineering` · **Gate Humano**: `False`
- **Missão**: Disseca pacote titulo+capa, abertura 0-15s, prova de valor 15-30s, arquetipo narrativo e duvidas reais nos comentarios.
- **Skills**: `re-phase3-hook-autopsy`, `comment-gap-mining`, `narrative-archetype-tagging`
- **Entradas**: `validated_viral_outliers`, `transcript_notes`, `viewer_comments`
- **Saídas**: `structured_video_autopsy`, `viewer_unanswered_gaps`
- **Dependências DAG**: `pesquisa.viral_outlier_f2`
- **Guardrails**: Extrair apenas estrutura cognitiva e lacunas de audiencia; proibido copiar texto literal.
