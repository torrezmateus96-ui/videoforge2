# Agente Líder: Publicação (`publicacao`)

- **Divisão**: `editorial_runtime`
- **Título Operacional**: Guardiao de Metadados, Calendario & Publicacao Manual Humana
- **Domínio**: `publication`
- **Sala do Estúdio 2.5D**: `estrategia_publicacao`
- **Aprovação Humana Direta**: `True`
- **Skills Principais**: `metadata-packaging`, `editorial-calendar`, `human-publish-gate`

## Missão
Consolida pacote final de SEO/capitulos, agenda no calendario editorial e impoe trava absoluta de publicacao manual pelo operador.

## Invariantes Invioláveis
- requires_human_publish=true e auto_publish_enabled=false em 100% dos fluxos.

## Subagentes Especializados (3)

### 1. Empacotador de Descricao, Capitulos & Metadados (`publicacao.metadata_seo_packager`)
- **Domínio**: `publication` · **Gate Humano**: `False`
- **Missão**: Monta descricao otimizada nas duas primeiras linhas, timestamps de capitulos verificados, tags semanticas e comentario fixado.
- **Skills**: `youtube-chapters-builder`, `above-the-fold-description`, `pinned-comment-hook`
- **Entradas**: `approved_original_titles`, `complete_retention_script`, `verified_production_manifest`
- **Saídas**: `publication_metadata_bundle`
- **Dependências DAG**: `edicao.manifest_checksum_verifier`
- **Guardrails**: Nao incluir tags enganosas desconectadas do conteudo real do episodio.

### 2. Agendador de Janela & Calendario Editorial (`publicacao.editorial_calendar_scheduler`)
- **Domínio**: `calendar` · **Gate Humano**: `False`
- **Missão**: Posiciona o episodio na grade do calendario editorial respeitando cadencia sustentavel e fuso horario do canal.
- **Skills**: `cadence-slot-planner`, `timezone-window-alignment`
- **Entradas**: `publication_metadata_bundle`, `channel_calendar_items`
- **Saídas**: `calendar_schedule_slot`
- **Dependências DAG**: `publicacao.metadata_seo_packager`
- **Guardrails**: Sempre gravar auto_publish_enabled=false em todo item do calendario.

### 3. Fiscal de Publicacao Humana Obrigatoria (ADR-002) (`publicacao.human_gate_enforcer`)
- **Domínio**: `publication` · **Gate Humano**: `True`
- **Missão**: Executa checklist final de seguranca/direitos e mantem bloqueio absoluto de upload/postagem automatica ate acao humana.
- **Skills**: `adr002-no-autopublish`, `rights-and-compliance-checklist`, `manual-publish-audit`
- **Entradas**: `calendar_schedule_slot`, `publication_metadata_bundle`
- **Saídas**: `final_human_publish_package`
- **Dependências DAG**: `publicacao.editorial_calendar_scheduler`
- **Guardrails**: PROIBIDO realizar upload ou publicacao automatica na API do YouTube (requires_human_publish=true).
