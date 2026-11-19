# Subetapa RH-04 — Anti-Fragilidade, Detecção de Drift e Circuit Breaker nos Scrapers

**Especialista Responsável:** Browser Extraction & Chaos Specialist  
**Gate:** `G-RH04`  
**Pré-requisito:** `G-RH03` 100% validado  
**Bloqueia:** `RH-05`

---

## 1. Diagnóstico Preciso do Problema
Os adaptadores `adapters/studio_browser/trends_extractor.py` e `adapters/google_trends/collector.py` dependem da estrutura interna de payloads e seletores DOM do YouTube Studio e Google Trends.

**Riscos Reais:**
1. **Quebra Silenciosa (Silent Zero-Result Failure):** Quando o YouTube Studio ou Google Trends altera nomes de chaves JSON ou seletores CSS, o extrator pode retornar `terms=[]` e `videos=[]` como se o nicho não tivesse buscas, induzindo decisões editoriais erradas (violando o princípio *"Ausência não é zero"*).
2. **Seletores DOM de Camada Única:** Se um seletor específico muda, não há cadeia priorizada de fallbacks semânticos (`role`, `aria-label`, atributos `data-*`, links canônicos `/watch?v=`).
3. **Ausência de Circuit Breaker:** Se o upstream entra em estado de *DOM drift*, rate-limit (`429`) ou desafio CAPTCHA, tentativas repetidas em loop podem degradar a sessão do navegador ou bloquear o IP/canal.

---

## 2. Passo a Passo de Implementação
1. Criar `adapters/studio_browser/resilience.py` contendo dois motores reutilizáveis:
   - **`StructuralDriftDetector`**:
     - Inspeciona sinais da página e dos payloads interceptados (ex.: status HTTP 200 + tamanho de HTML/JSON significativo + presença de containers âncora vs. zero entidades extraídas quando marcadores brutos de vídeo/termo estão presentes no texto/JSON).
     - Calcula `structure_fingerprint` (SHA-256 das chaves de topo do schema JSON/DOM observado) para auditoria rápida de mudança de versão upstream.
     - Distingue explicitamente:
       - `EMPTY_LEGITIMATE` (container de estado vazio explícito reconhecido: *"Sem dados suficientes"*, *"No results"*, `timelineData: []` válido com envelope `default` íntegro);
       - `DRIFT_DETECTED` -> levanta `AppError` explícito e acionável com diagnóstico estruturado (`reason="UPSTREAM_SCHEMA_OR_DOM_DRIFT"`, fingerprint e camada afetada) — **jamais retorna zero silencioso**!
   - **`UpstreamCircuitBreaker`** (Thread-Safe):
     - Estados `CLOSED` $\rightarrow$ `OPEN` $\rightarrow$ `HALF_OPEN`.
     - Abre após $N$ falhas consecutivas de drift/bloqueio/timeout dentro da janela configurada, rejeitando chamadas imediatas (*fail-fast*) com `retry_after_seconds` claro até o *cooldown* expirar.
2. Evoluir `adapters/studio_browser/trends_extractor.py`:
   - Expandir `parse_studio_network_payloads` para suportar variações modernas de chaves internas do YouTube Studio (`searchTerm`, `query`, `topicTitle`, `videoRenderer`, `compactVideoRenderer`, `gridVideoRenderer`, `lockupViewModel`, `reelItemRenderer`).
   - Implementar cadeia priorizada e versionada de seletores DOM (`STUDIO_DOM_SELECTOR_CHAIN_V2`) e integrar `StructuralDriftDetector` + `UpstreamCircuitBreaker`.
3. Evoluir `adapters/google_trends/collector.py`:
   - Tornar `strip_trends_xssi_prefix`, `parse_trends_multiline_json` e `parse_trends_related_json` resilientes a variações de prefixo XSSI, envelopes `default` alterados, valores parciais/formatados em múltiplos idiomas e validar integridade estrutural via `StructuralDriftDetector` + `UpstreamCircuitBreaker`.

---

## 3. Plano de Testes (4 Dimensões)
Arquivo: `tests/remediation/test_rh04_scraper_drift_circuit_chaos.py`

1. **Funcional & Multi-Schema:**
   - Validar extração precisa tanto nos schemas originais quanto em variações novas (`lockupViewModel`, `gridVideoRenderer`, XSSI alternativo, estado vazio legítimo reconhecido).
2. **Segurança (Sanitização, SSRF/URL Safety & Anti-Bypass):**
   - Garantir que CAPTCHA/429/Login expirado disparam bloqueio imediato sem tentativa de bypass ilegal; sanitizar URLs/títulos maliciosos (`javascript:`, payloads gigantes) extraídos de DOM de terceiros.
3. **Estresse Concorrente no Circuit Breaker & Parsers:**
   - Processar **300 árvores JSON profundas e concorrentes** em múltiplas threads batendo no `UpstreamCircuitBreaker` e `parse_studio_network_payloads`, verificando consistência atômica das transições `CLOSED -> OPEN -> HALF_OPEN -> CLOSED`.
4. **Engenharia de Caos (Mutação Hostil de DOM e JSON):**
   - Simular **mutação silenciosa do YouTube/Google** (payload HTTP 200 de 15 KB onde todas as chaves conhecidas foram renomeadas para `v2_unknown_node`, JSON truncado no meio, XSSI corrompido, DOM com links de vídeo mas classes CSS renomeadas): provar que o fallback semântico recupera quando possível e, quando totalmente irreconhecível, levanta `UPSTREAM_SCHEMA_OR_DOM_DRIFT` em vez de retornar `[]` silencioso!
