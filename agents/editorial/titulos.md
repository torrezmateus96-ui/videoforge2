# Agente Líder: Especialista Títulos (`titulos`)

- **Divisão**: `editorial_runtime`
- **Título Operacional**: Lider de Packaging Verbal & Protecao Anti-Plagio
- **Domínio**: `packaging_titles`
- **Sala do Estúdio 2.5D**: `mesa_agentes`
- **Aprovação Humana Direta**: `False`
- **Skills Principais**: `title-formula-engineering`, `lexical-originality-guard`

## Missão
Transforma o mecanismo editorial em alternativas originais de titulo auditadas contra plagio lexical (< 0.70).

## Invariantes Invioláveis
- Bloquear aprovacao automaticamente se max_similarity >= 0.70.

## Subagentes Especializados (3)

### 1. Extrator de Formula Estrutural de Packaging (`titulos.formula_extractor`)
- **Domínio**: `packaging_titles` · **Gate Humano**: `False`
- **Missão**: Decompoe titulos de referencia em padroes sintaticos, gatilhos de tensao, ancoras numericas e extensao mobile (<= 60 chars).
- **Skills**: `title-syntax-decomposition`, `mobile-truncation-check`
- **Entradas**: `episode_brief_draft`, `reference_titles`
- **Saídas**: `editorial_title_formulas`, `structural_constraints`
- **Dependências DAG**: `estrategia.transferable_mechanism_f4`
- **Guardrails**: Extrair padrao abstrato, nunca reaproveitar nomes ou frases exclusivas do concorrente.

### 2. Redator de Alternativas com Lacuna de Curiosidade (`titulos.curiosity_gap_writer`)
- **Domínio**: `packaging_titles` · **Gate Humano**: `False`
- **Missão**: Gera de 3 a 5 alternativas originais de alto contraste cognitivo alinhadas a voz do canal e a promessa real do video.
- **Skills**: `curiosity-gap-copywriting`, `anti-clickbait-promise-alignment`
- **Entradas**: `editorial_title_formulas`, `channel_voice`
- **Saídas**: `title_candidates_list`
- **Dependências DAG**: `titulos.formula_extractor`
- **Guardrails**: Toda promessa do titulo deve ser cumprida nos primeiros 30 segundos do roteiro.

### 3. Guardiao Anti-Plagio & Similaridade Lexical (< 0.70) (`titulos.anti_plagiarism_guard`)
- **Domínio**: `packaging_titles` · **Gate Humano**: `True`
- **Missão**: Calcula similaridade lexical/trigrama contra todos os titulos de referencia e bloqueia candidatos com similaridade >= 0.70.
- **Skills**: `trigram-cosine-similarity`, `originality-gate-blocker`
- **Entradas**: `title_candidates_list`, `reference_titles`
- **Saídas**: `approved_original_titles`, `similarity_audit_matrix`
- **Dependências DAG**: `titulos.curiosity_gap_writer`
- **Guardrails**: Bloqueio deterministico obrigatorio (approval_blocked=true) quando max_similarity >= 0.70.
