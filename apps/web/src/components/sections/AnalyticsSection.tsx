"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type MetricFactDTO, type SyncCursorDTO, type VideoDTO } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function AnalyticsSection() {
  const { accessToken, activeWorkspaceId, activeChannelId, setNotice, reportError } = useWorkspaceShell();
  const [oauthUrl, setOauthUrl] = useState<string>("");
  const [portfolio, setPortfolio] = useState<{
    period_start: string;
    period_end: string;
    channels: {
      channel_id: string;
      display_name: string;
      video_count: number;
      metrics: MetricFactDTO[];
      cursors: SyncCursorDTO[];
    }[];
    quota: { daily_limit: number; own_sync_used: number; public_research_used: number };
  } | null>(null);
  const [channelAnalytics, setChannelAnalytics] = useState<{
    metrics: MetricFactDTO[];
    cursors: SyncCursorDTO[];
    videos: VideoDTO[];
  } | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<{ video: VideoDTO; metrics: MetricFactDTO[] } | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const portRes = await api.getPortfolioAnalytics(accessToken, activeWorkspaceId);
      setPortfolio(portRes);
      if (activeChannelId) {
        const chRes = await api.getChannelAnalytics(accessToken, activeWorkspaceId, activeChannelId);
        setChannelAnalytics(chRes);
      } else {
        setChannelAnalytics(null);
      }
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, activeChannelId, reportError]);

  useEffect(() => {
    setSelectedVideo(null);
    setOauthUrl("");
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <section className="card">
      <h2>Analytics Center &amp; Conexao YouTube (SP-03)</h2>
      {!activeWorkspaceId ? (
        <p className="muted">Selecione um workspace para consultar analytics.</p>
      ) : (
        <>
          <div className="row-wrap mb-sm">
            {activeChannelId && (
              <>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    if (!accessToken) return;
                    try {
                      const res = await api.authorizeYouTube(accessToken, activeWorkspaceId, activeChannelId);
                      setOauthUrl(res.authorize_url);
                      setNotice({
                        kind: "info",
                        code: "OAUTH_READY",
                        message: "URL oficial YouTube OAuth gerada. Clique no link seguro abaixo para concluir.",
                      });
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Preparar Conexao YouTube OAuth
                </button>
                {oauthUrl && (
                  <a
                    href={oauthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                  >
                    Abrir Consentimento Google OAuth ↗
                  </a>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken) return;
                    try {
                      const res = await api.syncChannel(accessToken, activeWorkspaceId, activeChannelId);
                      setNotice({
                        kind: "info",
                        code: "SYNC_QUEUED",
                        message: `Job de sync ${res.job_id} (${res.status}).`,
                      });
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Sincronizar Canal (Incremental)
                </button>
              </>
            )}
          </div>

          {portfolio && (
            <div className="card mb-sm">
              <h3>
                Portfolio ({portfolio.period_start} a {portfolio.period_end})
              </h3>
              <p className="muted">
                Quota API YouTube hoje: Sync proprio = {portfolio.quota.own_sync_used} | Pesquisa ={" "}
                {portfolio.quota.public_research_used} / {portfolio.quota.daily_limit}
              </p>
              {portfolio.channels.map((ch) => (
                <div key={ch.channel_id} className="card mt-sm">
                  <strong>{ch.display_name}</strong> ({ch.video_count} videos) —{" "}
                  <span className="muted">
                    Frescor: {ch.cursors[0]?.freshness_status ?? "never_synced"}
                    {ch.cursors[0]?.last_successful_sync_at ? ` (${ch.cursors[0].last_successful_sync_at})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {channelAnalytics && (
            <div className="grid-2">
              <div className="card">
                <h3>Metricas do Canal Ativo</h3>
                {channelAnalytics.metrics.length === 0 ? (
                  <p className="muted">Nenhuma metrica sincronizada ainda (estado honesto sem zeros ficticios).</p>
                ) : (
                  <ul>
                    {channelAnalytics.metrics.map((m) => (
                      <li key={m.id}>
                        <strong>{m.display_name}:</strong>{" "}
                        {m.availability === "available" ? (
                          m.value_num
                        ) : (
                          <span className="pill warn">{m.availability.toUpperCase()}</span>
                        )}{" "}
                        <span className="muted">
                          ({m.source} • rev.{m.source_revision} • {m.period_start}..{m.period_end})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h3>Catalogo de Videos ({channelAnalytics.videos.length})</h3>
                <ul>
                  {channelAnalytics.videos.map((v) => (
                    <li key={v.id} className="mb-sm">
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            const d = await api.getVideoDetail(accessToken, activeWorkspaceId, v.id);
                            setSelectedVideo(d);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        {v.title} ({v.format})
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedVideo && (
                  <div className="card mt-sm">
                    <h4>Ficha: {selectedVideo.video.title}</h4>
                    <p className="muted">Fonte: {selectedVideo.video.source}</p>
                    <ul>
                      {selectedVideo.metrics.map((vm) => (
                        <li key={vm.id}>
                          {vm.display_name}:{" "}
                          {vm.availability === "available" ? vm.value_num : vm.availability.toUpperCase()} (rev.
                          {vm.source_revision})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
