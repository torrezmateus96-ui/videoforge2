import type {
  ChannelDTO,
  ChannelProfileVersionDTO,
  ConnectionDTO,
  EditorialThemeChangeDTO,
  ErrorEnvelope,
  HealthDTO,
  JobDTO,
  JobEventDTO,
  MetricFactDTO,
  ReportsOverviewDTO,
  StorageReconcileDTO,
  SyncCursorDTO,
  VideoDTO,
  WorkspaceListItem,
} from "./api";
import type {
  AgentDetailResponse,
  AgentKey,
  AgentOutput,
  AgentRunRecord,
  ApprovalRecord,
  ContentItemPipeline,
  RoomDetailResponse,
  RoomKey,
  StudioAgentState,
  StudioEvent,
  StudioRoomState,
  StudioSnapshot,
} from "./studio/types";
import {
  SANDBOX_ORCHESTRATOR_TOPOLOGY,
  buildSandboxMissionPlan,
  type AgentDivisionKey,
  type MissionScopeKey,
  type OrchestratorExecutionReportDTO,
  type OrchestratorTopologyDTO,
} from "./orchestrator-catalog";
import {
  DEFAULT_MODELING_CANDIDATES,
  buildSandboxModelingPlaybook,
  type ModelingPlaybookRequestDTO,
} from "./reference-modeling";

export const SANDBOX_ACCESS_TOKEN = "sandbox-ephemeral-local-token";
export const SANDBOX_USER_EMAIL = "operador@sandbox.local";

export function isSandboxToken(token?: string | null): boolean {
  return token === SANDBOX_ACCESS_TOKEN;
}

class SandboxError extends Error {
  readonly status: number;
  readonly envelope: ErrorEnvelope;
  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message);
    this.status = status;
    this.envelope = envelope;
  }
}

const STUDIO_ROOMS_DEF: { key: RoomKey; label: string; sort_order: number }[] = [
  { key: "sala_dados", label: "Sala de Dados", sort_order: 1 },
  { key: "pesquisa", label: "Pesquisa & Outliers", sort_order: 2 },
  { key: "mesa_agentes", label: "Mesa de Estrategia", sort_order: 3 },
  { key: "gravacao", label: "Roteiro & Gravacao", sort_order: 4 },
  { key: "design_thumbnail", label: "Design & Thumbnail", sort_order: 5 },
  { key: "estrategia_publicacao", label: "Publicacao Manual", sort_order: 6 },
];

const STUDIO_AGENTS_DEF: {
  key: AgentKey;
  name: string;
  room: RoomKey;
  avatar: string;
  desc: string;
  approval: boolean;
}[] = [
  { key: "dados", name: "Analista de Dados", room: "sala_dados", avatar: "analyst_cyan", desc: "Audita metricas reais sem fabricar zeros.", approval: false },
  { key: "pesquisa", name: "Cacador de Outliers", room: "pesquisa", avatar: "scout_amber", desc: "Mapeia lacunas, buscas e padroes multi-canal.", approval: false },
  { key: "estrategia", name: "Arquiteto Editorial", room: "mesa_agentes", avatar: "strategist_violet", desc: "Sintetiza mecanismo transferivel e oportunidade.", approval: true },
  { key: "titulos", name: "Especialista em Packaging", room: "mesa_agentes", avatar: "copy_emerald", desc: "Formula promessa original anti-plagio.", approval: true },
  { key: "roteiro", name: "Diretor de Retencao", room: "gravacao", avatar: "writer_crimson", desc: "Estrutura blocos 0-15s, 15-30s e loops abertos.", approval: true },
  { key: "thumbnail", name: "Diretor Visual", room: "design_thumbnail", avatar: "designer_gold", desc: "Define tensao visual e contraste de capa.", approval: true },
  { key: "edicao", name: "Supervisor de Ritmo", room: "gravacao", avatar: "editor_steel", desc: "Prepara intencao auditavel para producao.", approval: false },
  { key: "publicacao", name: "Guardiao de Lancamento", room: "estrategia_publicacao", avatar: "publisher_indigo", desc: "Checklist final sem auto-publicacao.", approval: true },
];

export function createSandboxStore() {
  let seqCounter = 100;
  let studioEventSeq = 1;
  const nextId = (prefix: string) => `${prefix}-${++seqCounter}`;
  const nowIso = () => new Date().toISOString();

  const defaultWsId = "ws-sandbox-01";
  const defaultChId = "ch-sandbox-01";
  const defaultVerId = "ver-sandbox-01";

  const workspaces: WorkspaceListItem[] = [
    {
      workspace: {
        id: defaultWsId,
        name: "Estudio Editorial Demo (Sandbox Local)",
        slug: "estudio-demo-local",
        version: 1,
      },
      role: "owner",
    },
  ];

  const channels: ChannelDTO[] = [
    {
      id: defaultChId,
      workspace_id: defaultWsId,
      platform: "youtube",
      external_channel_id: "UC_SANDBOX_ATLAS",
      display_name: "Arquivo Geopolitico",
      handle: "@arquivogeopolitico",
      status: "active",
      active_profile_version_id: defaultVerId,
      version: 1,
    },
  ];

  const profileVersions: Record<string, ChannelProfileVersionDTO[]> = {
    [defaultChId]: [
      {
        id: defaultVerId,
        channel_id: defaultChId,
        version_number: 1,
        name: "Arquivo Geopolitico",
        language: "pt-BR",
        country: "BR",
        timezone: "America/Sao_Paulo",
        niche: "Documentarios Historicos & Geopolitica",
        positioning: "Investigacao documental baseada em fontes primarias e mapas.",
        editorial_theme: "Rotas estrategicas e imperios esquecidos",
        pillars_json: ["Geopolitica classica", "Cartografia historica", "Economia maritima"],
        formats_json: ["long_documentary"],
        objectives_json: ["Retencao qualificada", "Autoridade editorial"],
        audience_json: {},
        voice_json: {},
        restrictions_json: { forbidden_topics: ["sensacionalismo", "boatos sem fonte"] },
        effective_from: nowIso(),
        change_summary: "Versao inicial v1 (Sandbox Local)",
      },
    ],
  };

  const themeChanges: Record<string, EditorialThemeChangeDTO[]> = { [defaultChId]: [] };
  const jobs: JobDTO[] = [];
  const jobEvents: Record<string, JobEventDTO[]> = {};
  const idempotencyJobs = new Map<string, string>();
  const connections: ConnectionDTO[] = [];
  const knowledgeSources: {
    id: string;
    workspace_id: string;
    title: string;
    source_type: string;
    content_text: string;
    curation_level: string;
    status: string;
    rights_status: string;
  }[] = [
    {
      id: "kn-sandbox-01",
      workspace_id: defaultWsId,
      title: "Guia Editorial de Abertura 0-30s",
      source_type: "guideline",
      content_text: "Nos primeiros 15 segundos apresente o paradoxo geografico concreto sem introducao generica.",
      curation_level: "L2",
      status: "APPROVED",
      rights_status: "owned",
    },
  ];

  const opportunities: {
    id: string;
    workspace_id: string;
    channel_id: string;
    theme: string;
    angle: string;
    differentiation: string;
    score: number;
    score_version: string;
    confidence: number;
    status: string;
    insufficient_data: boolean;
    score_breakdown_json: Record<string, number>;
    limitations_json: string[];
    analyst_reports_json: ReportsOverviewDTO["opportunities"][number]["analyst_reports_json"];
  }[] = [
    {
      id: "opp-sandbox-01",
      workspace_id: defaultWsId,
      channel_id: defaultChId,
      theme: "O Estreito Esquecido que Redesenhou o Comercio Mundial",
      angle: "Analise das rotas alternativas antes dos canais modernos",
      differentiation: "Foco logistico com mapas primarios do seculo XVII",
      score: 0.78,
      score_version: "v1.2-sandbox",
      confidence: 0.65,
      status: "PROPOSED",
      insufficient_data: true,
      score_breakdown_json: { fit_editorial: 0.88, originalidade: 0.91, evidencia_demanda: 0.55 },
      limitations_json: ["Sandbox local sem sincronizacao YouTube Analytics privada (ausencia != zero)."],
      analyst_reports_json: [
        {
          analyst: "Editorial Fit Analyst",
          confidence: 0.82,
          data_freshness: "sandbox_local",
          findings: ["Alinhado aos pilares de cartografia historica e economia maritima."],
          recommendations: ["Estruturar gancho visual no mapa nos primeiros 12 segundos."],
          limitations: ["Metricas privadas de CTR marcadas como UNKNOWN ate conectar OAuth."],
          evidence: [{ source_kind: "channel_profile", snippet: "Pilar: Cartografia historica" }],
        },
      ],
    },
  ];

  const briefs: {
    id: string;
    workspace_id: string;
    brief_group_id: string;
    version: number;
    opportunity_id: string;
    title: string;
    hook: string;
    angle: string;
    status: string;
    content_sha256: string;
    target_format: string;
  }[] = [];

  const calendarItems: {
    id: string;
    workspace_id: string;
    channel_id: string;
    title: string;
    scheduled_for: string;
    status: string;
    auto_publish_enabled: boolean;
  }[] = [];

  const prodIntents: {
    id: string;
    workspace_id: string;
    brief_id: string;
    brief_version: number;
    idempotency_key: string;
    status: string;
    manifest_validated: boolean;
    error_code: string | null;
    error_message: string | null;
  }[] = [];

  const gtValidations: ReportsOverviewDTO["google_trends"] &
    { points_12m_json: { value: number }[]; points_5y_json: { value: number }[] }[] = [];

  const reAudits: ReportsOverviewDTO["reverse_engineering"]["audits"] = [];
  const reOutliers: (ReportsOverviewDTO["reverse_engineering"]["viral_outliers"][number] & {
    external_video_id: string;
    channel_mean_views: number;
    false_positive_reasons_json: string[];
  })[] = [];
  const reAutopsies: ReportsOverviewDTO["reverse_engineering"]["autopsies"] = [];
  const reMechanisms: ReportsOverviewDTO["reverse_engineering"]["mechanisms"] = [];
  const reBatches: ReportsOverviewDTO["reverse_engineering"]["batches"] = [];

  // 2.5D Studio state per channel
  const studioAgentsByChannel = new Map<string, StudioAgentState[]>();
  const studioItemsByChannel = new Map<string, ContentItemPipeline[]>();
  const studioRunsByChannel = new Map<string, AgentRunRecord[]>();
  const studioOutputsByChannel = new Map<string, AgentOutput[]>();
  const studioEventsByChannel = new Map<string, StudioEvent[]>();
  const studioApprovalsByChannel = new Map<string, ApprovalRecord[]>();

  function ensureStudioChannel(wsId: string, chId: string): StudioAgentState[] {
    let list = studioAgentsByChannel.get(chId);
    if (!list) {
      list = STUDIO_AGENTS_DEF.map((d, idx) => ({
        workspace_id: wsId,
        channel_id: chId,
        channel_agent_id: `ca-${chId}-${idx + 1}`,
        agent_key: d.key,
        enabled: true,
        config: {},
        model_policy: { mode: "local_deterministic", external_consent: false },
        monthly_budget_cents: 2500,
        room_key: d.room,
        description: d.desc,
        requires_approval: d.approval,
        contract_version: 1,
        display_name: d.name,
        avatar_key: d.avatar,
        run_id: null,
        job_id: null,
        content_item_id: null,
        status: "idle",
        stage_label: "Aguardando pauta",
        progress: null,
        attempt: null,
        heartbeat_at: null,
        started_at: null,
        finished_at: null,
        error_code: null,
        error_message: null,
        cost_estimate_cents: 0,
        run_created_at: null,
      }));
      studioAgentsByChannel.set(chId, list);
      const initialItem: ContentItemPipeline = {
        content_item_id: `ci-${chId}-01`,
        workspace_id: wsId,
        channel_id: chId,
        working_title: "O Estreito Esquecido do Seculo XVII",
        opportunity_id: "opp-sandbox-01",
        brief_id: null,
        brief_version: null,
        stage: "pesquisa",
        status: "in_progress",
        scheduled_for: null,
        published_video_url: null,
        published_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        latest_outputs: {},
      };
      studioItemsByChannel.set(chId, [initialItem]);
      studioRunsByChannel.set(chId, []);
      studioOutputsByChannel.set(chId, []);
      studioEventsByChannel.set(chId, []);
      studioApprovalsByChannel.set(chId, []);
    }
    return list;
  }

  function requireWorkspace(workspaceId: string) {
    const found = workspaces.find((w) => w.workspace.id === workspaceId);
    if (!found) {
      throw new SandboxError(403, {
        code: "WORKSPACE_FORBIDDEN",
        message: "Workspace nao encontrado ou acesso negado no Sandbox.",
        retryable: false,
      });
    }
    return found;
  }

  return {
    health: async (): Promise<HealthDTO> => ({
      status: "ok",
      supabase_reachable: true,
      service: "darkforge-local-sandbox",
    }),

    listWorkspaces: async (_token: string) => ({ items: [...workspaces] }),

    createWorkspace: async (_token: string, name: string, slug: string): Promise<WorkspaceListItem> => {
      const cleanName = name.trim();
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!cleanName || !cleanSlug) {
        throw new SandboxError(422, {
          code: "VALIDATION_ERROR",
          message: "Nome e slug sao obrigatorios.",
          retryable: false,
        });
      }
      const item: WorkspaceListItem = {
        workspace: { id: nextId("ws"), name: cleanName, slug: cleanSlug, version: 1 },
        role: "owner",
      };
      workspaces.push(item);
      return item;
    },

    listChannels: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return { items: channels.filter((c) => c.workspace_id === workspaceId) };
    },

    createChannel: async (
      _token: string,
      workspaceId: string,
      payload: { display_name: string; handle?: string | null; profile: Record<string, unknown> }
    ) => {
      requireWorkspace(workspaceId);
      const chId = nextId("ch");
      const verId = nextId("ver");
      const channel: ChannelDTO = {
        id: chId,
        workspace_id: workspaceId,
        platform: "youtube",
        external_channel_id: null,
        display_name: payload.display_name.trim(),
        handle: payload.handle ?? null,
        status: "active",
        active_profile_version_id: verId,
        version: 1,
      };
      const ver: ChannelProfileVersionDTO = {
        id: verId,
        channel_id: chId,
        version_number: 1,
        name: String(payload.profile.name || payload.display_name),
        language: String(payload.profile.language || "pt-BR"),
        country: String(payload.profile.country || "BR"),
        timezone: String(payload.profile.timezone || "America/Sao_Paulo"),
        niche: String(payload.profile.niche || "Editorial"),
        positioning: String(payload.profile.positioning || ""),
        editorial_theme: String(payload.profile.editorial_theme || ""),
        pillars_json: Array.isArray(payload.profile.pillars_json) ? (payload.profile.pillars_json as string[]) : [],
        formats_json: ["long"],
        objectives_json: [],
        audience_json: {},
        voice_json: {},
        restrictions_json: (payload.profile.restrictions_json as Record<string, unknown>) ?? {},
        effective_from: nowIso(),
        change_summary: String(payload.profile.change_summary || "Criacao v1"),
      };
      channels.push(channel);
      profileVersions[chId] = [ver];
      themeChanges[chId] = [];
      return { channel, profile_version: ver };
    },

    updateProfile: async (
      _token: string,
      workspaceId: string,
      channelId: string,
      profile: Record<string, unknown>
    ) => {
      requireWorkspace(workspaceId);
      const channel = channels.find((c) => c.id === channelId && c.workspace_id === workspaceId);
      if (!channel) {
        throw new SandboxError(404, { code: "RESOURCE_NOT_FOUND", message: "Canal nao encontrado.", retryable: false });
      }
      const history = profileVersions[channelId] ?? [];
      const prev = history[0];
      const nextVerNum = (prev?.version_number ?? 0) + 1;
      const verId = nextId("ver");
      const newTheme = String(profile.editorial_theme ?? prev?.editorial_theme ?? "");
      const ver: ChannelProfileVersionDTO = {
        id: verId,
        channel_id: channelId,
        version_number: nextVerNum,
        name: String(profile.name || channel.display_name),
        language: String(profile.language || prev?.language || "pt-BR"),
        country: String(profile.country || prev?.country || "BR"),
        timezone: String(profile.timezone || prev?.timezone || "America/Sao_Paulo"),
        niche: String(profile.niche || prev?.niche || ""),
        positioning: String(profile.positioning || ""),
        editorial_theme: newTheme,
        pillars_json: Array.isArray(profile.pillars_json) ? (profile.pillars_json as string[]) : [],
        formats_json: ["long"],
        objectives_json: [],
        audience_json: {},
        voice_json: {},
        restrictions_json: (profile.restrictions_json as Record<string, unknown>) ?? {},
        effective_from: nowIso(),
        change_summary: String(profile.change_summary || "Atualizacao editorial"),
      };
      history.unshift(ver);
      profileVersions[channelId] = history;
      channel.active_profile_version_id = verId;
      channel.version += 1;

      let tc: EditorialThemeChangeDTO | null = null;
      if (prev && prev.editorial_theme !== newTheme) {
        tc = {
          id: nextId("tc"),
          previous_theme: prev.editorial_theme,
          new_theme: newTheme,
          reason: String(profile.theme_change_reason || profile.change_summary || "Evolucao editorial"),
          effective_at: nowIso(),
          new_version_id: verId,
        };
        themeChanges[channelId] = [tc, ...(themeChanges[channelId] ?? [])];
      }
      return { channel: { ...channel }, profile_version: ver, theme_change: tc };
    },

    listProfileVersions: async (_token: string, workspaceId: string, channelId: string) => {
      requireWorkspace(workspaceId);
      return { items: [...(profileVersions[channelId] ?? [])] };
    },

    listThemeChanges: async (_token: string, workspaceId: string, channelId: string) => {
      requireWorkspace(workspaceId);
      return { items: [...(themeChanges[channelId] ?? [])] };
    },

    listJobs: async (_token: string, workspaceId: string, status?: string) => {
      requireWorkspace(workspaceId);
      const filtered = jobs.filter(
        (j) => j.workspace_id === workspaceId && (!status || j.status === status)
      );
      return { items: [...filtered] };
    },

    enqueueJob: async (
      _token: string,
      workspaceId: string,
      payload: { job_type: string; payload: Record<string, unknown>; total_steps: number },
      idempotencyKey: string
    ) => {
      requireWorkspace(workspaceId);
      const scopedKey = `${workspaceId}:${idempotencyKey}`;
      const existingId = idempotencyJobs.get(scopedKey);
      if (existingId) {
        const existing = jobs.find((j) => j.id === existingId)!;
        return { job_id: existing.id, status: existing.status, deduplicated: true };
      }
      const jId = nextId("job");
      const job: JobDTO = {
        id: jId,
        workspace_id: workspaceId,
        channel_id: null,
        job_type: payload.job_type,
        status: "QUEUED",
        current_step: "prepare",
        total_steps: Math.max(1, payload.total_steps),
        completed_steps: 0,
        attempt_count: 1,
        pause_requested: false,
        cancel_requested: false,
        error_code: null,
        error_message: null,
        retryable: true,
        created_at: nowIso(),
      };
      jobs.unshift(job);
      jobEvents[jId] = [
        {
          sequence_no: 1,
          event_type: "JOB_ENQUEUED",
          step_name: "prepare",
          status: "QUEUED",
          message: `Job ${payload.job_type} registrado com chave idempotente.`,
          created_at: nowIso(),
        },
      ];
      idempotencyJobs.set(scopedKey, jId);
      return { job_id: jId, status: job.status, deduplicated: false };
    },

    getJobDetail: async (_token: string, workspaceId: string, jobId: string) => {
      requireWorkspace(workspaceId);
      const job = jobs.find((j) => j.id === jobId && j.workspace_id === workspaceId);
      if (!job) {
        throw new SandboxError(404, { code: "RESOURCE_NOT_FOUND", message: "Job nao encontrado.", retryable: false });
      }
      return { job: { ...job }, events: [...(jobEvents[jobId] ?? [])] };
    },

    pauseJob: async (_token: string, workspaceId: string, jobId: string) => {
      requireWorkspace(workspaceId);
      const job = jobs.find((j) => j.id === jobId && j.workspace_id === workspaceId)!;
      job.status = "PAUSED";
      job.pause_requested = true;
      jobEvents[jobId]?.push({
        sequence_no: (jobEvents[jobId]?.length ?? 0) + 1,
        event_type: "CONTROL_PAUSE",
        step_name: job.current_step,
        status: "PAUSED",
        message: "Pausa solicitada pelo operador.",
        created_at: nowIso(),
      });
      return { job: { ...job }, control_result: "PAUSED" };
    },

    resumeJob: async (_token: string, workspaceId: string, jobId: string) => {
      requireWorkspace(workspaceId);
      const job = jobs.find((j) => j.id === jobId && j.workspace_id === workspaceId)!;
      job.status = "RUNNING";
      job.pause_requested = false;
      jobEvents[jobId]?.push({
        sequence_no: (jobEvents[jobId]?.length ?? 0) + 1,
        event_type: "CONTROL_RESUME",
        step_name: job.current_step,
        status: "RUNNING",
        message: "Job retomado a partir do ultimo checkpoint.",
        created_at: nowIso(),
      });
      return { job: { ...job }, control_result: "RESUMED" };
    },

    cancelJob: async (_token: string, workspaceId: string, jobId: string) => {
      requireWorkspace(workspaceId);
      const job = jobs.find((j) => j.id === jobId && j.workspace_id === workspaceId)!;
      job.status = "CANCELLED";
      job.cancel_requested = true;
      jobEvents[jobId]?.push({
        sequence_no: (jobEvents[jobId]?.length ?? 0) + 1,
        event_type: "CONTROL_CANCEL",
        step_name: job.current_step,
        status: "CANCELLED",
        message: "Job cancelado de forma limpa.",
        created_at: nowIso(),
      });
      return { job: { ...job }, control_result: "CANCELLED" };
    },

    reconcileStorage: async (_token: string, workspaceId: string, bucket: string): Promise<{ report: StorageReconcileDTO }> => {
      requireWorkspace(workspaceId);
      return {
        report: {
          workspace_id: workspaceId,
          bucket,
          missing_in_storage: [],
          orphaned_in_storage: [],
          incomplete_uploads: [],
        },
      };
    },

    listConnections: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return { items: [...connections] };
    },

    authorizeYouTube: async (_token: string, workspaceId: string, channelId: string) => {
      requireWorkspace(workspaceId);
      return {
        authorize_url: `https://accounts.google.com/o/oauth2/v2/auth?state=sandbox_${channelId}`,
        state: `sandbox_${channelId}`,
      };
    },

    disconnectConnection: async (
      _token: string,
      workspaceId: string,
      connectionId: string,
      _retentionPolicy: "keep_readonly" | "purge_synced_data"
    ) => {
      requireWorkspace(workspaceId);
      const idx = connections.findIndex((c) => c.id === connectionId);
      if (idx >= 0) connections.splice(idx, 1);
      return { status: "revoked", tokens_deleted: true, purged_videos: 0 };
    },

    syncChannel: async (_token: string, workspaceId: string, channelId: string) => {
      requireWorkspace(workspaceId);
      const jId = nextId("job-sync");
      jobs.unshift({
        id: jId,
        workspace_id: workspaceId,
        channel_id: channelId,
        job_type: "youtube.catalog_incremental",
        status: "QUEUED",
        current_step: "fetch_catalog",
        total_steps: 2,
        completed_steps: 0,
        attempt_count: 1,
        pause_requested: false,
        cancel_requested: false,
        error_code: null,
        error_message: null,
        retryable: true,
        created_at: nowIso(),
      });
      return { job_id: jId, status: "QUEUED", deduplicated: false };
    },

    getPortfolioAnalytics: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      const wsChannels = channels.filter((c) => c.workspace_id === workspaceId);
      const cursors: SyncCursorDTO[] = [{ sync_scope: "catalog_incremental", freshness_status: "never_synced", last_page_processed: 0, last_successful_sync_at: null, partial_errors: [] }];
      return {
        period_start: "2026-10-19",
        period_end: "2026-11-18",
        channels: wsChannels.map((c) => ({
          channel_id: c.id,
          display_name: c.display_name,
          video_count: 0,
          metrics: [] as MetricFactDTO[],
          cursors,
        })),
        quota: { daily_limit: 10000, own_sync_used: 0, public_research_used: 0 },
      };
    },

    getChannelAnalytics: async (_token: string, workspaceId: string, channelId: string) => {
      requireWorkspace(workspaceId);
      // Honest availability: "unknown" (absence != 0)
      const honestMetrics: MetricFactDTO[] = [
        {
          id: `mf-${channelId}-views`,
          metric_id: "views_28d",
          display_name: "Visualizacoes (28d)",
          visibility_scope: "private_oauth",
          source: "sandbox_unsynced",
          source_revision: 1,
          period_start: "2026-10-21",
          period_end: "2026-11-18",
          granularity: "28d",
          availability: "unknown",
          value_num: null,
          is_estimate: false,
          fetched_at: nowIso(),
        },
      ];
      return {
        channel_id: channelId,
        period_start: "2026-10-21",
        period_end: "2026-11-18",
        metrics: honestMetrics,
        cursors: [{ sync_scope: "catalog_incremental", freshness_status: "never_synced", last_page_processed: 0, last_successful_sync_at: null, partial_errors: [] }],
        videos: [] as VideoDTO[],
      };
    },

    getVideoDetail: async (_token: string, workspaceId: string, videoId: string) => {
      requireWorkspace(workspaceId);
      return {
        video: {
          id: videoId,
          title: "Video Catalogado",
          canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          format: "long",
          duration_seconds: 900,
          published_at: nowIso(),
          source: "public_api",
        },
        metrics: [] as MetricFactDTO[],
      };
    },

    listReferences: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return {
        channels: [{ id: "ref-ch-1", title: "Atlas Documental", curation_status: "approved" }],
        videos: [{ id: "ref-vid-1", title: "Como um Mapa Secreto Mudou as Fronteiras", curation_status: "pending" }],
      };
    },

    curateReference: async (_token: string, workspaceId: string, refId: string, body: { status: string }) => {
      requireWorkspace(workspaceId);
      return { id: refId, status: body.status };
    },

    analyzeTitle: async (_token: string, workspaceId: string, title: string) => {
      requireWorkspace(workspaceId);
      const hasNumber = /\d/.test(title);
      const hasQuestion = title.includes("?") || /^(como|por que|qual)/i.test(title.trim());
      const features = [
        hasNumber ? "ancora_numerica" : "tensao_conceitual",
        hasQuestion ? "lacuna_curiosidade" : "afirmacao_contrastante",
        title.length <= 62 ? "comprimento_ideal_mobile" : "titulo_extenso",
      ];
      return {
        features_json: { features },
        editorial_formula: "[Entidade Historica] + [Mecanismo Oculto] + [Consequencia Global]",
        limitations_json: ["Analise estrutural deterministica; CTR real depende da combinacao com a thumbnail."],
      };
    },

    generateTitleAlternatives: async (
      _token: string,
      workspaceId: string,
      body: { topic: string; niche: string }
    ) => {
      requireWorkspace(workspaceId);
      const clean = body.topic.trim();
      return {
        items: [
          {
            title: `O Erro Geografico que Mudou ${clean} Para Sempre`,
            differentiation: "Angulo de causa-efeito sistemica validado contra plagio",
            originality: { approval_blocked: false, max_similarity: 0.18 },
          },
          {
            title: `Por Que Ninguem Conseguiu Controlar ${clean}?`,
            differentiation: "Pergunta aberta focada em barreira natural e logistica",
            originality: { approval_blocked: false, max_similarity: 0.22 },
          },
        ],
      };
    },

    listKnowledgeSources: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return {
        items: knowledgeSources
          .filter((s) => s.workspace_id === workspaceId)
          .map(({ id, title, source_type, curation_level, status, rights_status }) => ({
            id,
            title,
            source_type,
            curation_level,
            status,
            rights_status,
          })),
      };
    },

    importKnowledgeSource: async (
      _token: string,
      workspaceId: string,
      body: { title: string; source_type: string; content_text: string; rights_status: string }
    ) => {
      requireWorkspace(workspaceId);
      const id = nextId("kn");
      knowledgeSources.push({
        id,
        workspace_id: workspaceId,
        title: body.title.trim(),
        source_type: body.source_type,
        content_text: body.content_text,
        curation_level: "L0",
        status: "QUARANTINED",
        rights_status: body.rights_status,
      });
      return { source: { id }, deduplicated: false };
    },

    reviewKnowledgeSource: async (
      _token: string,
      workspaceId: string,
      sourceId: string,
      body: { curation_level: string; status: string }
    ) => {
      requireWorkspace(workspaceId);
      const src = knowledgeSources.find((s) => s.id === sourceId && s.workspace_id === workspaceId);
      if (src) {
        src.curation_level = body.curation_level;
        src.status = body.status;
      }
      return { ok: true };
    },

    reindexKnowledge: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      const approved = knowledgeSources.filter(
        (s) => s.workspace_id === workspaceId && (s.curation_level === "L2" || s.curation_level === "L3")
      );
      return {
        indexed_sources: approved.length,
        total_chunks: approved.length * 2,
        revision: { embedding_version: "sandbox-fts-v1", status: "ACTIVE" },
      };
    },

    searchKnowledge: async (_token: string, workspaceId: string, query: string) => {
      requireWorkspace(workspaceId);
      const q = query.toLowerCase();
      const hits = knowledgeSources
        .filter(
          (s) =>
            s.workspace_id === workspaceId &&
            (s.curation_level === "L2" || s.curation_level === "L3") &&
            (s.title.toLowerCase().includes(q) || s.content_text.toLowerCase().includes(q) || q.length > 0)
        )
        .map((s) => ({
          chunk_id: `chk-${s.id}`,
          source_id: s.id,
          source_title: s.title,
          curation_level: s.curation_level,
          chunk_text: s.content_text.slice(0, 220),
          hybrid_score: 0.86,
        }));
      return { chunks: hits, insufficient_context: hits.length === 0 };
    },

    deleteKnowledgeSource: async (_token: string, workspaceId: string, sourceId: string) => {
      requireWorkspace(workspaceId);
      const idx = knowledgeSources.findIndex((s) => s.id === sourceId && s.workspace_id === workspaceId);
      if (idx >= 0) knowledgeSources.splice(idx, 1);
      return { action: "archived", embeddings_removed: 1 };
    },

    listOpportunities: async (_token: string, workspaceId: string, channelId?: string) => {
      requireWorkspace(workspaceId);
      return {
        items: opportunities.filter(
          (o) => o.workspace_id === workspaceId && (!channelId || o.channel_id === channelId)
        ),
      };
    },

    generateOpportunities: async (
      _token: string,
      workspaceId: string,
      body: { channel_id: string; topic_hint: string; target_format: string }
    ) => {
      requireWorkspace(workspaceId);
      const created = {
        id: nextId("opp"),
        workspace_id: workspaceId,
        channel_id: body.channel_id,
        theme: body.topic_hint.trim(),
        angle: `Investigacao estruturada (${body.target_format}) sobre causas pouco exploradas`,
        differentiation: "Cruzamento de evidencias historicas sem copiar embalagem concorrente",
        score: 0.81,
        score_version: "v1.2-sandbox",
        confidence: 0.72,
        status: "PROPOSED",
        insufficient_data: false,
        score_breakdown_json: { fit_editorial: 0.85, originalidade: 0.89, potencial_retencao: 0.74 },
        limitations_json: ["Gerado no Sandbox Local Efemero."],
        analyst_reports_json: [],
      };
      opportunities.unshift(created);
      return { opportunity: { id: created.id, theme: created.theme, score: created.score, status: created.status } };
    },

    reviewOpportunity: async (
      _token: string,
      workspaceId: string,
      opportunityId: string,
      body: { decision: string }
    ) => {
      requireWorkspace(workspaceId);
      const opp = opportunities.find((o) => o.id === opportunityId && o.workspace_id === workspaceId);
      if (!opp) {
        throw new SandboxError(404, { code: "RESOURCE_NOT_FOUND", message: "Oportunidade nao encontrada.", retryable: false });
      }
      opp.status = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      return { opportunity: { id: opp.id, status: opp.status }, fine_tuning_claimed: false };
    },

    listBriefs: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return { items: briefs.filter((b) => b.workspace_id === workspaceId) };
    },

    createBrief: async (
      _token: string,
      workspaceId: string,
      body: { opportunity_id: string; title: string; hook: string; angle: string }
    ) => {
      requireWorkspace(workspaceId);
      const id = nextId("brief");
      const b = {
        id,
        workspace_id: workspaceId,
        brief_group_id: nextId("bgrp"),
        version: 1,
        opportunity_id: body.opportunity_id,
        title: body.title.trim(),
        hook: body.hook.trim(),
        angle: body.angle.trim(),
        status: "DRAFT",
        content_sha256: `sandboxsha256${id.replace(/[^a-z0-9]/gi, "")}000000`,
        target_format: "long",
      };
      briefs.unshift(b);
      return { brief: { id: b.id, version: b.version, status: b.status } };
    },

    approveBrief: async (_token: string, workspaceId: string, briefId: string) => {
      requireWorkspace(workspaceId);
      const b = briefs.find((x) => x.id === briefId && x.workspace_id === workspaceId);
      if (!b) {
        throw new SandboxError(404, { code: "RESOURCE_NOT_FOUND", message: "Brief nao encontrado.", retryable: false });
      }
      b.status = "APPROVED";
      return { brief: { id: b.id, status: b.status } };
    },

    createBriefVersion: async (_token: string, workspaceId: string, briefId: string, title: string) => {
      requireWorkspace(workspaceId);
      const prev = briefs.find((x) => x.id === briefId && x.workspace_id === workspaceId);
      if (!prev) {
        throw new SandboxError(404, { code: "RESOURCE_NOT_FOUND", message: "Brief nao encontrado.", retryable: false });
      }
      const id = nextId("brief");
      const next = {
        ...prev,
        id,
        version: prev.version + 1,
        title: title.trim(),
        status: "DRAFT",
        content_sha256: `sandboxsha256${id.replace(/[^a-z0-9]/gi, "")}999999`,
      };
      briefs.unshift(next);
      return { brief: { id: next.id, version: next.version, status: next.status } };
    },

    exportBrief: async (_token: string, workspaceId: string, briefId: string, format: "markdown" | "json" | "csv" = "markdown") => {
      requireWorkspace(workspaceId);
      const b = briefs.find((x) => x.id === briefId && x.workspace_id === workspaceId);
      const content = b
        ? `# EpisodeBrief: ${b.title} (v${b.version})\n\n- **Status:** ${b.status}\n- **Hook 0-15s:** ${b.hook}\n- **Angulo:** ${b.angle}\n`
        : "# Brief vazio";
      return { format, filename: `brief-${briefId}.md`, content };
    },

    listCalendar: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return { items: calendarItems.filter((c) => c.workspace_id === workspaceId) };
    },

    createCalendarItem: async (
      _token: string,
      workspaceId: string,
      body: { channel_id: string; title: string; scheduled_for: string }
    ) => {
      requireWorkspace(workspaceId);
      const item = {
        id: nextId("cal"),
        workspace_id: workspaceId,
        channel_id: body.channel_id,
        title: body.title.trim(),
        scheduled_for: body.scheduled_for,
        status: "PLANNED_MANUAL",
        auto_publish_enabled: false,
      };
      calendarItems.push(item);
      return { item: { id: item.id } };
    },

    getProductionHealth: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return {
        available: false,
        mode: "sandbox_intent_only",
        reason: "Executor externo desconectado no Sandbox Local; intencoes idempotentes podem ser criadas e auditadas.",
      };
    },

    listProductionIntents: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return { items: prodIntents.filter((p) => p.workspace_id === workspaceId) };
    },

    createProductionIntent: async (_token: string, workspaceId: string, briefId: string, idempotencyKey: string) => {
      requireWorkspace(workspaceId);
      const brief = briefs.find((b) => b.id === briefId && b.workspace_id === workspaceId);
      if (!brief || brief.status !== "APPROVED") {
        throw new SandboxError(409, {
          code: "VERSION_CONFLICT",
          message: "Somente EpisodeBriefs APPROVED podem gerar intencao de producao.",
          retryable: false,
        });
      }
      const existing = prodIntents.find((p) => p.workspace_id === workspaceId && p.idempotency_key === idempotencyKey);
      if (existing) {
        return { intent: { id: existing.id, status: existing.status }, deduplicated: true };
      }
      const created = {
        id: nextId("pint"),
        workspace_id: workspaceId,
        brief_id: brief.id,
        brief_version: brief.version,
        idempotency_key: idempotencyKey,
        status: "READY_FOR_DISPATCH",
        manifest_validated: false,
        error_code: null,
        error_message: null,
      };
      prodIntents.unshift(created);
      return { intent: { id: created.id, status: created.status }, deduplicated: false };
    },

    dispatchProductionIntent: async (_token: string, workspaceId: string, intentId: string) => {
      requireWorkspace(workspaceId);
      const pi = prodIntents.find((p) => p.id === intentId && p.workspace_id === workspaceId);
      if (pi) {
        pi.status = "BLOCKED_CORE_OFFLINE";
        pi.error_code = "DARKFORGE_UNAVAILABLE";
        pi.error_message = "Nucleo executor externo nao conectado neste ambiente de preview.";
      }
      throw new SandboxError(503, {
        code: "DARKFORGE_UNAVAILABLE",
        message: "Executor externo indisponivel no Sandbox Local; intencao preservada com seguranca.",
        retryable: true,
      });
    },

    exportDiagnostics: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return {
        generated_at: nowIso(),
        workspace_id: workspaceId,
        mode: "local_ephemeral_sandbox",
        redaction_applied: true,
        secrets_exposed: 0,
        jobs_count: jobs.length,
      };
    },

    studioSessionStatus: async () => ({ authenticated: false, reason: "sandbox_mode_no_local_chromium" }),
    openStudioLoginWindow: async () => ({
      authenticated: false,
      next_action: "Execute com backend Python local + Chromium para abrir janela assistida do YouTube Studio.",
    }),
    createStudioRun: async (
      _token: string,
      workspaceId: string,
      body: { broad_topic: string }
    ) => {
      requireWorkspace(workspaceId);
      return {
        run: { id: nextId("srun"), status: "SANDBOX_SIMULATED" },
        terms: [
          { id: nextId("sterm"), term: `${body.broad_topic} documentario`, block_type: "top_search", audience_interest: "high", is_hypothesis: false },
          { id: nextId("sterm"), term: `${body.broad_topic} mapas antigos`, block_type: "content_gap", audience_interest: "medium", is_hypothesis: true },
        ],
        outliers: [],
      };
    },
    listStudioRuns: async () => ({ items: [] }),
    getStudioRunDetail: async (_token: string, _wsId: string, runId: string) => ({
      run: { id: runId, status: "COMPLETED", broad_topic: "Demo" },
      terms: [],
      outliers: [],
    }),

    listGoogleTrends: async () => ({ items: [...gtValidations] }),
    validateGoogleTrends: async (_token: string, workspaceId: string, body: { keyword: string; geo?: string; gprop?: string }) => {
      requireWorkspace(workspaceId);
      const item = {
        id: nextId("gt"),
        keyword: body.keyword.trim(),
        geo: body.geo ?? "BR",
        gprop: body.gprop ?? "youtube",
        direction_12m: "RISING",
        durability_5y: "EVERGREEN",
        verdict: "SUSTAINABLE_GO",
        summary: "Curva estavel no Sandbox Local; importe CSV real do Google Trends para numeros oficiais.",
        points_12m_json: [{ value: 45 }, { value: 58 }, { value: 64 }, { value: 76 }],
        points_5y_json: [{ value: 40 }, { value: 52 }, { value: 61 }, { value: 74 }],
        breakout_queries_json: [{ term: `${body.keyword.trim()} historia real`, raw_label: "Breakout" }],
        rising_queries_json: [{ term: `${body.keyword.trim()} mapa`, raw_label: "+180%" }],
      };
      gtValidations.unshift(item);
      return { validation: item, cached: false };
    },
    importGoogleTrendsCsv: async (_token: string, workspaceId: string, body: { keyword: string; geo: string; gprop: string }) => {
      requireWorkspace(workspaceId);
      const item = {
        id: nextId("gtcsv"),
        keyword: body.keyword.trim(),
        geo: body.geo,
        gprop: body.gprop,
        direction_12m: "RISING",
        durability_5y: "EVERGREEN",
        verdict: "SUSTAINABLE_GO",
        summary: "CSV importado e validado no Sandbox Local.",
        points_12m_json: [{ value: 50 }, { value: 72 }, { value: 85 }],
        points_5y_json: [{ value: 48 }, { value: 66 }, { value: 82 }],
        breakout_queries_json: [],
        rising_queries_json: [],
      };
      gtValidations.unshift(item);
      return { validation: item };
    },

    getReverseEngineeringState: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return {
        audits: [...reAudits],
        viral_outliers: [...reOutliers],
        autopsies: [...reAutopsies],
        mechanisms: [...reMechanisms],
        batches: [...reBatches],
      };
    },

    runPhase1Channels: async (
      _token: string,
      workspaceId: string,
      body: {
        candidates: {
          external_channel_id: string;
          display_name: string;
          all_recent_20_30_views: number[];
          is_celebrity_or_mega_brand: boolean;
        }[];
      }
    ) => {
      requireWorkspace(workspaceId);
      for (const c of body.candidates) {
        const views = c.all_recent_20_30_views.length > 0 ? c.all_recent_20_30_views : [1000];
        const mean = views.reduce((a, b) => a + b, 0) / views.length;
        const maxRatio = Number((Math.max(...views) / Math.max(1, mean)).toFixed(2));
        const hits = views.filter((v) => v >= mean * 3).length;
        const approved = !c.is_celebrity_or_mega_brand && hits >= 2 && maxRatio >= 3;
        reAudits.unshift({
          id: nextId("aud"),
          display_name: c.display_name,
          approved,
          channel_mean_views: mean,
          outlier_hits_count: hits,
          max_outlier_ratio: maxRatio,
          ranking_score: approved ? Number((maxRatio * 1.2).toFixed(2)) : 0.4,
          failed_criteria_json: c.is_celebrity_or_mega_brand ? ["celebrity_dependency"] : hits < 2 ? ["fewer_than_2_outliers"] : [],
          warnings_json: [],
        });
      }
      const selectedCount = reAudits.filter((a) => a.approved).length;
      return {
        selected_count: selectedCount,
        meets_5_to_10_target: selectedCount >= 5 && selectedCount <= 10,
        recommendation: "Auditoria concluida.",
        audits: [...reAudits],
      };
    },

    runPhase2Outliers: async (
      _token: string,
      workspaceId: string,
      body: {
        small_niche: boolean;
        videos: {
          external_video_id: string;
          channel_name: string;
          title: string;
          views: number;
          days_since_upload: number;
          topic: string;
        }[];
      }
    ) => {
      requireWorkspace(workspaceId);
      const mean = body.videos.reduce((s, v) => s + v.views, 0) / Math.max(1, body.videos.length);
      const threshold = body.small_niche ? 2.0 : 3.0;
      for (const v of body.videos) {
        const ratio = Number((v.views / Math.max(1, mean)).toFixed(2));
        if (ratio >= threshold) {
          reOutliers.unshift({
            id: nextId("vout"),
            external_video_id: v.external_video_id,
            channel_name: v.channel_name,
            title: v.title,
            views: v.views,
            days_since_upload: v.days_since_upload,
            views_per_day: v.views / Math.max(1, v.days_since_upload),
            channel_mean_views: mean,
            outlier_ratio: ratio,
            pattern_key: v.topic.toLowerCase().replace(/\s+/g, "_"),
            confirmed_multi_channel: false,
            is_false_positive: false,
            false_positive_reasons_json: [],
          });
        }
      }
      return { valid_outliers: [...reOutliers], confirmed_patterns: [], channel_summaries: [] };
    },

    runPhase3Autopsy: async (
      _token: string,
      workspaceId: string,
      body: { external_video_id: string; title: string; transcript_or_notes: string; comments: string[] }
    ) => {
      requireWorkspace(workspaceId);
      const au = {
        id: nextId("aut"),
        external_video_id: body.external_video_id,
        original_title: body.title,
        narrative_archetype: "misterio_investigativo",
        confidence: 0.84,
        package_json: {
          promise_structure: "Contraste entre mapa oficial e rota real",
          central_tension: "Por que essa rota desapareceu dos registros?",
        },
        script_retention_json: {
          hook_0_15s: body.transcript_or_notes.slice(0, 120) || "Abertura direta no paradoxo",
        },
        comment_gaps_json: {
          viewer_questions: body.comments.slice(0, 3),
        },
      };
      reAutopsies.unshift(au);
      return { autopsy: { id: au.id, original_title: au.original_title, narrative_archetype: au.narrative_archetype } };
    },

    runPhase4Synthesize: async (
      _token: string,
      workspaceId: string,
      body: { own_validated_topic: string; new_angle: string; target_format: string }
    ) => {
      requireWorkspace(workspaceId);
      const mech = {
        id: nextId("mech"),
        formula_theme: body.own_validated_topic,
        formula_angle: body.new_angle,
        formula_emotion: "curiosidade_epistemica",
        formula_structure: "paradoxo_0_15s -> prova_documental -> reviravolta_logistica",
        formula_format: body.target_format,
        synthesized_title: `${body.own_validated_topic}: ${body.new_angle}`,
        synthesized_thumb_concept: "Mapa antigo em alto contraste com seta apontando rota bloqueada",
        originality_blocked: false,
        originality_max_similarity: 0.16,
      };
      reMechanisms.unshift(mech);
      return {
        mechanism: {
          id: mech.id,
          synthesized_title: mech.synthesized_title,
          synthesized_thumb_concept: mech.synthesized_thumb_concept,
        },
      };
    },

    createExperimentBatch: async (_token: string, workspaceId: string, body: { title: string }) => {
      requireWorkspace(workspaceId);
      const b = {
        id: nextId("batch"),
        title: body.title,
        status: "AWAITING_MANUAL_PUBLISH",
        impressions: null,
        ctr_pct: null,
        retention_30s_pct: null,
      };
      reBatches.unshift(b);
      return { batch: { id: b.id, title: b.title, status: b.status } };
    },

    getReportsOverview: async (_token: string, workspaceId: string, channelId?: string): Promise<ReportsOverviewDTO> => {
      requireWorkspace(workspaceId);
      const wsChannels = channels.filter((c) => c.workspace_id === workspaceId);
      return {
        generated_at: nowIso(),
        workspace_id: workspaceId,
        channel_id_filter: channelId ?? null,
        summary: {
          channels_count: wsChannels.length,
          phase1_audits_total: reAudits.length,
          phase1_selected_count: reAudits.filter((a) => a.approved).length,
          phase2_outliers_total: reOutliers.length,
          phase2_valid_outliers: reOutliers.filter((o) => !o.is_false_positive).length,
          phase3_autopsies_count: reAutopsies.length,
          phase4_mechanisms_count: reMechanisms.length,
          experiment_batches_count: reBatches.length,
          studio_runs_count: 0,
          studio_terms_count: 0,
          studio_outliers_count: 0,
          google_trends_count: gtValidations.length,
          google_trends_sustainable_count: gtValidations.filter((g) => g.verdict === "SUSTAINABLE_GO").length,
          opportunities_count: opportunities.length,
          opportunities_approved_count: opportunities.filter((o) => o.status === "APPROVED").length,
          briefs_count: briefs.length,
          briefs_approved_count: briefs.filter((b) => b.status === "APPROVED").length,
          calendar_items_count: calendarItems.length,
        },
        channels: wsChannels.map((c) => ({
          id: c.id,
          display_name: c.display_name,
          handle: c.handle,
          external_channel_id: c.external_channel_id,
          status: c.status,
        })),
        reverse_engineering: {
          audits: [...reAudits],
          viral_outliers: [...reOutliers],
          autopsies: [...reAutopsies],
          mechanisms: [...reMechanisms],
          batches: [...reBatches],
        },
        studio_trends: { runs: [], terms: [], outliers: [] },
        google_trends: [...gtValidations],
        opportunities: [...opportunities],
        briefs: briefs.map((b) => ({
          id: b.id,
          title: b.title,
          version: b.version,
          status: b.status,
          target_format: b.target_format,
          hook: b.hook,
        })),
        calendar: calendarItems.map((c) => ({
          id: c.id,
          title: c.title,
          scheduled_for: c.scheduled_for,
          status: c.status,
        })),
        diagnostics: {
          generated_at: nowIso(),
          environment_flags: { sandbox_ephemeral_mode: true, zero_secret_bundle: true },
          redaction_applied: true,
          jobs_recent: jobs.slice(0, 5).map((j) => ({
            id: j.id,
            job_type: j.job_type,
            status: j.status,
            error_code: j.error_code,
          })),
        },
      };
    },

    exportExecutiveMarkdown: async (_token: string, workspaceId: string): Promise<string> => {
      requireWorkspace(workspaceId);
      return `# Relatorio Executivo — DarkForge Channel OS (Sandbox Local)\n\n- Canais ativos: ${channels.length}\n- Oportunidades avaliadas: ${opportunities.length}\n- Briefs versionados: ${briefs.length}\n- Integridade de metricas: Ausencia preservada como UNKNOWN (zero fabricacao).\n`;
    },

    // 2.5D Studio methods
    getStudioSnapshot: async (
      _token: string,
      workspaceId: string,
      channelId: string,
      contentItemId?: string
    ): Promise<StudioSnapshot> => {
      requireWorkspace(workspaceId);
      const ch = channels.find((c) => c.id === channelId) ?? channels[0];
      const ver = (profileVersions[ch.id] ?? [])[0] ?? null;
      const agents = ensureStudioChannel(workspaceId, ch.id);
      const items = studioItemsByChannel.get(ch.id) ?? [];
      const activeItem = items.find((i) => i.content_item_id === contentItemId) ?? items[0] ?? null;
      const events = studioEventsByChannel.get(ch.id) ?? [];
      const outputs = studioOutputsByChannel.get(ch.id) ?? [];

      const rooms: StudioRoomState[] = STUDIO_ROOMS_DEF.map((r) => {
        const inRoom = agents.filter((a) => a.room_key === r.key);
        return {
          workspace_id: workspaceId,
          channel_id: ch.id,
          room_key: r.key,
          room_label: r.label,
          sort_order: r.sort_order,
          working: inRoom.filter((a) => a.status === "working" || a.status === "queued").length,
          awaiting_human: inRoom.filter((a) => a.status === "waiting_approval" || a.status === "needs_review").length,
          blocked: inRoom.filter((a) => a.status === "blocked").length,
          failed: inRoom.filter((a) => a.status === "failed").length,
          agents: inRoom.length,
          disabled_agents: inRoom.filter((a) => !a.enabled).length,
        };
      });

      return {
        channel: {
          id: ch.id,
          workspace_id: workspaceId,
          display_name: ch.display_name,
          handle: ch.handle,
          status: ch.status,
          external_channel_id: ch.external_channel_id ?? null,
          active_profile_version_id: ch.active_profile_version_id,
          profile_version_number: ver?.version_number ?? 1,
          niche: ver?.niche ?? null,
          language: ver?.language ?? "pt-BR",
          editorial_theme: ver?.editorial_theme ?? null,
        },
        rooms,
        agents: agents.map((a) => ({ ...a })),
        content_items: [...items],
        active_content_item: activeItem ? { ...activeItem } : null,
        latest_opportunity: outputs.find((o) => o.agent_key === "estrategia") ?? null,
        metrics_panel: {
          cards: [
            {
              key: "views_28d",
              metric_id: "views_28d",
              label: "Views (28d)",
              unit: "count",
              value: null,
              delta_pct: null,
              availability: "unknown",
              stale: false,
              fetched_at: null,
              source: null,
            },
            {
              key: "ctr_28d",
              metric_id: "ctr_28d",
              label: "CTR Impressoes",
              unit: "pct",
              value: null,
              delta_pct: null,
              availability: "unknown",
              stale: false,
              fetched_at: null,
              source: null,
            },
          ],
          series: [],
          fetched_at: null,
          availability: "unknown",
          stale: false,
        },
        recent_events: [...events].slice(-30),
        latest_event_by_agent: {},
        item_outputs: activeItem ? outputs.filter((o) => o.content_item_id === activeItem.content_item_id) : [],
        handoffs: [],
        approvals: [...(studioApprovalsByChannel.get(ch.id) ?? [])],
        last_event_id: events.length > 0 ? events[events.length - 1].id : 0,
        darkforge_available: false,
        snapshot_at: nowIso(),
      };
    },

    getStudioEvents: async (_token: string, workspaceId: string, channelId: string, afterId = 0) => {
      requireWorkspace(workspaceId);
      ensureStudioChannel(workspaceId, channelId);
      const events = (studioEventsByChannel.get(channelId) ?? []).filter((e) => e.id > afterId);
      const all = studioEventsByChannel.get(channelId) ?? [];
      return { events, last_event_id: all.length > 0 ? all[all.length - 1].id : afterId };
    },

    getStudioRoomDetail: async (_token: string, workspaceId: string, channelId: string, roomKey: string): Promise<RoomDetailResponse> => {
      requireWorkspace(workspaceId);
      const agents = ensureStudioChannel(workspaceId, channelId).filter((a) => a.room_key === roomKey);
      const roomDef = STUDIO_ROOMS_DEF.find((r) => r.key === roomKey) ?? STUDIO_ROOMS_DEF[0];
      const runs = (studioRunsByChannel.get(channelId) ?? []).filter((r) =>
        agents.some((a) => a.agent_key === r.agent_key)
      );
      const outputs = (studioOutputsByChannel.get(channelId) ?? []).filter((o) =>
        agents.some((a) => a.agent_key === o.agent_key)
      );
      return {
        room: { key: roomDef.key, label: roomDef.label, sort_order: roomDef.sort_order },
        agents,
        recent_runs: runs,
        recent_outputs: outputs,
      };
    },

    getStudioAgentDetail: async (_token: string, workspaceId: string, channelId: string, agentKey: string): Promise<AgentDetailResponse> => {
      requireWorkspace(workspaceId);
      const agents = ensureStudioChannel(workspaceId, channelId);
      const agent = agents.find((a) => a.agent_key === agentKey) ?? agents[0];
      return {
        agent: { ...agent },
        runs: (studioRunsByChannel.get(channelId) ?? []).filter((r) => r.agent_key === agent.agent_key),
        outputs: (studioOutputsByChannel.get(channelId) ?? []).filter((o) => o.agent_key === agent.agent_key),
      };
    },

    updateStudioChannelAgent: async (
      _token: string,
      workspaceId: string,
      channelId: string,
      agentKey: string,
      body: { enabled?: boolean; display_name?: string; monthly_budget_cents?: number; clear_budget?: boolean }
    ) => {
      requireWorkspace(workspaceId);
      const agents = ensureStudioChannel(workspaceId, channelId);
      const agent = agents.find((a) => a.agent_key === agentKey);
      if (agent) {
        if (typeof body.enabled === "boolean") {
          agent.enabled = body.enabled;
          agent.status = body.enabled ? "idle" : "disabled";
        }
        if (body.display_name) agent.display_name = body.display_name;
        if (body.clear_budget) agent.monthly_budget_cents = null;
        else if (typeof body.monthly_budget_cents === "number") agent.monthly_budget_cents = body.monthly_budget_cents;
      }
      return { agent: { ...(agent ?? {}) } };
    },

    createStudioContentItem: async (
      _token: string,
      workspaceId: string,
      channelId: string,
      body: { working_title: string }
    ) => {
      requireWorkspace(workspaceId);
      ensureStudioChannel(workspaceId, channelId);
      const item: ContentItemPipeline = {
        content_item_id: nextId("ci"),
        workspace_id: workspaceId,
        channel_id: channelId,
        working_title: body.working_title.trim(),
        opportunity_id: null,
        brief_id: null,
        brief_version: null,
        stage: "pesquisa",
        status: "in_progress",
        scheduled_for: null,
        published_video_url: null,
        published_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        latest_outputs: {},
      };
      const items = studioItemsByChannel.get(channelId) ?? [];
      items.unshift(item);
      studioItemsByChannel.set(channelId, items);
      return { content_item: item, deduplicated: false, enqueued_runs: [] };
    },

    runStudioAgent: async (
      _token: string,
      workspaceId: string,
      channelId: string,
      agentKey: string,
      body: { content_item_id?: string | null; reason?: string }
    ) => {
      requireWorkspace(workspaceId);
      const agents = ensureStudioChannel(workspaceId, channelId);
      const agent = agents.find((a) => a.agent_key === agentKey)!;
      const runId = nextId("run");
      const finalStatus = agent.requires_approval ? "waiting_approval" : "done";
      agent.run_id = runId;
      agent.content_item_id = body.content_item_id ?? null;
      agent.status = finalStatus;
      agent.stage_label = agent.requires_approval ? "Aguardando aprovacao humana" : "Concluido";
      agent.progress = 100;
      agent.started_at = nowIso();
      agent.finished_at = nowIso();

      const runRec: AgentRunRecord = {
        id: runId,
        channel_agent_id: agent.channel_agent_id,
        agent_key: agent.agent_key,
        content_item_id: body.content_item_id ?? null,
        job_id: null,
        parent_run_id: null,
        status: finalStatus,
        stage_label: agent.stage_label,
        progress: 100,
        attempt: 1,
        model_id: "sandbox-deterministic-v1",
        provider: "local_sandbox",
        cost_estimate_cents: 0,
        heartbeat_at: nowIso(),
        started_at: nowIso(),
        finished_at: nowIso(),
        error_code: null,
        error_message: null,
        created_at: nowIso(),
      };
      studioRunsByChannel.get(channelId)?.unshift(runRec);

      const outId = nextId("out");
      const outRec: AgentOutput = {
        id: outId,
        workspace_id: workspaceId,
        channel_id: channelId,
        run_id: runId,
        content_item_id: body.content_item_id ?? null,
        agent_key: agent.agent_key,
        output_type: `${agent.agent_key}_artifact`,
        schema_version: 1,
        version: 1,
        content: {
          summary: `Artefato estruturado gerado por ${agent.display_name} no Sandbox Local.`,
          reason: body.reason ?? "Execucao manual pelo operador",
          requires_human_gate: agent.requires_approval,
        },
        content_hash: `hash-${outId}`,
        status: agent.requires_approval ? "needs_review" : "validated",
        validation: { valid: true, warnings: [] },
        originality_score: 0.91,
        author_kind: "agent",
        created_at: nowIso(),
      };
      studioOutputsByChannel.get(channelId)?.unshift(outRec);

      const ev: StudioEvent = {
        id: studioEventSeq++,
        workspace_id: workspaceId,
        channel_id: channelId,
        run_id: runId,
        content_item_id: body.content_item_id ?? null,
        agent_key: agent.agent_key,
        seq: 1,
        event_type: agent.requires_approval ? "needs_review" : "completed",
        summary: `${agent.display_name} gerou output v1 (${outRec.status}).`,
        payload: { output_id: outId },
        created_at: nowIso(),
      };
      studioEventsByChannel.get(channelId)?.push(ev);

      return { run: runRec, deduplicated: false };
    },

    cancelStudioRun: async (_token: string, _workspaceId: string, runId: string) => ({
      run: {
        id: runId,
        channel_agent_id: "ca-1",
        agent_key: "dados" as AgentKey,
        content_item_id: null,
        job_id: null,
        parent_run_id: null,
        status: "cancelled" as const,
        stage_label: "Cancelado",
        progress: 0,
        attempt: 1,
        model_id: null,
        provider: null,
        cost_estimate_cents: 0,
        heartbeat_at: null,
        started_at: null,
        finished_at: nowIso(),
        error_code: null,
        error_message: null,
        created_at: nowIso(),
      },
    }),

    retryStudioRun: async (_token: string, _workspaceId: string, runId: string) => ({
      run: {
        id: runId,
        channel_agent_id: "ca-1",
        agent_key: "dados" as AgentKey,
        content_item_id: null,
        job_id: null,
        parent_run_id: null,
        status: "done" as const,
        stage_label: "Reprocessado",
        progress: 100,
        attempt: 2,
        model_id: null,
        provider: null,
        cost_estimate_cents: 0,
        heartbeat_at: nowIso(),
        started_at: nowIso(),
        finished_at: nowIso(),
        error_code: null,
        error_message: null,
        created_at: nowIso(),
      },
    }),

    submitStudioApproval: async (
      _token: string,
      workspaceId: string,
      channelId: string,
      body: {
        target_kind: "agent_output" | "opportunity" | "brief" | "publication_plan";
        target_id: string;
        target_version: number;
        decision: "approved" | "rejected" | "changes_requested";
        reason?: string;
      }
    ) => {
      requireWorkspace(workspaceId);
      ensureStudioChannel(workspaceId, channelId);
      const rec: ApprovalRecord = {
        id: nextId("appr"),
        target_kind: body.target_kind,
        target_id: body.target_id,
        target_version: body.target_version,
        decision: body.decision,
        reason: body.reason ?? null,
        decided_by: SANDBOX_USER_EMAIL,
        decided_at: nowIso(),
      };
      studioApprovalsByChannel.get(channelId)?.unshift(rec);
      const out = studioOutputsByChannel.get(channelId)?.find((o) => o.id === body.target_id);
      if (out) {
        out.status = body.decision === "approved" ? "approved" : "rejected";
        const agent = studioAgentsByChannel.get(channelId)?.find((a) => a.agent_key === out.agent_key);
        if (agent) {
          agent.status = body.decision === "approved" ? "done" : "needs_review";
          agent.stage_label = body.decision === "approved" ? "Aprovado pelo operador" : "Ajustes solicitados";
        }
      }
      return { approval: rec as unknown as Record<string, unknown>, enqueued_next_runs: [] };
    },

    reviseStudioOutput: async (
      _token: string,
      _workspaceId: string,
      outputId: string,
      body: { action: "save_version" | "discard"; edited_content?: Record<string, unknown> }
    ) => {
      for (const outputs of studioOutputsByChannel.values()) {
        const found = outputs.find((o) => o.id === outputId);
        if (found) {
          if (body.action === "save_version" && body.edited_content) {
            found.version += 1;
            found.content = body.edited_content;
            found.author_kind = "human";
            found.status = "validated";
          }
          return { output: { ...found }, action: body.action };
        }
      }
      throw new SandboxError(404, { code: "RESOURCE_NOT_FOUND", message: "Output nao encontrado.", retryable: false });
    },

    markStudioManualPublished: async (
      _token: string,
      _workspaceId: string,
      contentItemId: string,
      publishedVideoUrl: string
    ) => {
      for (const items of studioItemsByChannel.values()) {
        const item = items.find((i) => i.content_item_id === contentItemId);
        if (item) {
          item.published_video_url = publishedVideoUrl;
          item.published_at = nowIso();
          item.status = "published_manual";
          return { content_item: { ...item } as unknown as Record<string, unknown> };
        }
      }
      return { content_item: { content_item_id: contentItemId, published_video_url: publishedVideoUrl } };
    },

    getOrchestratorTopology: async (
      _token: string,
      workspaceId: string,
      params?: { division?: AgentDivisionKey; lead_key?: string }
    ): Promise<OrchestratorTopologyDTO> => {
      requireWorkspace(workspaceId);
      let leads = [...SANDBOX_ORCHESTRATOR_TOPOLOGY.leads];
      let subagents = [...SANDBOX_ORCHESTRATOR_TOPOLOGY.subagents];
      if (params?.division) {
        leads = leads.filter((l) => l.division === params.division);
        subagents = subagents.filter((s) => s.division === params.division);
      }
      if (params?.lead_key) {
        leads = leads.filter((l) => l.key === params.lead_key);
        subagents = subagents.filter((s) => s.lead_key === params.lead_key);
      }
      return {
        master: SANDBOX_ORCHESTRATOR_TOPOLOGY.master,
        leads,
        subagents,
        PresetMissions: [...SANDBOX_ORCHESTRATOR_TOPOLOGY.PresetMissions],
      };
    },

    planOrchestratorMission: async (
      _token: string,
      workspaceId: string,
      body: {
        objective: string;
        scope: MissionScopeKey;
        lead_keys?: string[];
        subagent_keys?: string[];
      }
    ) => {
      requireWorkspace(workspaceId);
      if (!body.objective || body.objective.trim().length < 5) {
        throw new SandboxError(422, {
          code: "VALIDATION_ERROR",
          message: "Descreva o objetivo da missao com pelo menos 5 caracteres.",
          retryable: false,
        });
      }
      return { plan: buildSandboxMissionPlan(body) };
    },

    executeOrchestratorMission: async (
      _token: string,
      workspaceId: string,
      body: {
        objective: string;
        scope: MissionScopeKey;
        channel_id?: string | null;
        lead_keys?: string[];
        subagent_keys?: string[];
        approve_human_gates?: boolean;
      }
    ): Promise<{ report: OrchestratorExecutionReportDTO }> => {
      requireWorkspace(workspaceId);
      if (!body.objective || body.objective.trim().length < 5) {
        throw new SandboxError(422, {
          code: "VALIDATION_ERROR",
          message: "Descreva o objetivo da missao com pelo menos 5 caracteres.",
          retryable: false,
        });
      }
      const plan = buildSandboxMissionPlan(body);
      let pendingGates = 0;
      const executed_steps = plan.steps.map((st) => {
        const isFinalPublish = st.subagent_key === "publicacao.human_gate_enforcer";
        const waiting = isFinalPublish || (st.requires_human_gate && !body.approve_human_gates);
        if (waiting) pendingGates += 1;
        const status: "completed" | "waiting_human_gate" = waiting ? "waiting_human_gate" : "completed";
        const artifactType = st.expected_outputs[0] ?? `${st.domain}_artifact`;
        return {
          step_order: st.step_order,
          lead_key: st.lead_key,
          subagent_key: st.subagent_key,
          subagent_display_name: st.subagent_display_name,
          division: st.division,
          domain: st.domain,
          status,
          artifact_type: artifactType,
          summary: `${st.subagent_display_name} gerou '${artifactType}' (${waiting ? "aguardando aprovacao humana" : "validado"}).`,
          checks_passed: st.skills_activated.map((sk) => `skill:${sk}`),
          guardrail_notes: st.guardrails_enforced,
          requires_human_gate: st.requires_human_gate,
          output_payload: {
            artifact_type: artifactType,
            expected_outputs: st.expected_outputs,
            studio_room_key: st.studio_room_key,
            requires_human_publish: true,
          },
        };
      });

      return {
        report: {
          execution_id: nextId("exec"),
          plan_id: plan.plan_id,
          workspace_id: workspaceId,
          channel_id: body.channel_id ?? null,
          objective: plan.objective,
          scope: plan.scope,
          overall_status: pendingGates > 0 ? "waiting_human_approval" : "completed",
          executed_steps,
          completed_count: executed_steps.filter((s) => s.status === "completed").length,
          human_gate_pending_count: pendingGates,
          requires_human_publish: true,
          auto_publish_enabled: false,
          limitations: plan.limitations,
          created_at: nowIso(),
        },
      };
    },

    getModelingPresets: async (_token: string, workspaceId: string) => {
      requireWorkspace(workspaceId);
      return { candidates: DEFAULT_MODELING_CANDIDATES.map((c) => ({ ...c })) };
    },

    generateModelingPlaybook: async (
      _token: string,
      workspaceId: string,
      body: ModelingPlaybookRequestDTO
    ) => {
      requireWorkspace(workspaceId);
      if (!body.focus_topic || body.focus_topic.trim().length < 2) {
        throw new SandboxError(422, {
          code: "VALIDATION_ERROR",
          message: "Informe um tema base válido para modelagem.",
          retryable: false,
        });
      }
      const forbidden = (body.forbidden_topics ?? []).map((f) => f.toLowerCase().trim()).filter(Boolean);
      const lowTopic = `${body.focus_topic} ${body.custom_angle ?? ""}`.toLowerCase();
      for (const f of forbidden) {
        if (lowTopic.includes(f)) {
          throw new SandboxError(422, {
            code: "VALIDATION_ERROR",
            message: `Tema ou ângulo viola restrição editorial do canal: '${f}'.`,
            retryable: false,
          });
        }
      }
      const cands = body.candidates.length > 0 ? body.candidates : DEFAULT_MODELING_CANDIDATES;
      return { playbook: buildSandboxModelingPlaybook({ ...body, candidates: cands }) };
    },
  };
}

export const defaultSandboxApi = createSandboxStore();
