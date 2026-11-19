# Subetapa RH-02 — Pool Persistente de Conexões HTTP e Ciclo de Vida FastAPI

**Especialista Responsável:** Systems & HTTP Pooling Specialist  
**Gate:** `G-RH02`  
**Pré-requisito:** `G-RH01` 100% validado  
**Bloqueia:** `RH-03`

---

## 1. Diagnóstico Preciso do Problema
Em `adapters/supabase_db/client.py` (e `adapters/supabase_storage/client.py`), cada chamada a `request()` ou `check_health()` executa:
```python
with httpx.Client(timeout=self._timeout) as client:
    resp = client.request(...)
```
**Riscos e Gargalos Reais:**
1. **Overhead de Handshake TCP + TLS a cada query:** Uma única rota de relatório (`sp24`) ou pipeline de agente faz 5 a 12 chamadas sequenciais ao PostgREST, pagando múltiplos handshakes TLS desnecessários.
2. **Exaustão de Portas Efêmeras sob Estresse:** Rajadas concorrentes abrem centenas de sockets `TIME_WAIT` em vez de reutilizar conexões *Keep-Alive*.
3. **Risco de Segurança ao Compartilhar Cliente:** Ao introduzir um cliente persistente, jamais podemos armazenar `Authorization: Bearer <user_jwt>` nos headers globais do `httpx.Client`, sob pena de **vazamento cruzado de sessão (Session Bleed)** entre usuários concorrentes.

---

## 2. Passo a Passo de Implementação
1. Evoluir `SupabaseRestClient` (`adapters/supabase_db/client.py`):
   - Configurar `httpx.Limits(max_connections=40, max_keepalive_connections=20, keepalive_expiry=30.0)` e `httpx.Timeout(timeout, pool=pool_timeout)`.
   - Inicializar o `httpx.Client` de forma *lazy* e **thread-safe** (`threading.Lock`), mantendo nos headers base apenas `apikey` (ou nem mesmo mutando `client.headers`), passando `Authorization: Bearer <access_token>` **exclusivamente por requisição** (`client.request(..., headers=req_headers)`).
   - Suportar injeção opcional de `transport: httpx.BaseTransport | None = None` para testes determinísticos de caos/concorrência sem sockets externos.
   - Implementar `close()`, suporte a context manager (`__enter__`/`__exit__`), métricas internas leves de inspeção (`pool_stats`: `requests_total`, `client_recreations`, `closed`) e auto-recuperação segura caso `request()` seja chamado após fechamento ou transporte corrompido.
2. Aplicar o mesmo padrão de pool persistente e `close()` em `SupabaseStorageClient` (`adapters/supabase_storage/client.py`).
3. Evoluir `apps/api/config.py`, `apps/api/dependencies.py` (`ServiceContainer.close()`) e `apps/api/main.py` adicionando gerenciador `lifespan` oficial do FastAPI para encerrar os pools HTTP graciosamente no shutdown do servidor.

---

## 3. Plano de Testes (4 Dimensões)
Arquivo: `tests/remediation/test_rh02_http_pool_stress_chaos.py`

1. **Funcional & Reuso de Pool:**
   - Confirmar que 100 requisições sequenciais reutilizam exatamente **1 instância** de `httpx.Client` subjacente, preservando semântica de status `200`, `204`, `401`, `403`, `409`, `422` e `503`.
2. **Segurança (Zero Token Bleed sob Concorrência):**
   - Disparar **64 threads simultâneas** com **200 tokens JWT distintos** batendo no mesmo `SupabaseRestClient` compartilhado; o transporte mockado valida criptograficamente que cada resposta corresponde 1:1 ao `Bearer` enviado naquela thread, sem contaminação cruzada de headers (`Prefer`, `Accept-Profile`, `Authorization`).
3. **Estresse de Alta Concorrência:**
   - Executar **500 requisições paralelas** em pool limitado (`max_connections=16`), verificando ausência de deadlocks, *race conditions* na inicialização lazy e latência estável.
4. **Engenharia de Caos (Fault Injection):**
   - Injetar falhas intermitentes (`httpx.ConnectTimeout`, `httpx.ReadTimeout`, `httpx.RemoteProtocolError`, `httpx.PoolTimeout`, HTTP `502`/`503`, payload vazio/malformado) e fechamento abrupto (`client.close()`) no meio de carga concorrente, verificando tradução limpa para `AppError(SUPABASE_UNAVAILABLE, retryable=True)` e recuperação automática sem corrupção de estado.
