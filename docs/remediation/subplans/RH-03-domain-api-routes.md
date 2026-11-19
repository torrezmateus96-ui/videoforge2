# Subetapa RH-03 — Reorganização Semântica de Rotas da API por Domínio

**Especialista Responsável:** Domain API & Hexagonal Architect  
**Gate:** `G-RH03`  
**Pré-requisito:** `G-RH02` 100% validado  
**Bloqueia:** `RH-04`

---

## 1. Diagnóstico Preciso do Problema
Em `apps/api/routes/`, 11 arquivos de rotas foram nomeados segundo identificadores temporais de execução (`sp01.py`, `sp02.py`, `sp03.py`, `sp04_sp05.py`, `sp06.py`, `sp07.py`, `sp08.py`, `sp09.py`, `sp13.py`, `sp17.py`, `sp22.py`, `sp24.py`).

**Riscos e Dívida Técnica:**
1. **Opacidade Cognitiva:** Engenheiros precisam consultar a matriz histórica de subplanos para descobrir onde vive uma rota de `knowledge`, `reverse-engineering` ou `google-trends`.
2. **Documentação OpenAPI Desagrupada:** Endpoints sem agrupamento claro por domínio funcional em `/openapi.json`.
3. **Risco de Regressão:** Renomear módulos abruptamente pode quebrar imports diretos em testes legados ou scripts diagnósticos se não houver estratégia limpa de transição e validação 1:1 da tabela de rotas.

---

## 2. Passo a Passo de Implementação
1. Criar os módulos canônicos de domínio em `apps/api/routes/`:
   - `workspaces_channels.py` (Workspaces, Membros, Canais, Channel Profile e Tema Editorial — antigo `sp01`)
   - `jobs_storage.py` (Fila de Jobs, Pausa/Retomada/Cancelamento, Eventos e Reconciliação de Storage — antigo `sp02`)
   - `analytics_youtube.py` (OAuth YouTube, Catálogo de Vídeos, Sync Incremental e Métricas — antigo `sp03`)
   - `research_intelligence.py` (Pesquisa de Referências, Títulos/Thumbs, YouTube Studio Trends, Google Trends e Engenharia Reversa 4 Fases — unificando semanticamente `sp04_sp05`, `sp13`, `sp17` e `sp22` ou sub-routers modulares de pesquisa)
   - `knowledge_rag.py` (Importação, Curadoria L1..L3 e Busca Híbrida RAG — antigo `sp06`)
   - `editorial_opportunities.py` (Oportunidades, Parecer dos 4 Analistas, Briefs Versionados e Calendário — antigo `sp07`)
   - `production_gateway.py` (Healthcheck e Intenções de Produção DarkForge — antigo `sp08`)
   - `diagnostics_reports.py` (Telemetria, Exportação Segura de Diagnósticos e Central de Relatórios Executivos — unificando `sp09` e `sp24`)
   - `studio.py` (Estúdio 2.5D de Agentes — mantido e enriquecido com tag OpenAPI `studio`)
2. Atualizar `apps/api/main.py` para registrar exclusivamente os novos routers de domínio com tags OpenAPI semânticas (`workspaces & channels`, `jobs & storage`, `analytics & youtube`, `research & intelligence`, `knowledge & rag`, `editorial & opportunities`, `production gateway`, `diagnostics & reports`, `studio`).
3. Converter os arquivos antigos `sp*.py` em **shims leves de compatibilidade** que reexportam os símbolos e `router` dos módulos de domínio canônicos, evitando qualquer quebra em imports legados de testes existentes, enquanto o código principal depende 100% dos módulos de domínio.

---

## 3. Plano de Testes (4 Dimensões)
Arquivo: `tests/remediation/test_rh03_domain_routes_security_stress.py`

1. **Funcional & Paridade 1:1 de Contratos OpenAPI:**
   - Extrair o grafo completo `(path, method)` antes/depois e validar **100% de cobertura** de todos os endpoints `/api/v1/*` e `/health`, além da presença de tags semânticas no schema `/openapi.json`.
2. **Segurança (Anti-CSRF Origin, Auth Bypass & Workspace Header):**
   - Testar sistematicamente que **todas** as rotas mutáveis (`POST`, `PATCH`, `PUT`, `DELETE`) em todos os 9 módulos bloqueiam `Origin: https://evil.attacker.example` com HTTP `403` (`ORIGIN_FORBIDDEN`).
   - Testar que **todas** as rotas protegidas rejeitam ausência de token ou JWT adulterado com HTTP `401` (`AUTH_UNAUTHENTICATED`) e `X-Workspace-Id` inválido com `422`.
3. **Estresse de Roteamento FastAPI:**
   - Disparar **1.000 requisições concorrentes/em rajada** via `TestClient` distribuídas pelos 9 domínios e `/openapi.json`, validando tempo médio por despacho $< 3\text{ms}$ e zero vazamento de estado entre routers.
4. **Caos de Payload & Injeção:**
   - Enviar payloads JSON truncados, tipos trocados, UUIDs malformados, query strings extremas e headers duplicados em rotas dos 9 domínios, garantindo respostas estruturadas no envelope oficial `ErrorEnvelope` (nunca stacktrace `500` cru).
