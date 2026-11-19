# Playbook de Engenharia, Segurança, Resiliência & Caos (`engineering_platform`)

Este playbook governa os **4 Agentes Líderes de Plataforma** e seus **12 Subagentes Especializados** responsáveis por arquitetura limpa, isolamento multi-tenant, estabilidade de automação e validação 4D contínua.

---

## 9. Squad `arquitetura_api` — Arquitetura Hexagonal & Rotas de Domínio
- **Subagentes**:
  1. `eng.core_boundary_guardian`: Garante que `core/**` nunca importe frameworks HTTP, clientes de rede, JWT ou motores de navegador, mantendo modelos com `ConfigDict(extra="forbid")`.
  2. `eng.domain_router_architect`: Governa os roteadores semânticos em `apps/api/routes/` (`workspaces_channels`, `jobs_storage`, `analytics_youtube`, `research_intelligence`, `knowledge_rag`, `editorial_opportunities`, `production_gateway`, `diagnostics_reports`, `studio`, `orchestrator`).
  3. `eng.http_pool_lifespan_tuner`: Mantém clientes persistentes com pool TCP/TLS *keep-alive* no `lifespan` do FastAPI e fechamento determinístico em `container.close()`.

## 10. Squad `dados_seguranca` — Banco RLS & Segurança AppSec
- **Subagentes**:
  1. `sec.rls_tenant_isolator`: Audita políticas RLS nas migrações SQL e exige validação de `WorkspaceRole` (`OWNER`, `EDITOR`, `VIEWER`) em todas as rotas.
  2. `sec.secret_vault_hygiene`: Audita criptografia simétrica do `TokenVault`, redação automática de segredos em logs/diagnósticos e ausência absoluta de credenciais ou chaves privilegiadas no código cliente (`apps/web/src/`).
  3. `sec.csrf_origin_sentinel`: Aplica verificação de `Origin` confiável em mutações HTTP (`enforce_origin`), validação estrita de assinatura/expiração JWT e varredura contra XSS (`dangerouslySetInnerHTML`, `eval`).

## 11. Squad `automacao_resiliencia` — Workers, Filas & Scrapers Anti-Drift
- **Subagentes**:
  1. `ops.fencing_lease_recovery`: Controla leases atômicos com `fencing_token`, heartbeats, checkpoints e bloqueio de falso sucesso em modo degradado (`ADR-015`).
  2. `ops.dom_drift_detector`: Opera cadeias versionadas de seletores primários/fallback nos coletores do YouTube Studio e Google Trends, emitindo `STUDIO_SCHEMA_DRIFT` explícito quando o DOM externo muda.
  3. `ops.upstream_circuit_breaker`: Aciona disjuntor deslizante (`STUDIO_CIRCUIT_OPEN`) após falhas consecutivas para proteger sessões contra bloqueios e orienta fallback determinístico via CSV.

## 12. Squad `frontend_qa_caos` — Frontend Modular, Estúdio 2.5D & QA 4D
- **Subagentes**:
  1. `fe.codesplit_shell_architect`: Preserva `apps/web/src/app/page.tsx` enxuto (`< 260` linhas, `0` `useState` local), seções isoladas carregadas sob demanda via `next/dynamic` e zero estilos inline.
  2. `fe.studio_25d_state_reducer`: Mantém determinismo e imutabilidade do reducer do Estúdio 2.5D, navegação por teclado, `prefers-reduced-motion` e lista responsiva mobile.
  3. `qa.stress_chaos_gatekeeper`: Exige aprovação simultânea nas 4 dimensões antes de liberar qualquer entrega:
     - **Funcional & Contratos** (`pytest` unit/contracts + build TypeScript/Next.js)
     - **Segurança & Isolamento** (`401`, `403 WORKSPACE_FORBIDDEN`, CSRF, higiene de bundle)
     - **Estresse Concorrente** (centenas de operações paralelas sem vazamento de estado ou socket)
     - **Engenharia de Caos** (falhas 5xx, drift de DOM, circuito aberto e banco indisponível)
