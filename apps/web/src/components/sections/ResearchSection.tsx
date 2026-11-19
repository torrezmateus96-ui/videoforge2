"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  DEFAULT_MODELING_CANDIDATES,
  type ModelingCandidateChannelDTO,
  type ReferenceModelingPlaybookDTO,
} from "@/lib/reference-modeling";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

type ResearchMainTab = "modeling" | "trends" | "reverse_lab";
type ModelingResultView = "cohort" | "themes" | "titles" | "thumbnails";

export default function ResearchSection() {
  const {
    accessToken,
    activeWorkspaceId,
    activeChannelId,
    activeChannel,
    activeVersion,
    reportError,
    setSection,
  } = useWorkspaceShell();

  const [mainTab, setMainTab] = useState<ResearchMainTab>("modeling");
  const [modelingView, setModelingView] = useState<ModelingResultView>("cohort");

  // --- New Smart Reference Channel Selection & 3-Axis Modeling State ---
  const [modelingCandidates, setModelingCandidates] = useState<ModelingCandidateChannelDTO[]>(
    () => DEFAULT_MODELING_CANDIDATES.map((c) => ({ ...c }))
  );
  const [focusTopic, setFocusTopic] = useState("O Estreito Esquecido do Século XVII");
  const [customAngle, setCustomAngle] = useState("");
  const [minOutlierMult, setMinOutlierMult] = useState(3.0);
  const [modelingLoading, setModelingLoading] = useState(false);
  const [playbook, setPlaybook] = useState<ReferenceModelingPlaybookDTO | null>(null);
  const [studioSentNotice, setStudioSentNotice] = useState<string | null>(null);

  // Quick Add Candidate Channel State
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candName, setCandName] = useState("");
  const [candSubs, setCandSubs] = useState("34000");
  const [candBaseViews, setCandBaseViews] = useState("6500");
  const [candFormat, setCandFormat] = useState("faceless_essay");
  const [candTags, setCandTags] = useState("historia, geopolitica, mapas");
  const [candOut1Title, setCandOut1Title] = useState("");
  const [candOut1Views, setCandOut1Views] = useState("96000");
  const [candOut1Thumb, setCandOut1Thumb] = useState("Mapa escuro com ponto de bloqueio âmbar isolado");
  const [candOut2Title, setCandOut2Title] = useState("");
  const [candOut2Views, setCandOut2Views] = useState("74000");
  const [candCelebrity, setCandCelebrity] = useState(false);
  const [candBreakingNews, setCandBreakingNews] = useState(false);

  // --- Existing SP-04/SP-05, Studio Trends, Google Trends & 4-Phase RE State ---
  const [refs, setRefs] = useState<{ channels: Record<string, unknown>[]; videos: Record<string, unknown>[] }>({
    channels: [],
    videos: [],
  });
  const [titleInput, setTitleInput] = useState("");
  const [titleAnalysis, setTitleAnalysis] = useState<{
    features_json: { features: string[] };
    editorial_formula: string;
    limitations_json: string[];
  } | null>(null);
  const [titleTopic, setTitleTopic] = useState("");
  const [titleAlts, setTitleAlts] = useState<
    { title: string; differentiation: string; originality: { approval_blocked: boolean; max_similarity: number } }[]
  >([]);

  const [studioTopic, setStudioTopic] = useState("");
  const [studioMinInterest, setStudioMinInterest] = useState("medium");
  const [studioWatchedOnly, setStudioWatchedOnly] = useState(true);
  const [studioDays, setStudioDays] = useState(28);
  const [studioMinOutlier, setStudioMinOutlier] = useState(3);
  const [studioSession, setStudioSession] = useState<{ authenticated: boolean; reason: string } | null>(null);
  const [studioTerms, setStudioTerms] = useState<
    { id: string; term: string; block_type: string; audience_interest: string; is_hypothesis: boolean; gap_note: string }[]
  >([]);
  const [studioOutliers, setStudioOutliers] = useState<
    {
      id: string;
      title: string;
      canonical_url: string;
      outlier_ratio: number | null;
      outlier_tier: string;
      watched_by_my_viewers: boolean;
      public_views: number | null;
    }[]
  >([]);

  const [gtKeyword, setGtKeyword] = useState("");
  const [gtGeo, setGtGeo] = useState("BR");
  const [gtProp, setGtProp] = useState("youtube");
  const [gtCsv12m, setGtCsv12m] = useState("");
  const [gtCsv5y, setGtCsv5y] = useState("");
  const [gtCsvRel, setGtCsvRel] = useState("");
  const [gtItems, setGtItems] = useState<
    {
      id: string;
      keyword: string;
      geo: string;
      gprop: string;
      direction_12m: string;
      durability_5y: string;
      verdict: string;
      summary: string;
      points_12m_json: { value: number }[];
      points_5y_json: { value: number }[];
      breakout_queries_json: { term: string; raw_label: string }[];
      rising_queries_json: { term: string; raw_label: string }[];
    }[]
  >([]);

  const [reVidId, setReVidId] = useState("");
  const [reVidTitle, setReVidTitle] = useState("");
  const [reTranscript, setReTranscript] = useState("");
  const [reComments, setReComments] = useState("");
  const [reOwnTopic, setReOwnTopic] = useState("");
  const [reNewAngle, setReNewAngle] = useState("");
  const [reP1Name, setReP1Name] = useState("");
  const [reP1Lang, setReP1Lang] = useState("pt-BR");
  const [reP1Country, setReP1Country] = useState("BR");
  const [reP1Format, setReP1Format] = useState("faceless_essay");
  const [reP1Tags, setReP1Tags] = useState("historia, documentario");
  const [reP1Views20, setReP1Views20] = useState(
    "4500,4800,5100,4900,5000,4700,4600,5200,4400,5300,4950,5050,4800,4700,4600,5100,4900,5000,42000,68000"
  );
  const [reP1Views90d, setReP1Views90d] = useState("42000,68000");
  const [reP1Celebrity, setReP1Celebrity] = useState(false);
  const [reP2ChannelName, setReP2ChannelName] = useState("Canal Referencia");
  const [reP2Title, setReP2Title] = useState("");
  const [reP2Views, setReP2Views] = useState("92000");
  const [reP2Days, setReP2Days] = useState("14");
  const [reP2BaselineViews, setReP2BaselineViews] = useState("4500");
  const [reP2SmallNiche, setReP2SmallNiche] = useState(false);
  const [reState, setReState] = useState<{
    audits: {
      id: string;
      display_name: string;
      approved: boolean;
      max_outlier_ratio: number;
    }[];
    viral_outliers: {
      id: string;
      title: string;
      views_per_day: number;
      outlier_ratio: number;
    }[];
    autopsies: { id: string; original_title: string; narrative_archetype: string }[];
    mechanisms: {
      id: string;
      synthesized_title: string;
      synthesized_thumb_concept: string;
      formula_structure: string;
      originality_blocked: boolean;
      originality_max_similarity: number;
    }[];
    batches: { id: string; title: string; status: string }[];
  } | null>(null);

  const forbiddenTopics = ((activeVersion?.restrictions_json?.forbidden_topics as string[] | undefined) ?? []);

  async function runModelingSynthesis(
    nextCandidates?: ModelingCandidateChannelDTO[],
    overrideTopic?: string
  ) {
    if (!accessToken || !activeWorkspaceId) return;
    const topicToUse = (overrideTopic ?? focusTopic).trim();
    if (topicToUse.length < 2) return;
    setModelingLoading(true);
    try {
      const cands = nextCandidates ?? modelingCandidates;
      const res = await api.generateModelingPlaybook(accessToken, activeWorkspaceId, {
        channel_name: activeChannel?.display_name ?? "Arquivo Geopolitico",
        niche: activeVersion?.niche ?? "Documentarios Historicos & Geopolitica",
        editorial_theme: activeVersion?.editorial_theme ?? "Rotas estrategicas e imperios esquecidos",
        pillars:
          activeVersion?.pillars_json && activeVersion.pillars_json.length > 0
            ? activeVersion.pillars_json
            : ["Geopolitica classica", "Cartografia historica", "Economia maritima"],
        language: activeVersion?.language ?? "pt-BR",
        market_country: activeVersion?.country ?? "BR",
        feasible_formats:
          activeVersion?.formats_json && activeVersion.formats_json.length > 0
            ? [...activeVersion.formats_json, "faceless_essay", "long_documentary"]
            : ["faceless_essay", "long_documentary"],
        audience_tags: ["historia", "geopolitica", "documentario"],
        forbidden_topics: forbiddenTopics,
        min_outlier_ratio: minOutlierMult,
        focus_topic: topicToUse,
        custom_angle: customAngle,
        candidates: cands,
      });
      setPlaybook(res.playbook);
    } catch (err) {
      reportError(err);
    } finally {
      setModelingLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken || !activeWorkspaceId) return;
    void runModelingSynthesis();
    if (!activeChannelId) return;
    Promise.all([
      api
        .listStudioRuns(accessToken, activeWorkspaceId, activeChannelId)
        .then(async (r) => {
          if (r.items.length > 0) {
            const det = await api.getStudioRunDetail(accessToken, activeWorkspaceId, r.items[0].id);
            setStudioTerms(det.terms);
            setStudioOutliers(det.outliers);
          }
        })
        .catch(() => {}),
      api
        .listGoogleTrends(accessToken, activeWorkspaceId, activeChannelId)
        .then((r) => setGtItems(r.items))
        .catch(() => {}),
      api
        .getReverseEngineeringState(accessToken, activeWorkspaceId, activeChannelId)
        .then((st) => setReState(st))
        .catch(() => {}),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeWorkspaceId, activeChannelId]);

  function handleAddCustomCandidate() {
    const cleanName = candName.trim();
    const cleanOut1 = candOut1Title.trim();
    if (!cleanName || !cleanOut1) return;

    const subs = Math.max(100, Number(candSubs) || 25000);
    const baseVal = Math.max(100, Number(candBaseViews) || 5000);
    const out1Val = Math.max(500, Number(candOut1Views) || 65000);
    const out2Val = Math.max(500, Number(candOut2Views) || 48000);
    const tags = candTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const syntheticBase = [
      Math.round(baseVal * 0.88),
      Math.round(baseVal * 0.95),
      baseVal,
      Math.round(baseVal * 1.04),
      Math.round(baseVal * 0.92),
      Math.round(baseVal * 1.08),
      Math.round(baseVal * 0.97),
      Math.round(baseVal * 1.02),
      out1Val,
    ];
    const outlierSamples = [
      {
        title: cleanOut1,
        views: out1Val,
        days_since_upload: 21,
        thumbnail_cue: candOut1Thumb.trim() || "Elemento central isolado em alto contraste",
        thumbnail_overlay: "PONTO DE RUPTURA",
        topic_tag: tags[0] ?? "analise",
      },
    ];
    if (candOut2Title.trim()) {
      syntheticBase.push(out2Val);
      outlierSamples.push({
        title: candOut2Title.trim(),
        views: out2Val,
        days_since_upload: 38,
        thumbnail_cue: "Comparacao direta de escala em 2 elementos",
        thumbnail_overlay: "ANTES E DEPOIS",
        topic_tag: tags[1] ?? tags[0] ?? "analise",
      });
    }

    const newCandidate: ModelingCandidateChannelDTO = {
      external_channel_id: `UC_CUSTOM_${Date.now()}`,
      display_name: cleanName,
      handle: `@${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "canal"}`,
      language: activeVersion?.language ?? "pt-BR",
      market_country: activeVersion?.country ?? "BR",
      subscriber_count: subs,
      recent_views_sample: syntheticBase,
      recent_90d_views: [baseVal, out1Val],
      production_format: candFormat,
      niche_tags: tags,
      editorial_pillars: tags.slice(0, 2),
      is_celebrity_or_mega_brand: candCelebrity,
      relies_on_breaking_news: candBreakingNews,
      outlier_samples: outlierSamples,
    };

    const updated = [newCandidate, ...modelingCandidates];
    setModelingCandidates(updated);
    setCandName("");
    setCandOut1Title("");
    setCandOut2Title("");
    setShowAddCandidate(false);
    void runModelingSynthesis(updated);
  }

  async function handleSendTitleToStudio(modeledTitle: string) {
    if (!accessToken || !activeWorkspaceId || !activeChannelId) return;
    try {
      await api.createStudioContentItem(accessToken, activeWorkspaceId, activeChannelId, {
        working_title: modeledTitle,
        trigger_initial_agents: false,
      });
      setStudioSentNotice(`Pauta criada no Estúdio Editorial: "${modeledTitle}"`);
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <div className="modeling-section-stack">
      <section className="card">
        <div className="row-between mb-sm">
          <div>
            <h2>Pesquisa de Coorte &amp; Modelagem Estrutural (Temas · Títulos · Thumbs)</h2>
            <div className="meta-inline">
              <span>Canal alvo: {activeChannel?.display_name ?? "Selecione um canal"}</span>
              <span aria-hidden="true">·</span>
              <span>Mediana limpa aparada (anti-distorção de mega-hits)</span>
              <span aria-hidden="true">·</span>
              <span>Zero estimativa de CTR ou receita privada de terceiros (RES-006)</span>
            </div>
          </div>

          <div className="tabs-inline" role="tablist" aria-label="Modos de pesquisa e inteligência">
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "modeling"}
              className="tab-btn"
              onClick={() => setMainTab("modeling")}
            >
              Modelagem Tripla
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "trends"}
              className="tab-btn"
              onClick={() => setMainTab("trends")}
            >
              Studio &amp; Google Trends
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "reverse_lab"}
              className="tab-btn"
              onClick={() => setMainTab("reverse_lab")}
            >
              Autópsia &amp; Lotes (4 Fases)
            </button>
          </div>
        </div>

        {!activeWorkspaceId ? (
          <p className="muted">Selecione um workspace para calibrar canais de referência e modelar pautas.</p>
        ) : mainTab === "modeling" ? (
          <div>
            <div className="grid-2 mb-md">
              <div>
                <div className="field">
                  <label htmlFor="mod-focus-topic">Tema base para modelar nos pilares do seu canal</label>
                  <input
                    id="mod-focus-topic"
                    className="input"
                    placeholder="Ex: O Estreito Esquecido do Século XVII"
                    value={focusTopic}
                    onChange={(e) => setFocusTopic(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mod-custom-angle">Recorte / ângulo autoral opcional</label>
                  <input
                    id="mod-custom-angle"
                    className="input"
                    placeholder="Ex: gargalo logístico naval e mapas censurados"
                    value={customAngle}
                    onChange={(e) => setCustomAngle(e.target.value)}
                  />
                </div>
                <div className="row-wrap">
                  <label htmlFor="mod-mult" className="muted">
                    Múltiplo mínimo de outlier:
                  </label>
                  <select
                    id="mod-mult"
                    className="input input-compact tabular-nums"
                    value={minOutlierMult}
                    onChange={(e) => setMinOutlierMult(Number(e.target.value))}
                  >
                    <option value={2.2}>2.2x (Nicho compacto)</option>
                    <option value={3.0}>3.0x (Padrão rigoroso)</option>
                    <option value={4.5}>4.5x (Explosão viral)</option>
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={modelingLoading || focusTopic.trim().length < 2}
                    onClick={() => runModelingSynthesis()}
                  >
                    {modelingLoading ? "Recalculando Coorte..." : "Avaliar Canais & Modelar"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowAddCandidate((prev) => !prev)}
                  >
                    {showAddCandidate ? "Fechar Cadastro" : "Testar Novo Canal"}
                  </button>
                </div>
              </div>

              <div>
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="muted">Coorte Aprovada</div>
                    <div className="kpi-value tabular-nums status-text-ok">
                      {playbook ? `${playbook.cohort_summary.approved_count}/${playbook.cohort_summary.evaluated_count}` : "—"}
                    </div>
                    <div className="meta-inline tabular-nums">
                      <span>Pares diretos: {playbook?.cohort_summary.direct_peers_count ?? 0}</span>
                      <span aria-hidden="true">·</span>
                      <span>Adjacentes: {playbook?.cohort_summary.adjacent_packaging_count ?? 0}</span>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="muted">Armadilhas Filtradas</div>
                    <div className="kpi-value tabular-nums status-text-warn">
                      {playbook?.cohort_summary.rejected_count ?? 0}
                    </div>
                    <div className="meta-inline">
                      <span>Fama pura e hits isolados bloqueados</span>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="muted">Pacote Modelado</div>
                    <div className="kpi-value tabular-nums">
                      {playbook
                        ? `${playbook.modeled_themes.length} · ${playbook.modeled_titles.length} · ${playbook.modeled_thumbnails.length}`
                        : "—"}
                    </div>
                    <div className="meta-inline">
                      <span>Temas · Títulos · Thumbs (0% cópia)</span>
                    </div>
                  </div>
                </div>
                {playbook && (
                  <p className="muted">
                    <strong>Critério dos Agentes:</strong> {playbook.cohort_summary.methodology_note}
                  </p>
                )}
              </div>
            </div>

            {studioSentNotice && (
              <div className="banner mb-md row-between">
                <span>{studioSentNotice}</span>
                <button
                  type="button"
                  className="btn studio-btn-sm"
                  onClick={() => setSection("studio")}
                >
                  Abrir Estúdio Editorial
                </button>
              </div>
            )}

            {showAddCandidate && (
              <div className="analyst-card mb-md">
                <h3>Adicionar Canal Candidato à Auditoria de Referência</h3>
                <div className="grid-2">
                  <div>
                    <div className="field">
                      <label htmlFor="cand-name">Nome do canal candidato</label>
                      <input
                        id="cand-name"
                        className="input"
                        placeholder="Ex: Crônicas Marítimas"
                        value={candName}
                        onChange={(e) => setCandName(e.target.value)}
                      />
                    </div>
                    <div className="inline-grid-3">
                      <div className="field">
                        <label htmlFor="cand-subs">Inscritos</label>
                        <input
                          id="cand-subs"
                          type="number"
                          className="input tabular-nums"
                          value={candSubs}
                          onChange={(e) => setCandSubs(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="cand-base">Mediana base (views)</label>
                        <input
                          id="cand-base"
                          type="number"
                          className="input tabular-nums"
                          value={candBaseViews}
                          onChange={(e) => setCandBaseViews(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="cand-fmt">Formato</label>
                        <select
                          id="cand-fmt"
                          className="input"
                          value={candFormat}
                          onChange={(e) => setCandFormat(e.target.value)}
                        >
                          <option value="faceless_essay">Ensaio Faceless</option>
                          <option value="long_documentary">Documentário Longo</option>
                          <option value="map_investigation">Investigação em Mapa</option>
                          <option value="tv_broadcast_clip">Corte de TV / Bancada</option>
                          <option value="celebrity_vlog">Vlog de Celebridade</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="cand-tags">Pilares / palavras-chave do canal</label>
                      <input
                        id="cand-tags"
                        className="input"
                        value={candTags}
                        onChange={(e) => setCandTags(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="inline-grid-3">
                      <div className="field">
                        <label htmlFor="cand-o1-t">Título Outlier #1 (obrigatório)</label>
                        <input
                          id="cand-o1-t"
                          className="input"
                          placeholder="Ex: Por Que Este Porto Sumiu dos Mapas?"
                          value={candOut1Title}
                          onChange={(e) => setCandOut1Title(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="cand-o1-v">Views Outlier #1</label>
                        <input
                          id="cand-o1-v"
                          type="number"
                          className="input tabular-nums"
                          value={candOut1Views}
                          onChange={(e) => setCandOut1Views(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="cand-o2-v">Views Outlier #2</label>
                        <input
                          id="cand-o2-v"
                          type="number"
                          className="input tabular-nums"
                          value={candOut2Views}
                          onChange={(e) => setCandOut2Views(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="cand-o2-t">Título Outlier #2 (para provar repetibilidade)</label>
                      <input
                        id="cand-o2-t"
                        className="input"
                        placeholder="Deixe vazio para testar descarte de canal de 1 hit só"
                        value={candOut2Title}
                        onChange={(e) => setCandOut2Title(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="cand-thumb">Padrão visual observado na capa</label>
                      <input
                        id="cand-thumb"
                        className="input"
                        value={candOut1Thumb}
                        onChange={(e) => setCandOut1Thumb(e.target.value)}
                      />
                    </div>
                    <div className="row-wrap">
                      <label className="studio-check-label">
                        <input
                          type="checkbox"
                          checked={candCelebrity}
                          onChange={(e) => setCandCelebrity(e.target.checked)}
                        />
                        Celebridade / Mega-marca
                      </label>
                      <label className="studio-check-label">
                        <input
                          type="checkbox"
                          checked={candBreakingNews}
                          onChange={(e) => setCandBreakingNews(e.target.checked)}
                        />
                        Depende de Breaking News
                      </label>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!candName.trim() || !candOut1Title.trim()}
                        onClick={handleAddCustomCandidate}
                      >
                        Avaliar na Coorte
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <hr className="divider" />

            <div className="row-between mb-sm">
              <div className="tabs-inline" role="tablist" aria-label="Eixos de modelagem">
                <button
                  type="button"
                  role="tab"
                  aria-selected={modelingView === "cohort"}
                  className="tab-btn"
                  onClick={() => setModelingView("cohort")}
                >
                  01. Seleção de Canais ({playbook ? playbook.approved_channels.length : 0} aprovados)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modelingView === "themes"}
                  className="tab-btn"
                  onClick={() => setModelingView("themes")}
                >
                  02. Temas &amp; Ângulos ({playbook?.modeled_themes.length ?? 0})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modelingView === "titles"}
                  className="tab-btn"
                  onClick={() => setModelingView("titles")}
                >
                  03. Títulos por Arquétipo ({playbook?.modeled_titles.length ?? 0})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modelingView === "thumbnails"}
                  className="tab-btn"
                  onClick={() => setModelingView("thumbnails")}
                >
                  04. Blueprints de Thumbnail ({playbook?.modeled_thumbnails.length ?? 0})
                </button>
              </div>

              {modelingCandidates.length !== DEFAULT_MODELING_CANDIDATES.length && (
                <button
                  type="button"
                  className="btn studio-btn-sm"
                  onClick={() => {
                    const reset = DEFAULT_MODELING_CANDIDATES.map((c) => ({ ...c }));
                    setModelingCandidates(reset);
                    void runModelingSynthesis(reset);
                  }}
                >
                  Restaurar Coorte Padrão
                </button>
              )}
            </div>

            {modelingLoading && !playbook ? (
              <div>
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-short" />
              </div>
            ) : !playbook ? (
              <p className="muted">Informe um tema base e clique em Avaliar Canais &amp; Modelar.</p>
            ) : modelingView === "cohort" ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Canal Candidato &amp; Papel na Coorte</th>
                      <th className="text-right">Fitness</th>
                      <th className="text-right">Inscritos</th>
                      <th className="text-right">Mediana Limpa</th>
                      <th className="text-right">Pico / Inscritos</th>
                      <th className="text-right">Outliers</th>
                      <th>O Que Modelar · Diagnóstico Explicável</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...playbook.approved_channels, ...playbook.rejected_channels].map((ch) => (
                      <tr key={ch.external_channel_id}>
                        <td>
                          <strong>{ch.display_name}</strong>
                          <div className="meta-inline">
                            <span>{ch.handle}</span>
                            <span aria-hidden="true">·</span>
                            <span className={ch.approved ? "status-text-ok" : "status-text-err"}>
                              {ch.cohort_label}
                            </span>
                          </div>
                        </td>
                        <td className="text-right tabular-nums">
                          <strong>{ch.modeling_fitness_score.toFixed(1)}</strong>/100
                        </td>
                        <td className="text-right tabular-nums">{ch.subscriber_count.toLocaleString("pt-BR")}</td>
                        <td className="text-right tabular-nums">
                          {Math.round(ch.trimmed_median_views).toLocaleString("pt-BR")}
                        </td>
                        <td className="text-right tabular-nums">{ch.peak_outlier_to_sub_ratio.toFixed(2)}x</td>
                        <td className="text-right tabular-nums">
                          {ch.repeatable_outliers_count} ({ch.max_outlier_ratio}x)
                        </td>
                        <td>
                          {ch.approved ? (
                            <div>
                              <div className="meta-inline">
                                <strong>Modelar: {ch.recommended_axes.join(" · ").toUpperCase()}</strong>
                              </div>
                              <div className="muted">{ch.strengths[0]}</div>
                            </div>
                          ) : (
                            <div className="muted">
                              <strong className="status-text-warn">Bloqueado:</strong>{" "}
                              {ch.rejection_reasons.join(" ")}
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn studio-btn-xs"
                            disabled={modelingCandidates.length <= 1}
                            onClick={() => {
                              const filtered = modelingCandidates.filter(
                                (item) => item.external_channel_id !== ch.external_channel_id
                              );
                              setModelingCandidates(filtered);
                              void runModelingSynthesis(filtered);
                            }}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : modelingView === "themes" ? (
              <div className="modeling-hairline-list">
                {playbook.modeled_themes.map((tm, idx) => (
                  <div key={tm.theme_id} className="modeling-hairline-row">
                    <div className="row-between">
                      <strong>
                        0{idx + 1}. {tm.theme_headline}
                      </strong>
                      <div className="meta-inline tabular-nums">
                        <span>Pilar: {tm.target_pillar}</span>
                        <span aria-hidden="true">·</span>
                        <span>Validação cruzada: {tm.cross_channel_support} canais aprovados</span>
                      </div>
                    </div>
                    <p className="muted">
                      <strong>Tensão Estrutural Extraída:</strong> {tm.core_tension}
                    </p>
                    <p className="muted">
                      <strong>Sub-ângulo Inexplorado:</strong> {tm.untapped_sub_angle}
                    </p>
                    <div className="meta-inline">
                      <span>Gatilho psicográfico: {tm.psychographic_trigger}</span>
                      <span aria-hidden="true">·</span>
                      <span>Referências: {tm.inspired_by_channels.join(", ") || "Coorte padrão"}</span>
                      <span aria-hidden="true">·</span>
                      <span>Guardrail: {tm.differentiation_guardrail}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : modelingView === "titles" ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Título Original Modelado</th>
                      <th>Arquétipo &amp; Fórmula Sintática</th>
                      <th className="text-right">Extensão</th>
                      <th className="text-right">Similaridade Máx.</th>
                      <th>Promessa 0–30s &amp; Referência de Origem</th>
                      <th>Pauta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playbook.modeled_titles.map((tl) => (
                      <tr key={tl.option_index}>
                        <td>
                          <strong>{tl.title}</strong>
                          <div className="muted">{tl.differentiation_note}</div>
                        </td>
                        <td>
                          <div>{tl.archetype_label}</div>
                          <div className="meta-inline">
                            <span>{tl.syntactic_formula}</span>
                          </div>
                        </td>
                        <td className="text-right tabular-nums">
                          <span className={tl.mobile_fit ? "status-text-ok" : "status-text-warn"}>
                            {tl.char_count} chars
                          </span>
                        </td>
                        <td className="text-right tabular-nums">
                          <span className={tl.originality_passed ? "status-text-ok" : "status-text-err"}>
                            {(tl.max_similarity * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td>
                          <div>{tl.promise_0_30s_alignment}</div>
                          <div className="meta-inline">
                            <span>DNA extraído de: &ldquo;{tl.inspired_by_reference}&rdquo;</span>
                          </div>
                        </td>
                        <td>
                          {activeChannelId && (
                            <button
                              type="button"
                              className="btn studio-btn-sm"
                              onClick={() => handleSendTitleToStudio(tl.title)}
                            >
                              Usar no Estúdio
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="modeling-thumb-preview-grid">
                {playbook.modeled_thumbnails.map((th) => (
                  <div key={th.concept_index} className="modeling-thumb-frame">
                    <div className="row-between">
                      <strong>
                        0{th.concept_index}. {th.concept_label}
                      </strong>
                      <span className="status-text-ok tabular-nums">
                        {th.overlay_word_count} palavras · 0% repetição
                      </span>
                    </div>
                    <div className="modeling-overlay-specimen">{th.overlay_text}</div>
                    <div className="meta-inline">
                      <span>Pareado com: &ldquo;{th.paired_title}&rdquo;</span>
                    </div>
                    <p className="muted">
                      <strong>Foco Único (máx. 2 elementos):</strong> {th.focal_subject}
                    </p>
                    <p className="muted">
                      <strong>Conflito Visual Imediato:</strong> {th.visual_conflict}
                    </p>
                    <div className="meta-inline">
                      <span>Grid: {th.composition_grid}</span>
                      <span aria-hidden="true">·</span>
                      <span>Paleta: {th.color_polarity}</span>
                      <span aria-hidden="true">·</span>
                      <span>Inspiração estrutural: {th.inspired_by_reference}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : mainTab === "trends" ? (
          <div className="modeling-section-stack">
            {activeChannelId ? (
              <div>
                <h3>YouTube Studio Trends &amp; Outliers Assistidos</h3>
                <p className="muted">
                  Coleta assistida na sessão autenticada com detecção de mudança estrutural e disjuntor de falhas.
                </p>
                <div className="row-wrap mb-sm">
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      if (!accessToken) return;
                      try {
                        const st = await api.studioSessionStatus(accessToken, activeWorkspaceId, activeChannelId);
                        setStudioSession(st);
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Verificar Sessão Studio
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      if (!accessToken) return;
                      try {
                        const res = await api.openStudioLoginWindow(accessToken, activeWorkspaceId, activeChannelId);
                        setStudioSession({
                          authenticated: res.authenticated,
                          reason: res.authenticated ? "ativa" : (res.next_action ?? "pendente"),
                        });
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Abrir Login Manual YouTube Studio
                  </button>
                  {studioSession && (
                    <span className={studioSession.authenticated ? "status-text-ok" : "status-text-warn"}>
                      Sessão Studio: {studioSession.authenticated ? "Ativa" : studioSession.reason}
                    </span>
                  )}
                </div>

                <div className="row-wrap mb-sm">
                  <input
                    className="input input-medium"
                    placeholder="Tema amplo no Studio Trends..."
                    value={studioTopic}
                    onChange={(e) => setStudioTopic(e.target.value)}
                  />
                  <select
                    className="input input-compact"
                    value={studioMinInterest}
                    onChange={(e) => setStudioMinInterest(e.target.value)}
                  >
                    <option value="medium">Interesse: Médio+</option>
                    <option value="high">Interesse: Alto+</option>
                    <option value="very_high">Interesse: Muito Alto</option>
                  </select>
                  <select
                    className="input input-compact tabular-nums"
                    value={studioDays}
                    onChange={(e) => setStudioDays(Number(e.target.value))}
                  >
                    <option value={28}>Últimos 28 dias</option>
                    <option value={90}>Últimos 90 dias</option>
                    <option value={365}>Último ano</option>
                  </select>
                  <select
                    className="input input-compact tabular-nums"
                    value={studioMinOutlier}
                    onChange={(e) => setStudioMinOutlier(Number(e.target.value))}
                  >
                    <option value={3}>Outlier &gt;= 3x</option>
                    <option value={5}>Outlier &gt;= 5x</option>
                    <option value={1}>Todos (1x+)</option>
                  </select>
                  <label className="studio-check-label">
                    <input
                      type="checkbox"
                      checked={studioWatchedOnly}
                      onChange={(e) => setStudioWatchedOnly(e.target.checked)}
                    />
                    Assistidos pelo meu público
                  </label>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      if (!accessToken || !studioTopic.trim()) return;
                      try {
                        const run = await api.createStudioRun(accessToken, activeWorkspaceId, {
                          channel_id: activeChannelId,
                          broad_topic: studioTopic,
                          min_interest: studioMinInterest,
                          only_watched_by_my_viewers: studioWatchedOnly,
                          upload_window_days: studioDays,
                          min_outlier_ratio: studioMinOutlier,
                          execute_now: true,
                        });
                        setStudioTerms(
                          run.terms.map((t) => ({ ...t, gap_note: t.is_hypothesis ? "Hipótese a validar" : "" }))
                        );
                        setStudioOutliers(run.outliers.map((o) => ({ ...o, public_views: null })));
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Executar Busca no Studio
                  </button>
                </div>

                <div className="grid-2">
                  <div>
                    <h4>Buscas em Alta &amp; Lacunas de Conteúdo ({studioTerms.length})</h4>
                    <ul className="orch-list-clean">
                      {studioTerms.map((t) => (
                        <li key={t.id}>
                          <strong>{t.term}</strong> · interesse {t.audience_interest}
                          {t.is_hypothesis ? " · Lacuna de conteúdo (hipótese)" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Vídeos Outliers Capturados ({studioOutliers.length})</h4>
                    <ul className="orch-list-clean">
                      {studioOutliers.map((o) => (
                        <li key={o.id} className="mb-sm">
                          <a href={o.canonical_url} target="_blank" rel="noopener noreferrer">
                            {o.title}
                          </a>{" "}
                          · <span className="tabular-nums">{o.outlier_ratio ? `${o.outlier_ratio}x` : o.outlier_tier}</span>
                          {o.watched_by_my_viewers ? " · Assistido pelo meu público" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <hr className="divider" />

                <h3>Confirmação de Sustentabilidade no Google Trends (12m / 5 anos)</h3>
                <div className="row-wrap mb-sm">
                  <input
                    className="input input-medium"
                    placeholder="Termo para validar..."
                    value={gtKeyword}
                    onChange={(e) => setGtKeyword(e.target.value)}
                  />
                  <input
                    className="input input-compact"
                    placeholder="BR"
                    value={gtGeo}
                    onChange={(e) => setGtGeo(e.target.value.toUpperCase())}
                  />
                  <select className="input input-compact" value={gtProp} onChange={(e) => setGtProp(e.target.value)}>
                    <option value="youtube">YouTube Search</option>
                    <option value="web">Web Search</option>
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      if (!accessToken || !gtKeyword.trim()) return;
                      try {
                        await api.validateGoogleTrends(accessToken, activeWorkspaceId, {
                          keyword: gtKeyword,
                          channel_id: activeChannelId,
                          geo: gtGeo,
                          gprop: gtProp,
                        });
                        const r = await api.listGoogleTrends(accessToken, activeWorkspaceId, activeChannelId);
                        setGtItems(r.items);
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Validar Sustentabilidade (12m/5a)
                  </button>
                </div>

                <details className="mb-sm">
                  <summary className="muted">Importar CSVs oficiais do Google Trends (fallback sem rate-limit)</summary>
                  <div className="grid-2 mt-sm">
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="CSV multiTimeline 12 meses..."
                      value={gtCsv12m}
                      onChange={(e) => setGtCsv12m(e.target.value)}
                    />
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="CSV multiTimeline 5 anos..."
                      value={gtCsv5y}
                      onChange={(e) => setGtCsv5y(e.target.value)}
                    />
                  </div>
                  <textarea
                    className="input mt-sm"
                    rows={2}
                    placeholder="CSV relatedQueries (Top / Rising / Breakout)..."
                    value={gtCsvRel}
                    onChange={(e) => setGtCsvRel(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn mt-sm"
                    onClick={async () => {
                      if (!accessToken || !gtKeyword.trim()) return;
                      try {
                        await api.importGoogleTrendsCsv(accessToken, activeWorkspaceId, {
                          keyword: gtKeyword,
                          channel_id: activeChannelId,
                          geo: gtGeo,
                          gprop: gtProp,
                          timeline_12m_csv: gtCsv12m,
                          timeline_5y_csv: gtCsv5y,
                          related_queries_csv: gtCsvRel,
                        });
                        const r = await api.listGoogleTrends(accessToken, activeWorkspaceId, activeChannelId);
                        setGtItems(r.items);
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Processar CSVs Google Trends
                  </button>
                </details>

                <ul className="orch-list-clean">
                  {gtItems.map((gt) => (
                    <li key={gt.id} className="mb-sm">
                      <strong>{gt.keyword}</strong> · {gt.geo}/{gt.gprop || "web"} ·{" "}
                      <span className={gt.verdict === "SUSTAINABLE_GO" ? "status-text-ok" : "status-text-warn"}>
                        {gt.verdict}
                      </span>{" "}
                      · 12m: {gt.direction_12m} · 5a: {gt.durability_5y}
                      <div className="muted">{gt.summary}</div>
                      {gt.points_12m_json?.length > 1 && (
                        <svg width={180} height={28} aria-label={`Tendência 12m ${gt.keyword}`} className="sparkline-svg">
                          <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            points={gt.points_12m_json
                              .map(
                                (pt, i) =>
                                  `${(i / Math.max(1, gt.points_12m_json.length - 1)) * 176 + 2},${
                                    26 - (Math.min(100, pt.value) / 100) * 24
                                  }`
                              )
                              .join(" ")}
                          />
                        </svg>
                      )}
                      {gt.breakout_queries_json?.length > 0 && (
                        <div className="row-wrap mt-sm">
                          <strong>Breakout (&gt;5.000%):</strong>
                          {gt.breakout_queries_json.map((bq, i) => (
                            <button
                              key={i}
                              type="button"
                              className="btn studio-btn-sm"
                              onClick={() => {
                                setFocusTopic(bq.term);
                                setMainTab("modeling");
                                void runModelingSynthesis(undefined, bq.term);
                              }}
                            >
                              Modelar: {bq.term}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">Selecione um canal ativo para executar o Studio Trends e o Google Trends.</p>
            )}
          </div>
        ) : (
          <div className="modeling-section-stack">
            <div className="grid-2">
              <div className="analyst-card">
                <h3>Referências Públicas Curadas</h3>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken) return;
                    try {
                      const res = await api.listReferences(accessToken, activeWorkspaceId);
                      setRefs(res);
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Atualizar Referências
                </button>
                <p className="muted tabular-nums">
                  Canais: {refs.channels.length} · Vídeos: {refs.videos.length}
                </p>
                <ul className="orch-list-clean">
                  {refs.videos.map((rv) => (
                    <li key={String(rv.id)} className="mb-sm">
                      <strong>{String(rv.title)}</strong> · {String(rv.curation_status)}{" "}
                      <button
                        type="button"
                        className="btn studio-btn-xs"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            await api.curateReference(accessToken, activeWorkspaceId, String(rv.id), {
                              entity_type: "video",
                              status: "approved",
                              notes: "Aprovado na curadoria UI",
                              collection_name: "default",
                            });
                            const res = await api.listReferences(accessToken, activeWorkspaceId);
                            setRefs(res);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Aprovar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="analyst-card">
                <h3>Análise Estrutural Individual &amp; Alternativas Rápidas</h3>
                <div className="field">
                  <label htmlFor="t-ana">Título de referência</label>
                  <input id="t-ana" className="input" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken || !titleInput.trim()) return;
                    try {
                      const r = await api.analyzeTitle(
                        accessToken,
                        activeWorkspaceId,
                        titleInput,
                        activeChannelId || undefined
                      );
                      setTitleAnalysis(r);
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Analisar Estrutura
                </button>
                {titleAnalysis && (
                  <div className="mt-sm">
                    <p>
                      <strong>Fórmula:</strong> {titleAnalysis.editorial_formula}
                    </p>
                    <p className="muted">Elementos: {titleAnalysis.features_json.features.join(" · ")}</p>
                    <p className="muted">{titleAnalysis.limitations_json[0]}</p>
                  </div>
                )}
                <hr className="divider" />
                <div className="field">
                  <label htmlFor="t-topic">Tema para alternativas originais</label>
                  <input id="t-topic" className="input" value={titleTopic} onChange={(e) => setTitleTopic(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    if (!accessToken || !titleTopic.trim()) return;
                    try {
                      const r = await api.generateTitleAlternatives(accessToken, activeWorkspaceId, {
                        channel_name: activeChannel?.display_name ?? "Canal",
                        niche: activeVersion?.niche || "Editorial",
                        topic: titleTopic,
                        reference_titles: refs.videos.map((v) => String(v.title ?? "")),
                        forbidden_topics: forbiddenTopics,
                      });
                      setTitleAlts(r.items);
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Gerar Alternativas Originais
                </button>
                <ul className="orch-list-clean">
                  {titleAlts.map((a, idx) => (
                    <li key={idx}>
                      <strong>{a.title}</strong> — {a.differentiation} (similaridade máx:{" "}
                      <span className="tabular-nums">{(a.originality.max_similarity * 100).toFixed(0)}%</span>)
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {activeChannelId && (
              <div>
                <h3>Engenharia Reversa Individual em 4 Fases &amp; Lotes de Experimento</h3>
                <div className="grid-2 mb-sm">
                  <div className="analyst-card">
                    <h4>Fase 1: Auditoria Individual de 6 Critérios</h4>
                    <div className="field">
                      <label htmlFor="p1-name">Nome do canal referência</label>
                      <input
                        id="p1-name"
                        className="input"
                        placeholder="Ex: Crônica Oculta"
                        value={reP1Name}
                        onChange={(e) => setReP1Name(e.target.value)}
                      />
                    </div>
                    <div className="inline-grid-3">
                      <input
                        aria-label="Idioma do canal"
                        className="input"
                        value={reP1Lang}
                        onChange={(e) => setReP1Lang(e.target.value)}
                      />
                      <input
                        aria-label="País alvo"
                        className="input"
                        value={reP1Country}
                        onChange={(e) => setReP1Country(e.target.value)}
                      />
                      <input
                        aria-label="Formato de produção"
                        className="input"
                        value={reP1Format}
                        onChange={(e) => setReP1Format(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="p1-tags">Público-alvo / Tags</label>
                      <input id="p1-tags" className="input" value={reP1Tags} onChange={(e) => setReP1Tags(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="p1-views20">Views dos últimos 20–30 vídeos</label>
                      <textarea
                        id="p1-views20"
                        className="input tabular-nums"
                        rows={2}
                        value={reP1Views20}
                        onChange={(e) => setReP1Views20(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="p1-views90">Views recentes (90 dias)</label>
                      <input
                        id="p1-views90"
                        className="input tabular-nums"
                        value={reP1Views90d}
                        onChange={(e) => setReP1Views90d(e.target.value)}
                      />
                    </div>
                    <label className="studio-check-label mb-sm">
                      <input type="checkbox" checked={reP1Celebrity} onChange={(e) => setReP1Celebrity(e.target.checked)} />
                      Depende de celebridade/mega-marca (descarta)
                    </label>
                    <div>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={async () => {
                          if (!accessToken || !reP1Name.trim()) return;
                          try {
                            const parseNums = (txt: string) =>
                              txt
                                .split(/[,\s;]+/)
                                .map((n) => Number(n.trim()))
                                .filter((n) => Number.isFinite(n) && n >= 0);
                            const tags = reP1Tags.split(",").map((s) => s.trim()).filter(Boolean);
                            await api.runPhase1Channels(accessToken, activeWorkspaceId, {
                              channel_id: activeChannelId,
                              target_language: reP1Lang,
                              target_country: reP1Country,
                              feasible_formats: [reP1Format],
                              target_audience_tags: tags,
                              candidates: [
                                {
                                  external_channel_id: `UC-${reP1Name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}`,
                                  display_name: reP1Name,
                                  language: reP1Lang,
                                  market_country: reP1Country,
                                  recent_video_views_90d: parseNums(reP1Views90d),
                                  all_recent_20_30_views: parseNums(reP1Views20),
                                  production_format: reP1Format,
                                  audience_profile_tags: tags,
                                  is_celebrity_or_mega_brand: reP1Celebrity,
                                },
                              ],
                            });
                            const st = await api.getReverseEngineeringState(accessToken, activeWorkspaceId, activeChannelId);
                            setReState(st);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Avaliar Canal nos 6 Critérios
                      </button>
                    </div>
                    {reState && reState.audits.length > 0 && (
                      <ul className="orch-list-clean">
                        {reState.audits.slice(0, 5).map((a) => (
                          <li key={a.id} className="tabular-nums">
                            <strong>{a.display_name}</strong> ·{" "}
                            <span className={a.approved ? "status-text-ok" : "status-text-warn"}>
                              {a.approved ? "Aprovado" : "Descartado"}
                            </span>{" "}
                            · Máx: {a.max_outlier_ratio}x
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="analyst-card">
                    <h4>Fase 2: Calcular Outliers &amp; Views/Dia</h4>
                    <div className="field">
                      <label htmlFor="p2-ch">Nome do canal de origem</label>
                      <input
                        id="p2-ch"
                        className="input"
                        value={reP2ChannelName}
                        onChange={(e) => setReP2ChannelName(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="p2-title">Título do vídeo candidato a outlier</label>
                      <input
                        id="p2-title"
                        className="input"
                        placeholder="Ex: A cidade que sumiu em 1 noite"
                        value={reP2Title}
                        onChange={(e) => setReP2Title(e.target.value)}
                      />
                    </div>
                    <div className="inline-grid-3">
                      <input
                        aria-label="Views do vídeo"
                        type="number"
                        className="input tabular-nums"
                        value={reP2Views}
                        onChange={(e) => setReP2Views(e.target.value)}
                      />
                      <input
                        aria-label="Dias desde upload"
                        type="number"
                        min={1}
                        className="input tabular-nums"
                        value={reP2Days}
                        onChange={(e) => setReP2Days(e.target.value)}
                      />
                      <input
                        aria-label="Média baseline por vídeo"
                        type="number"
                        className="input tabular-nums"
                        value={reP2BaselineViews}
                        onChange={(e) => setReP2BaselineViews(e.target.value)}
                      />
                    </div>
                    <label className="studio-check-label mb-sm">
                      <input
                        type="checkbox"
                        checked={reP2SmallNiche}
                        onChange={(e) => setReP2SmallNiche(e.target.checked)}
                      />
                      Nicho pequeno (limiar 2x em vez de 3x)
                    </label>
                    <div>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={async () => {
                          if (!accessToken || !reP2Title.trim()) return;
                          try {
                            const extCh = `UC-${reP2ChannelName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "ref"}`;
                            const baseAvg = Math.max(100, Number(reP2BaselineViews) || 4000);
                            const baseline = Array.from({ length: 19 }, (_, idx) => ({
                              external_video_id: `base-${idx}`,
                              external_channel_id: extCh,
                              channel_name: reP2ChannelName,
                              title: `Video Base ${idx + 1}`,
                              views: baseAvg,
                              days_since_upload: 40 + idx * 5,
                              topic: "baseline",
                              format_name: "long",
                            }));
                            await api.runPhase2Outliers(accessToken, activeWorkspaceId, {
                              channel_id: activeChannelId,
                              small_niche: reP2SmallNiche,
                              videos: [
                                ...baseline,
                                {
                                  external_video_id: `out-${Date.now()}`,
                                  external_channel_id: extCh,
                                  channel_name: reP2ChannelName,
                                  title: reP2Title,
                                  views: Math.max(1, Number(reP2Views) || 50000),
                                  days_since_upload: Math.max(1, Number(reP2Days) || 14),
                                  topic: reP2Title.split(" ").slice(0, 3).join(" "),
                                  format_name: "long",
                                  in_suggested_feed: true,
                                },
                              ],
                            });
                            const st = await api.getReverseEngineeringState(accessToken, activeWorkspaceId, activeChannelId);
                            setReState(st);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Calcular Outlier &amp; Views/Dia
                      </button>
                    </div>
                    {reState && reState.viral_outliers?.length > 0 && (
                      <ul className="orch-list-clean">
                        {reState.viral_outliers.slice(0, 5).map((o) => (
                          <li key={o.id} className="tabular-nums">
                            <strong>{o.title}</strong> · {o.outlier_ratio}x · {Math.round(o.views_per_day)} views/dia
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="grid-2">
                  <div className="analyst-card">
                    <h4>Fase 3: Autópsia Anti-Plágio (Package + 0–30s + Comentários)</h4>
                    <input
                      className="input mb-sm"
                      placeholder="ID do vídeo outlier (ex: xyz12345678)"
                      value={reVidId}
                      onChange={(e) => setReVidId(e.target.value)}
                    />
                    <input
                      className="input mb-sm"
                      placeholder="Título viral analisado"
                      value={reVidTitle}
                      onChange={(e) => setReVidTitle(e.target.value)}
                    />
                    <textarea
                      className="input mb-sm"
                      rows={3}
                      placeholder="Transcrição ou notas 0-15s / 15-30s / meio..."
                      value={reTranscript}
                      onChange={(e) => setReTranscript(e.target.value)}
                    />
                    <textarea
                      className="input mb-sm"
                      rows={2}
                      placeholder="Comentários (1 por linha) para minerar lacunas..."
                      value={reComments}
                      onChange={(e) => setReComments(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn primary"
                      onClick={async () => {
                        if (!accessToken || !reVidTitle.trim()) return;
                        try {
                          await api.runPhase3Autopsy(accessToken, activeWorkspaceId, {
                            channel_id: activeChannelId,
                            external_video_id: reVidId || "manual_outlier",
                            title: reVidTitle,
                            transcript_or_notes: reTranscript,
                            comments: reComments.split("\n").map((s) => s.trim()).filter(Boolean),
                          });
                          const st = await api.getReverseEngineeringState(accessToken, activeWorkspaceId, activeChannelId);
                          setReState(st);
                        } catch (err) {
                          reportError(err);
                        }
                      }}
                    >
                      Executar Autópsia
                    </button>
                  </div>

                  <div className="analyst-card">
                    <h4>Fase 4: Mecanismo Transferível &amp; Lote de Teste</h4>
                    <input
                      className="input mb-sm"
                      placeholder="Seu tema validado (ex: Vila Romana Submersa)"
                      value={reOwnTopic}
                      onChange={(e) => setReOwnTopic(e.target.value)}
                    />
                    <input
                      className="input mb-sm"
                      placeholder="Novo ângulo / lacuna preenchida..."
                      value={reNewAngle}
                      onChange={(e) => setReNewAngle(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn primary"
                      onClick={async () => {
                        if (!accessToken || !reOwnTopic.trim() || !reNewAngle.trim()) return;
                        try {
                          await api.runPhase4Synthesize(accessToken, activeWorkspaceId, {
                            channel_id: activeChannelId,
                            own_validated_topic: reOwnTopic,
                            new_angle: reNewAngle,
                            target_format: "long",
                          });
                          const st = await api.getReverseEngineeringState(accessToken, activeWorkspaceId, activeChannelId);
                          setReState(st);
                        } catch (err) {
                          reportError(err);
                        }
                      }}
                    >
                      Gerar Mecanismo Transferível (Anti-Plágio)
                    </button>

                    {reState && (
                      <div className="mt-sm">
                        <p className="muted tabular-nums">
                          Autópsias: {reState.autopsies.length} · Mecanismos: {reState.mechanisms.length} · Lotes:{" "}
                          {reState.batches.length}
                        </p>
                        <ul className="orch-list-clean">
                          {reState.mechanisms.slice(0, 4).map((m) => (
                            <li key={m.id} className="mb-sm">
                              <strong>{m.synthesized_title}</strong> ({m.formula_structure}) ·{" "}
                              <span className={m.originality_blocked ? "status-text-err" : "status-text-ok"}>
                                similaridade {(m.originality_max_similarity * 100).toFixed(0)}%
                              </span>
                              <div className="muted">{m.synthesized_thumb_concept}</div>
                              <button
                                type="button"
                                className="btn studio-btn-sm mt-sm"
                                onClick={async () => {
                                  if (!accessToken) return;
                                  try {
                                    await api.createExperimentBatch(accessToken, activeWorkspaceId, {
                                      channel_id: activeChannelId,
                                      mechanism_id: m.id,
                                      title: m.synthesized_title,
                                    });
                                    const st = await api.getReverseEngineeringState(
                                      accessToken,
                                      activeWorkspaceId,
                                      activeChannelId
                                    );
                                    setReState(st);
                                  } catch (err) {
                                    reportError(err);
                                  }
                                }}
                              >
                                Criar Lote de Teste
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
