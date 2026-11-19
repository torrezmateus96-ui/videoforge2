# Subetapa RH-05 — Decomposição Modular e Code-Splitting do Frontend (`page.tsx`)

**Especialista Responsável:** Frontend Architecture & Performance Specialist  
**Gate:** `G-RH05`  
**Pré-requisito:** `G-RH04` 100% validado  
**Bloqueia:** Encerramento da Campanha (`RELEASE-READY`)

---

## 1. Diagnóstico Preciso do Problema
O arquivo `apps/web/src/app/page.tsx` possui **2.736 linhas**, concentrando:
- Autenticação, seleção de Workspace/Canal, healthcheck e tema;
- **13 seções inteiras** (`studio`, `dashboard`, `reports`, `channels`, `analytics`, `research`, `opportunities`, `calendar`, `briefs`, `knowledge`, `production`, `jobs`, `settings`);
- Mais de **65 hooks `useState`** no mesmo escopo raiz, fazendo qualquer digitação em um input (ex.: campo de busca de Knowledge ou título de Brief) re-renderizar toda a árvore do shell principal e impedindo *code-splitting* por rota/seção.

---

## 2. Passo a Passo de Implementação
1. Criar o contexto global enxuto `apps/web/src/lib/workspace-shell-context.tsx`:
   - Contém **apenas** o estado transversal: sessão autenticada (ou modo Sandbox Local Efêmero explícito quando Supabase não está configurado no preview), lista de workspaces/canais, `activeWorkspaceId`, `activeChannelId`, `health`, `theme` e sistema de notificações (`notice` / `reportError`).
   - Inclui adaptador opcional **Local Ephemeral Sandbox** (`apps/web/src/lib/local-sandbox-api.ts`) claramente identificado na UI quando `NEXT_PUBLIC_SUPABASE_URL` está ausente, permitindo inspecionar e exercitar todas as 13 seções modularizadas e o Estúdio 2.5D ao vivo na porta `3000` sem inventar métricas falsas (`availability: "unknown"` preservado!).
2. Extrair componentes estruturais do Shell em `apps/web/src/components/shell/`:
   - `AppSidebar.tsx` (navegação lateral das 13 seções + seletor de tema)
   - `AppTopbar.tsx` (status de saúde, workspace/canal ativos e encerramento de sessão)
   - `AuthGateCard.tsx` (login seguro usando `auth-defaults.ts` do `RH-01` + opção transparente de Sandbox Local quando sem credenciais de nuvem)
3. Extrair cada domínio para seu próprio módulo isolado em `apps/web/src/components/sections/` (estado de formulário 100% encapsulado no componente da seção):
   - `DashboardSection.tsx`
   - `ReportsSection.tsx`
   - `ChannelsSection.tsx`
   - `AnalyticsSection.tsx`
   - `ResearchSection.tsx`
   - `OpportunitiesSection.tsx`
   - `BriefsSection.tsx`
   - `CalendarSection.tsx`
   - `KnowledgeSection.tsx`
   - `ProductionSection.tsx`
   - `JobsSection.tsx`
   - `SettingsSection.tsx`
4. Reescrever `apps/web/src/app/page.tsx` (< 250 linhas) carregando cada seção sob demanda via `next/dynamic` (chunks JS independentes com skeleton de carregamento imediato).

---

## 3. Plano de Testes (4 Dimensões)
Arquivos: `apps/web/scripts/run-rh05-tests.mjs` e `tests/remediation/test_rh05_frontend_architecture_security.py`

1. **Arquitetura & Orçamento de Complexidade:**
   - Validar que `apps/web/src/app/page.tsx` tem $< 260$ linhas, zero estados de formulário específicos de sub-módulos vazando no shell raiz, e uso efetivo de `dynamic(...)` para code-splitting das seções.
   - Validar `tsc --noEmit` (zero erros TypeScript) e `next build` gerando artefatos standalone limpos.
2. **Segurança Frontend (XSS, Domínio & Segredos):**
   - Auditar ausência total de `dangerouslySetInnerHTML`, `eval` nos componentes React, credenciais hardcoded e vazamento de tokens em URLs/logs.
3. **Estresse de Estado & Navegação Rápida:**
   - Exercitar **2.000 transições rápidas** de estado/eventos no reducer do Estúdio + Sandbox Store (criação concorrente de workspaces, canais, jobs, oportunidades e troca rápida entre as 13 seções) em $< 250\text{ms}$ com integridade referencial 100%.
4. **Engenharia de Caos na Camada Cliente:**
   - Injetar falhas HTTP `503 SUPABASE_UNAVAILABLE`, `403 WORKSPACE_FORBIDDEN`, `409 VERSION_CONFLICT` e rede offline no cliente de API e verificar mapeamento resiliente para `UiNotice` acionável sem crash de renderização.
