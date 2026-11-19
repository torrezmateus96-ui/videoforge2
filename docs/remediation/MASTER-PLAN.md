# DarkForge Channel OS — Plano Geral de Remediação e Hardening (Campanha RH-01..RH-05)

**Versão:** 1.0  
**Status:** EM EXECUÇÃO (Gate-by-Gate Lockstep)  
**Regra de Ouro:** *Nenhuma subetapa inicia antes que a anterior atinja 100% de aprovação em testes unitários, contratos, estresse, segurança e engenharia de caos.*

---

## 1. Governança do Orquestrador & Seleção de Especialistas e Skills

O **Agente Orquestrador Principal (`Lead Architecture & Gatekeeper`)** selecionou e ativou a seguinte matriz de especialistas e skills técnicas para atacar cirurgicamente os 5 vetores de risco e dívida técnica auditados no repositório:

| Gate / Subetapa | Alvo da Remediação | Especialista Designado | Skills & Padrões Ativados | Critério de Saída (100% Obrigatório) |
|---|---|---|---|---|
| **RH-01** | Credenciais de teste pré-preenchidas na UI (`admin@managet.local` / `Managet123!`) | **AppSec & Secret Hygiene Specialist** | Zero-Secret Client Bundle, SAST Regex/Entropy Audit, Env-Gated Dev Autofill | Zero senhas hardcoded no repo/bundle; autofill restrito a email opcional em `development`; suíte SAST + Caos de Env aprovada |
| **RH-02** | Cliente HTTP síncrono abrindo conexão TCP/TLS por chamada (`adapters/supabase_db/client.py`) | **Systems & HTTP Pooling Specialist** | `httpx.Client` Keep-Alive Pool, Thread-Safe Lock, FastAPI `lifespan` Cleanup, Per-Request Bearer Isolation | Pool persistente reutilizando conexões sob carga paralela; zero vazamento de `Authorization` entre threads; suíte Stress + Caos HTTP 5xx/Timeout aprovada |
| **RH-03** | Nomenclatura de rotas acoplada a Subplanos (`apps/api/routes/sp01.py .. sp24.py`) | **Domain API & Hexagonal Architect** | Domain-Driven Routing, OpenAPI Tagging, Anti-CSRF `enforce_origin`, Backward-Compatible Shims | Rotas organizadas em 9 domínios claros; 100% dos paths `/api/v1/*` preservados; suíte Segurança Origin/JWT + Stress de Roteamento aprovada |
| **RH-04** | Fragilidade natural dos Scrapers Browser (`studio_browser` & `google_trends`) | **Browser Extraction & Chaos Specialist** | Multi-Layer Extraction, Versioned Selector Fallback Chain, `StructuralDriftDetector`, `UpstreamCircuitBreaker` | Diferenciação determinística entre `0 resultados reais` vs `DOM/Schema Drift`; abertura de Circuit Breaker sob falhas repetidas; suíte Caos DOM/XSSI/429 aprovada |
| **RH-05** | Monolito `apps/web/src/app/page.tsx` (2.736 linhas, 13 seções, dezenas de `useState`) | **Frontend Architecture & Performance Specialist** | `frontend-design` (SaaS Dashboard), `next/dynamic` Code-Splitting, Isolated Section State, Local Ephemeral Sandbox Mode | `page.tsx` < 260 linhas; 13 módulos independentes com lazy loading; isolamento de re-render; `tsc --noEmit` + `next build` + suíte Stress/XSS/Caos aprovada |

---

## 2. Arquitetura Alvo Pós-Remediação

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        APPS/WEB (Next.js 15 + React 19)                      │
│  ┌──────────────────────┐   ┌─────────────────────────────────────────────┐  │
│  │ Shell Enxuto (<260L) │──▶│ WorkspaceShellContext (Auth, WS, Canal, UI) │  │
│  │ AuthCard (Zero-Pass) │   └──────────────────────┬──────────────────────┘  │
│  └──────────────────────┘                          │                         │
│             ┌──────────────────────────────────────┴───────────────────┐     │
│             ▼ next/dynamic (Code-Splitting sob demanda por seção)      ▼     │
│  [Studio 2.5D] [Dashboard] [Reports] [Channels] [Analytics] [Research] ...   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ REST /api/v1/* (Bearer JWT + Origin)
┌──────────────────────────────────────▼───────────────────────────────────────┐
│                    APPS/API (FastAPI + Lifespan Gerenciado)                  │
│  Rotas de Domínio Semântico (RH-03):                                         │
│  • workspaces_channels  • jobs_storage       • analytics_youtube             │
│  • research_intelligence• knowledge_rag      • editorial_opportunities       │
│  • production_gateway   • diagnostics_reports• studio                        │
└──────────────────┬───────────────────────────────────────────┬───────────────┘
                   │                                           │
┌──────────────────▼──────────────────┐     ┌──────────────────▼───────────────┐
│ ADAPTERS/SUPABASE_DB (RH-02)        │     │ ADAPTERS/SCRAPERS (RH-04)        │
│ • Pool HTTP persistente Keep-Alive  │     │ • Multi-Schema JSON/XSSI Parser  │
│ • Limites configuráveis + ThreadSafe│     │ • Seletores Semânticos Versionados│
│ • Isolamento estrito de JWT por req │     │ • StructuralDriftDetector        │
│ • Shutdown gracioso no lifespan     │     │ • UpstreamCircuitBreaker         │
└─────────────────────────────────────┘     └──────────────────────────────────┘
```

---

## 3. Mapa de Subplanos Detalhados

1. [RH-01 — Higiene de Segredos e Blindagem de Autenticação na UI](subplans/RH-01-auth-secret-hygiene.md)
2. [RH-02 — Pool Persistente de Conexões HTTP e Ciclo de Vida FastAPI](subplans/RH-02-http-connection-pooling.md)
3. [RH-03 — Reorganização Semântica de Rotas da API por Domínio](subplans/RH-03-domain-api-routes.md)
4. [RH-04 — Anti-Fragilidade, Detecção de Drift e Circuit Breaker nos Scrapers](subplans/RH-04-resilient-browser-scrapers.md)
5. [RH-05 — Decomposição Modular e Code-Splitting do Frontend (`page.tsx`)](subplans/RH-05-modular-frontend-codesplitting.md)

---

## 4. Protocolo de Validação em 4 Dimensões (Obrigatório por Gate)

Cada subetapa possui sua própria bateria automatizada em `tests/remediation/` cobrindo:
- **Funcional & Contratos:** Garantia de regressão zero nos contratos públicos e DTOs.
- **Segurança (AppSec):** Prevenção de vazamento de credenciais, isolamento de tokens JWT sob concorrência, validação anti-CSRF (`Origin`) e sanitização contra XSS/injeção.
- **Estresse & Performance:** Execução massiva concorrente (`ThreadPoolExecutor` / loops de alta frequência de eventos) medindo reuso de conexões, latência e ausência de *race conditions*.
- **Engenharia de Caos (Fault Injection):** Simulação deliberada de quedas de rede, timeouts, respostas `502/503/429`, JSON truncado, mutação hostil de DOM do YouTube/Google e desligamento abrupto de pools.
