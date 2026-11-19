# Agente Líder: Designer de Capa (`thumbnail`)

- **Divisão**: `editorial_runtime`
- **Título Operacional**: Lider de Direcao Visual, Contraste Mobile & Anti-Clone
- **Domínio**: `thumbnail_design`
- **Sala do Estúdio 2.5D**: `design_thumbnail`
- **Aprovação Humana Direta**: `False`
- **Skills Principais**: `mobile-first-thumbnail-direction`, `visual-originality-check`

## Missão
Cria conceitos visuais de alto impacto com foco unico, texto complementar curto (<= 4 palavras) e auditoria anti-clone.

## Invariantes Invioláveis
- Texto da capa complementa o titulo sem repeti-lo.

## Subagentes Especializados (3)

### 1. Diretor de Composicao Visual & Foco Unico (`thumbnail.visual_composition_director`)
- **Domínio**: `thumbnail_design` · **Gate Humano**: `False`
- **Missão**: Define enquadramento de no maximo 2 elementos dominantes, direcao do olhar e pergunta visual imediata em telas pequenas.
- **Skills**: `two-element-focal-rule`, `mobile-silhouette-legibility`, `visual-tension-framing`
- **Entradas**: `approved_original_titles`, `episode_brief_draft`
- **Saídas**: `visual_composition_blueprint`
- **Dependências DAG**: `titulos.anti_plagiarism_guard`
- **Guardrails**: Proibir poluicao visual com mais de 3 pontos focais concorrentes.

### 2. Especialista em Contraste Cromático & Texto Curto (`thumbnail.contrast_overlay_copy`)
- **Domínio**: `thumbnail_design` · **Gate Humano**: `False`
- **Missão**: Cria texto de sobreposicao complementar ao titulo (0 a 4 palavras, sem repetir o titulo) e paleta de alto contraste.
- **Skills**: `four-word-overlay-limit`, `title-complementarity-check`, `wcag-mobile-contrast`
- **Entradas**: `visual_composition_blueprint`, `approved_original_titles`
- **Saídas**: `thumbnail_overlay_variants`, `color_contrast_spec`
- **Dependências DAG**: `thumbnail.visual_composition_director`
- **Guardrails**: Nunca repetir exatamente as mesmas palavras do titulo na arte da thumbnail.

### 3. Auditor de Originalidade Visual Anti-Clone (`thumbnail.visual_originality_auditor`)
- **Domínio**: `thumbnail_design` · **Gate Humano**: `True`
- **Missão**: Verifica que os conceitos de capa nao clonam layout, tipografia ou ativos protegidos de canais concorrentes.
- **Skills**: `visual-clone-prevention`, `asset-rights-check`
- **Entradas**: `thumbnail_overlay_variants`, `structured_video_autopsy`
- **Saídas**: `validated_thumbnail_package`
- **Dependências DAG**: `thumbnail.contrast_overlay_copy`
- **Guardrails**: Bloquear qualquer instrucao que imite identidade visual proprietaria de terceiros.
