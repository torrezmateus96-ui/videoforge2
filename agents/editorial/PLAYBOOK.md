# Playbook Operacional — Divisão Editorial & Channel OS 2.5D (`editorial_runtime`)

Este playbook define os contratos de entrada/saída, skills e guardrails invioláveis dos **8 Agentes Líderes do Estúdio 2.5D** e de seus **28 Subagentes Especializados**.

---

## 1. Squad `dados` — Sala de Dados (`sala_dados`)
- **Missão do Líder**: Garantir leitura honesta do desempenho real do canal sem jamais fabricar zeros para métricas não sincronizadas.
- **Subagentes**:
  1. `dados.sync_auditor`: Verifica escopos OAuth read-only, estado de frescor (`freshness_status`) e consumo da quota diária da YouTube API.
  2. `dados.metric_integrity`: Aplica a regra canônica `availability="unknown"` e `value_num=null` quando não há sincronização OAuth privada.
  3. `dados.retention_cohort`: Diagnostica janelas de 7d/28d/90d, quedas nos primeiros 30s e anomalias de CTR por formato.

## 2. Squad `pesquisa` — Sala de Pesquisa (`pesquisa`)
- **Missão do Líder**: Identificar demanda comprovada e executar as Fases 1 a 3 da Engenharia Reversa sem copiar concorrentes.
- **Subagentes**:
  1. `pesquisa.studio_trends_scout`: Extrai buscas principais e lacunas de conteúdo (`content_gap`) do YouTube Studio Inspiration.
  2. `pesquisa.google_trends_sustainability`: Valida curvas de 12 meses e 5 anos no Google Trends YouTube Search (ou via CSV oficial), filtrando picos mortos e destacando *Breakout Queries*.
  3. `pesquisa.channel_selector_f1`: Audita os 6 critérios objetivos para aprovar de 5 a 10 canais de referência (excluindo celebridades e mega-marcas).
  4. `pesquisa.viral_outlier_f2`: Calcula baseline limpa dos últimos 20–30 vídeos, detecta outliers `>= 3x` (`>= 2.2x` em nichos menores), mede velocidade `views/dia` e remove falsos positivos.
  5. `pesquisa.video_autopsy_f3`: Disseca promessa visual/verbal, gancho `0–15s`, prova `15–30s`, arquétipo narrativo e perguntas não respondidas nos comentários.

## 3. Squad `estrategia` — Mesa de Agentes (`mesa_agentes` · Gate Humano)
- **Missão do Líder**: Consolidar os 4 analistas independentes e sintetizar a Fase 4 em `Opportunity` versionada e `EpisodeBrief`.
- **Subagentes**:
  1. `estrategia.profile_fit_analyst`: Confere aderência ao `ChannelProfileVersion` vigente e bloqueia `forbidden_topics`.
  2. `estrategia.analytics_baseline_analyst`: Pondera aderência histórica com o catálogo próprio e calibra `insufficient_data`.
  3. `estrategia.public_demand_analyst`: Triangula demanda pública versus saturação multi-canal.
  4. `estrategia.rag_evidence_analyst`: Recupera exclusivamente chunks curados `L2`/`L3` (excluindo quarentena `L0`) em blocos protegidos contra *prompt injection*.
  5. `estrategia.transferable_mechanism_f4`: Sintetiza `[Tema Próprio] + [Ângulo Novo] + [Emoção] + [Estrutura]` e submete à aprovação humana.

## 4. Squad `titulos` — Mesa de Agentes (`mesa_agentes` · Gate Humano)
- **Missão do Líder**: Criar embalagens verbais magnéticas, concisas para mobile e 100% livres de plágio.
- **Subagentes**:
  1. `titulos.formula_extractor`: Extrai fórmulas sintáticas abstratas e valida corte mobile (`<= 60` caracteres).
  2. `titulos.curiosity_gap_writer`: Redige 3–5 candidatos originais alinhados à voz editorial e à entrega real dos primeiros 30 segundos.
  3. `titulos.anti_plagiarism_guard`: Calcula similaridade trigrama/cosseno contra referências e trava automaticamente (`approval_blocked=true`) caso `max_similarity >= 0.70`.

## 5. Squad `roteiro` — Sala de Gravação (`gravacao` · Gate Humano)
- **Missão do Líder**: Construir narrativa documental de alta retenção baseada em fontes verificáveis.
- **Subagentes**:
  1. `roteiro.hook_0_30s_architect`: Escreve abertura `0–15s` sem rodeios e prova concreta de valor `15–30s`.
  2. `roteiro.rag_citation_weaver`: Costura evidências `L2`/`L3` nos atos narrativos mantendo mapa de proveniência factual.
  3. `roteiro.narrative_pacing_editor`: Distribui loops abertos a cada 60–90s, clímax resolutivo e encerramento orgânico.

## 6. Squad `thumbnail` — Design & Thumbnail (`design_thumbnail` · Gate Humano)
- **Missão do Líder**: Projetar capas legíveis em mobile que formam um único argumento com o título sem repeti-lo.
- **Subagentes**:
  1. `thumbnail.visual_composition_director`: Define silhueta limpa com até 2 elementos focais dominantes.
  2. `thumbnail.contrast_overlay_copy`: Define paleta de alto contraste e texto complementar curto (`0–4` palavras).
  3. `thumbnail.visual_originality_auditor`: Audita originalidade visual contra clonagem de identidade de terceiros.

## 7. Squad `edicao` — Sala de Gravação (`gravacao`)
- **Missão do Líder**: Operar o Gateway *Single-Writer* (`ADR-005`) para produção externa auditável.
- **Subagentes**:
  1. `edicao.brief_freeze_validator`: Exige `EpisodeBrief` no estado `APPROVED` e valida integridade `content_sha256`.
  2. `edicao.idempotent_intent_dispatcher`: Registra e despacha `ProductionIntent` com `Idempotency-Key` sem executar renderização pesada na API/Web.
  3. `edicao.manifest_checksum_verifier`: Verifica manifesto de artefatos e reconcilia objetos nos buckets de storage.

## 8. Squad `publicacao` — Estratégia de Publicação (`estrategia_publicacao` · Gate Humano Absoluto)
- **Missão do Líder**: Preparar lançamento completo mantendo controle final 100% humano (`ADR-002`).
- **Subagentes**:
  1. `publicacao.metadata_seo_packager`: Gera descrição otimizada, capítulos verificados, tags e comentário fixado.
  2. `publicacao.editorial_calendar_scheduler`: Agenda janela ideal no calendário com `auto_publish_enabled=false`.
  3. `publicacao.human_gate_enforcer`: Valida checklist final de direitos/compliance e retém `requires_human_publish=true`.
