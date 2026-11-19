"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ReportsOverviewDTO } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

type ReportsTab =
  | "overview"
  | "channels_outliers"
  | "autopsies_mechanisms"
  | "trends_studio"
  | "opportunities_score";

const REPORT_TABS: readonly [ReportsTab, string][] = [
  ["overview", "Resumo Executivo"],
  ["channels_outliers", "Canais & Outliers (F1-F2)"],
  ["autopsies_mechanisms", "Autopsias & Mecanismos (F3-F4)"],
  ["trends_studio", "Google Trends & Studio"],
  ["opportunities_score", "Oportunidades & 4 Analistas"],
];

export default function ReportsSection() {
  const { accessToken, activeWorkspaceId, activeChannelId, setNotice, reportError } = useWorkspaceShell();
  const [reportsTab, setReportsTab] = useState<ReportsTab>("overview");
  const [reportsOverview, setReportsOverview] = useState<ReportsOverviewDTO | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [executiveMd, setExecutiveMd] = useState("");

  const loadReportsOverview = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    setReportsLoading(true);
    try {
      const data = await api.getReportsOverview(accessToken, activeWorkspaceId, activeChannelId || undefined);
      setReportsOverview(data);
      setNotice(null);
    } catch (err) {
      reportError(err);
    } finally {
      setReportsLoading(false);
    }
  }, [accessToken, activeWorkspaceId, activeChannelId, setNotice, reportError]);

  useEffect(() => {
    loadReportsOverview();
  }, [loadReportsOverview]);

  return (
    <section className="card" aria-label="Central de Relatorios e Auditoria">
      <div className="row-between mb-sm">
        <div>
          <h2>Relatorios &amp; Central de Inteligencia (SP-24 / SP-25)</h2>
          <p className="muted">
            Visao consolidada de Fases 1-4, YouTube Studio Trends, Google Trends (12m/5a/Breakout), Oportunidades dos 4
            Analistas e Briefs.
          </p>
        </div>

        <div className="row-wrap no-print">
          <button
            type="button"
            className="btn"
            disabled={!activeWorkspaceId || reportsLoading}
            onClick={loadReportsOverview}
          >
            {reportsLoading ? "Atualizando..." : "Atualizar Relatorios"}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!activeWorkspaceId}
            onClick={async () => {
              if (!accessToken || !activeWorkspaceId) return;
              try {
                const md = await api.exportExecutiveMarkdown(
                  accessToken,
                  activeWorkspaceId,
                  activeChannelId || undefined
                );
                setExecutiveMd(md);
                const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                const dlUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = dlUrl;
                a.download = "relatorio-executivo-darkforge.md";
                a.click();
                URL.revokeObjectURL(dlUrl);
              } catch (err) {
                reportError(err);
              }
            }}
          >
            Baixar Relatorio (.md)
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {!activeWorkspaceId ? (
        <p className="muted">Selecione ou crie um workspace para visualizar os relatorios reais.</p>
      ) : !reportsOverview ? (
        <p className="muted">
          {reportsLoading
            ? "Carregando relatorios do workspace..."
            : "Clique em Atualizar Relatorios para consultar os dados."}
        </p>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="muted">Fase 1: Canais</div>
              <div className="kpi-value">
                {reportsOverview.summary.phase1_selected_count}/{reportsOverview.summary.phase1_audits_total}
              </div>
              <div className="muted">Meta: 5-10 aprovados</div>
            </div>
            <div className="kpi-card">
              <div className="muted">Fase 2: Outliers</div>
              <div className="kpi-value">{reportsOverview.summary.phase2_valid_outliers}</div>
              <div className="muted">de {reportsOverview.summary.phase2_outliers_total} analisados</div>
            </div>
            <div className="kpi-card">
              <div className="muted">Fase 3 &amp; 4</div>
              <div className="kpi-value">
                {reportsOverview.summary.phase3_autopsies_count} / {reportsOverview.summary.phase4_mechanisms_count}
              </div>
              <div className="muted">Autopsias / Mecanismos</div>
            </div>
            <div className="kpi-card">
              <div className="muted">Google Trends GO</div>
              <div className="kpi-value">
                {reportsOverview.summary.google_trends_sustainable_count}/{reportsOverview.summary.google_trends_count}
              </div>
              <div className="muted">SUSTAINABLE_GO</div>
            </div>
            <div className="kpi-card">
              <div className="muted">Studio Trends</div>
              <div className="kpi-value">
                {reportsOverview.summary.studio_terms_count} / {reportsOverview.summary.studio_outliers_count}
              </div>
              <div className="muted">Buscas / Outliers</div>
            </div>
            <div className="kpi-card">
              <div className="muted">Oportunidades &amp; Briefs</div>
              <div className="kpi-value">
                {reportsOverview.summary.opportunities_count} / {reportsOverview.summary.briefs_count}
              </div>
              <div className="muted">{reportsOverview.summary.briefs_approved_count} briefs aprovados</div>
            </div>
          </div>

          <div className="tabs-inline no-print" role="tablist" aria-label="Secoes do relatorio">
            {REPORT_TABS.map(([tabId, tabLabel]) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={reportsTab === tabId}
                className="tab-btn"
                onClick={() => setReportsTab(tabId)}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          {reportsTab === "overview" && (
            <div className="grid-2">
              <div className="card">
                <h3>Canais &amp; Dados Sincronizados</h3>
                <ul>
                  {reportsOverview.channels.map((ch) => (
                    <li key={ch.id} className="mb-sm">
                      <strong>{ch.display_name}</strong>{" "}
                      {ch.external_channel_id && <code>[{ch.external_channel_id}]</code>}{" "}
                      <span className="pill ok">{ch.status}</span>
                    </li>
                  ))}
                </ul>
                <h4 className="mt-sm">Saude do Funil &amp; Calendario</h4>
                <ul>
                  <li>
                    Canais configurados: <strong>{reportsOverview.summary.channels_count}</strong>
                  </li>
                  <li>
                    Lotes de Teste: <strong>{reportsOverview.summary.experiment_batches_count}</strong>
                  </li>
                  <li>
                    Coletas YouTube Studio Trends: <strong>{reportsOverview.summary.studio_runs_count}</strong>
                  </li>
                  <li>
                    Itens no Calendario Editorial: <strong>{reportsOverview.summary.calendar_items_count}</strong>
                  </li>
                </ul>
                {reportsOverview.diagnostics && (
                  <div className="mt-sm">
                    <h4>Diagnostico Sanitizado (Zero Segredos)</h4>
                    <p className="muted">
                      Redaction aplicado: <strong>{String(reportsOverview.diagnostics.redaction_applied)}</strong> |
                      Jobs recentes: {reportsOverview.diagnostics.jobs_recent.length}
                    </p>
                    <div className="row-wrap">
                      {Object.entries(reportsOverview.diagnostics.environment_flags).map(([k, v]) => (
                        <span key={k} className={`pill ${v ? "ok" : "warn"}`}>
                          {k}: {v ? "ON" : "OFF"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <h3>Preview Relatorio Executivo (.md)</h3>
                {!executiveMd ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      if (!accessToken) return;
                      try {
                        const md = await api.exportExecutiveMarkdown(
                          accessToken,
                          activeWorkspaceId,
                          activeChannelId || undefined
                        );
                        setExecutiveMd(md);
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Gerar Preview Markdown Agora
                  </button>
                ) : (
                  <pre className="report-preview">{executiveMd}</pre>
                )}
              </div>
            </div>
          )}

          {reportsTab === "channels_outliers" && (
            <div>
              <h3>Fase 1 — Auditoria de Canais de Referencia (6 Criterios)</h3>
              {reportsOverview.reverse_engineering.audits.length === 0 ? (
                <p className="muted">Nenhum canal avaliado na Fase 1 ainda.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th>Status</th>
                        <th>Media 20-30</th>
                        <th>Hits Outlier</th>
                        <th>Max Ratio</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportsOverview.reverse_engineering.audits.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.display_name}</strong>
                          </td>
                          <td>
                            <span className={`pill ${a.approved ? "ok" : "warn"}`}>
                              {a.approved ? "APROVADO" : "DESCARTADO"}
                            </span>
                          </td>
                          <td>{Math.round(a.channel_mean_views).toLocaleString("pt-BR")}</td>
                          <td>{a.outlier_hits_count}</td>
                          <td>{a.max_outlier_ratio}x</td>
                          <td>{a.ranking_score.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="mt-md">Fase 2 — Outliers Priorizados &amp; Velocidade (Views/Dia)</h3>
              {reportsOverview.reverse_engineering.viral_outliers.length === 0 ? (
                <p className="muted">Nenhum video outlier processado na Fase 2 ainda.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Video</th>
                        <th>Canal</th>
                        <th>Views</th>
                        <th>Views/Dia</th>
                        <th>Outlier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportsOverview.reverse_engineering.viral_outliers.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <strong>{o.title}</strong>
                          </td>
                          <td>{o.channel_name}</td>
                          <td>
                            {o.views.toLocaleString("pt-BR")} ({o.days_since_upload}d)
                          </td>
                          <td>
                            <strong>{Math.round(o.views_per_day).toLocaleString("pt-BR")}</strong>
                          </td>
                          <td>{o.outlier_ratio}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {reportsTab === "autopsies_mechanisms" && (
            <div className="grid-2">
              <div className="card">
                <h3>Fase 3 — Autopsias (Package, 0-30s e Comentarios)</h3>
                {reportsOverview.reverse_engineering.autopsies.length === 0 ? (
                  <p className="muted">Nenhuma autopsia executada ainda.</p>
                ) : (
                  <ul>
                    {reportsOverview.reverse_engineering.autopsies.map((au) => (
                      <li key={au.id} className="mb-sm">
                        <strong>{au.original_title}</strong> —{" "}
                        <span className="pill info">{au.narrative_archetype}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card">
                <h3>Fase 4 — Mecanismos Transferiveis</h3>
                {reportsOverview.reverse_engineering.mechanisms.length === 0 ? (
                  <p className="muted">Nenhum mecanismo sintetizado ainda.</p>
                ) : (
                  <ul>
                    {reportsOverview.reverse_engineering.mechanisms.map((m) => (
                      <li key={m.id} className="mb-sm">
                        <strong>{m.synthesized_title}</strong>
                        <div className="muted">Conceito de capa: {m.synthesized_thumb_concept}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {reportsTab === "trends_studio" && (
            <div className="grid-2">
              <div className="card">
                <h3>Google Trends (12m / 5 anos / Breakout)</h3>
                {reportsOverview.google_trends.length === 0 ? (
                  <p className="muted">Nenhuma validacao Google Trends ainda.</p>
                ) : (
                  <ul>
                    {reportsOverview.google_trends.map((g) => (
                      <li key={g.id} className="mb-sm">
                        <strong>{g.keyword}</strong> ({g.geo}/{g.gprop || "web"}) —{" "}
                        <span className={`pill ${g.verdict === "SUSTAINABLE_GO" ? "ok" : "warn"}`}>{g.verdict}</span>
                        <div className="muted">{g.summary}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card">
                <h3>YouTube Studio Trends</h3>
                {reportsOverview.studio_trends.terms.length === 0 ? (
                  <p className="muted">Nenhum termo capturado do YouTube Studio ainda.</p>
                ) : (
                  <ul>
                    {reportsOverview.studio_trends.terms.slice(0, 10).map((t) => (
                      <li key={t.id}>
                        <strong>{t.term}</strong> [{t.audience_interest}]
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {reportsTab === "opportunities_score" && (
            <div>
              <h3>Oportunidades Ranqueadas &amp; Parecer dos Analistas</h3>
              {reportsOverview.opportunities.length === 0 ? (
                <p className="muted">Nenhuma oportunidade gerada ainda.</p>
              ) : (
                reportsOverview.opportunities.map((opp) => (
                  <article key={opp.id} className="card mb-sm">
                    <div className="row-between">
                      <strong>{opp.theme}</strong>
                      <span className="inline-actions">
                        <span className="pill info">{opp.status}</span>
                        <span className="pill ok">
                          Score {(opp.score * 100).toFixed(0)}% ({opp.score_version})
                        </span>
                      </span>
                    </div>
                    <p className="muted">
                      Angulo: {opp.angle} | Diferenciacao: {opp.differentiation}
                    </p>
                  </article>
                ))
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
