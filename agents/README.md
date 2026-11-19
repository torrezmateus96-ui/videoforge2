# Arquitetura Completa de Agentes & Subagentes — DarkForge Channel OS

Este diretório materializa a frota completa de inteligência operacional e de engenharia do **DarkForge Channel OS**, coordenada pelo **Orquestrador Mestre (`darkforge-master-orchestrator`)** sobre um grafo acíclico direcionado (**DAG**) sem ciclos, com isolamento multi-tenant (`workspace_id` + RLS) e aprovação humana obrigatória nos pontos críticos.

---

## Visão Numérica da Frota

| Camada | Quantidade | Escopo |
| :--- | ---: | :--- |
| **Orquestrador Mestre** | `1` | Roteamento topológico (DAG), seleção de agentes/skills, aplicação de guardrails ADR-002/004/005/007/015 e validação 4D |
| **Divisão A — Editorial & Estúdio 2.5D** | `8` Agentes Líderes + `28` Subagentes | Analytics OAuth, Studio Trends, Google Trends 5y, Engenharia Reversa (Fases 1–4), RAG L2/L3, Oportunidades, Títulos Anti-Plágio, Roteiro 0–30s, Thumbnail, Produção Single-Writer e Publicação Manual |
| **Divisão B — Engenharia, Segurança & Caos** | `4` Agentes Líderes + `12` Subagentes | Pureza Hexagonal (`core/`), Rotas Semânticas FastAPI, Pool Keep-Alive, Banco RLS/RBAC, Cofre de Tokens/AppSec, Workers Fencing Lease, Scrapers Anti-Drift/Circuit Breaker, Frontend Modular Next.js e Gates 4D |
| **Total Operacional** | **`53` Unidades** | Cobertura de **100%** dos domínios funcionais e técnicos do projeto |

---

## Mapa Hierárquico Completo

### 0. Orquestrador Mestre (`darkforge-master-orchestrator`)
- **Código executável**: `core/orchestrator/service.py` (`ProjectOrchestratorService`)
- **API REST**: `GET /api/v1/orchestrator/topology`, `POST /api/v1/orchestrator/plan`, `POST /api/v1/orchestrator/execute`
- **UI**: Seção modular `Orquestrador & Agentes` (`apps/web/src/components/sections/AgentsFleetSection.tsx`)

### Divisão A — Editorial & Channel OS Runtime (`editorial_runtime`)
1. **`dados` — Analista de Dados** *(Sala de Dados)*
   - `dados.sync_auditor` — Auditor de Sincronização & Cursores OAuth
   - `dados.metric_integrity` — Validador de Integridade & Disponibilidade Honesta (`UNKNOWN != 0`)
   - `dados.retention_cohort` — Analista de Coortes, CTR & Retenção 28d/90d
2. **`pesquisa` — Pesquisador & Inteligência** *(Sala de Pesquisa)*
   - `pesquisa.studio_trends_scout` — Explorador de Buscas & Lacunas do YouTube Studio
   - `pesquisa.google_trends_sustainability` — Validador de Sustentabilidade 12m/5y & Breakout
   - `pesquisa.channel_selector_f1` — Auditor Fase 1 (Seleção de 5–10 Canais de Referência)
   - `pesquisa.viral_outlier_f2` — Detector Fase 2 (Outliers Virais & Velocidade Views/Dia)
   - `pesquisa.video_autopsy_f3` — Legista Fase 3 (Autópsia 0–15s/15–30s & Comentários)
3. **`estrategia` — Estrategista Chefe** *(Mesa de Agentes — Gate Humano)*
   - `estrategia.profile_fit_analyst` — Analista de Aderência ao Perfil Editorial
   - `estrategia.analytics_baseline_analyst` — Analista de Baseline Histórica do Canal
   - `estrategia.public_demand_analyst` — Analista de Demanda Pública & Competição
   - `estrategia.rag_evidence_analyst` — Analista de Evidências Curadas (Knowledge L2/L3)
   - `estrategia.transferable_mechanism_f4` — Sintetizador Fase 4 (Mecanismo Transferível & Score)
4. **`titulos` — Especialista em Títulos** *(Mesa de Agentes — Gate Humano)*
   - `titulos.formula_extractor` — Extrator de Fórmula Estrutural de Packaging
   - `titulos.curiosity_gap_writer` — Redator de Alternativas com Lacuna de Curiosidade
   - `titulos.anti_plagiarism_guard` — Guardião Anti-Plágio & Similaridade Lexical (`< 0.70`)
5. **`roteiro` — Roteirista** *(Sala de Gravação — Gate Humano)*
   - `roteiro.hook_0_30s_architect` — Arquiteto de Gancho 0–15s & Prova de Valor 15–30s
   - `roteiro.rag_citation_weaver` — Tecelão Documental de Evidências & Citações RAG
   - `roteiro.narrative_pacing_editor` — Editor de Ritmo, Loops Abertos & Clímax
6. **`thumbnail` — Designer de Capa** *(Design & Thumbnail — Gate Humano)*
   - `thumbnail.visual_composition_director` — Diretor de Composição Visual & Foco Único
   - `thumbnail.contrast_overlay_copy` — Especialista em Contraste Cromático & Texto Curto (`<= 4` palavras)
   - `thumbnail.visual_originality_auditor` — Auditor de Originalidade Visual Anti-Clone
7. **`edicao` — Editor / Produção** *(Sala de Gravação)*
   - `edicao.brief_freeze_validator` — Validador de Congelamento & Hash SHA-256 do Brief
   - `edicao.idempotent_intent_dispatcher` — Despachante Idempotente Single-Writer (`ADR-005`)
   - `edicao.manifest_checksum_verifier` — Verificador de Manifesto & Reconciliação de Storage
8. **`publicacao` — Estratégia de Publicação** *(Estratégia de Publicação — Gate Humano Absoluto)*
   - `publicacao.metadata_seo_packager` — Empacotador de Descrição, Capítulos & Metadados
   - `publicacao.editorial_calendar_scheduler` — Agendador de Janela & Calendário Editorial
   - `publicacao.human_gate_enforcer` — Fiscal de Publicação Humana Obrigatória (`ADR-002`)

### Divisão B — Engenharia, Segurança, Dados & Caos (`engineering_platform`)
9. **`arquitetura_api` — Arquiteto Hexagonal & API de Domínios**
   - `eng.core_boundary_guardian` — Fiscal de Pureza Hexagonal do Domínio (`core/`)
   - `eng.domain_router_architect` — Arquiteto de Rotas Semânticas FastAPI & OpenAPI
   - `eng.http_pool_lifespan_tuner` — Especialista em Pool TCP/TLS Keep-Alive & Lifespan
10. **`dados_seguranca` — Especialista em Banco RLS & Segurança AppSec**
    - `sec.rls_tenant_isolator` — Auditor de Isolamento Multi-Tenant RLS & RBAC
    - `sec.secret_vault_hygiene` — Guardião de Cofre Criptográfico & Higiene de Segredos
    - `sec.csrf_origin_sentinel` — Sentinela de Origem Confiável, JWT & Anti-CSRF
11. **`automacao_resiliencia` — Engenheiro de Workers, Filas & Scrapers Anti-Drift**
    - `ops.fencing_lease_recovery` — Controlador de Leases `fencing_token` & Recuperação de Jobs
    - `ops.dom_drift_detector` — Detector de Deriva de Seletores DOM (`STUDIO_SCHEMA_DRIFT`)
    - `ops.upstream_circuit_breaker` — Disjuntor Deslizante Anti-Bloqueio (`STUDIO_CIRCUIT_OPEN`)
12. **`frontend_qa_caos` — Líder de Frontend Modular, Estúdio 2.5D & QA de Caos**
    - `fe.codesplit_shell_architect` — Arquiteto de Shell Modular & Code-Splitting Next.js
    - `fe.studio_25d_state_reducer` — Engenheiro do Diorama 2.5D, Reducer & Acessibilidade
    - `qa.stress_chaos_gatekeeper` — Guardião de Gates 4D (Funcional, Segurança, Estresse & Caos)

---

## Playbooks Detalhados
- [Playbook da Divisão Editorial (`editorial/PLAYBOOK.md`)](./editorial/PLAYBOOK.md)
- [Playbook da Divisão de Engenharia & Caos (`engineering/PLAYBOOK.md`)](./engineering/PLAYBOOK.md)
- [Manifesto Estruturado (`manifest.json`)](./manifest.json)
