"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function OpportunitiesSection() {
  const { accessToken, activeWorkspaceId, activeChannelId, setSection, reportError } = useWorkspaceShell();
  const [oppTopic, setOppTopic] = useState("");
  const [opps, setOpps] = useState<
    {
      id: string;
      theme: string;
      angle: string;
      score: number;
      score_version: string;
      confidence: number;
      status: string;
      insufficient_data: boolean;
      limitations_json: string[];
    }[]
  >([]);

  const loadOpportunities = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId || !activeChannelId) return;
    try {
      const res = await api.listOpportunities(accessToken, activeWorkspaceId, activeChannelId);
      setOpps(res.items);
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, activeChannelId, reportError]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  return (
    <section className="card">
      <h2>Opportunity Engine (SP-07)</h2>
      {!activeWorkspaceId || !activeChannelId ? (
        <p className="muted">Selecione workspace e canal para gerar oportunidades.</p>
      ) : (
        <div>
          <div className="field-row mb-sm">
            <input
              className="input input-grow"
              aria-label="Tema ou hipotese do episodio"
              placeholder="Tema / hipotese do episodio..."
              value={oppTopic}
              onChange={(e) => setOppTopic(e.target.value)}
            />
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                if (!accessToken || !oppTopic.trim()) return;
                try {
                  await api.generateOpportunities(accessToken, activeWorkspaceId, {
                    channel_id: activeChannelId,
                    topic_hint: oppTopic,
                    target_format: "long",
                  });
                  setOppTopic("");
                  await loadOpportunities();
                } catch (err) {
                  reportError(err);
                }
              }}
            >
              Gerar Oportunidade
            </button>
            <button type="button" className="btn" onClick={loadOpportunities}>
              Atualizar
            </button>
          </div>

          {opps.length === 0 ? (
            <p className="muted">Nenhuma oportunidade gerada ainda.</p>
          ) : (
            <ul>
              {opps.map((o) => (
                <li key={o.id} className="mb-sm">
                  <strong>{o.theme}</strong> — <span className="pill info">{o.status}</span> Score{" "}
                  {(o.score * 100).toFixed(0)}% ({o.score_version}) | Confianca {(o.confidence * 100).toFixed(0)}%{" "}
                  {o.insufficient_data && <span className="pill warn">DADOS INSUFICIENTES</span>}
                  <div className="muted">{o.angle}</div>
                  <div className="inline-actions mt-sm">
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        if (!accessToken) return;
                        try {
                          await api.reviewOpportunity(accessToken, activeWorkspaceId, o.id, {
                            decision: "APPROVE",
                            notes: "Aprovada na UI",
                          });
                          await loadOpportunities();
                        } catch (err) {
                          reportError(err);
                        }
                      }}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        if (!accessToken) return;
                        try {
                          await api.createBrief(accessToken, activeWorkspaceId, {
                            opportunity_id: o.id,
                            title: o.theme,
                            hook: `Por que ${o.theme} falha e como corrigir.`,
                            angle: o.angle,
                            cta: "Inscreva-se para o proximo episodio.",
                          });
                          setSection("briefs");
                        } catch (err) {
                          reportError(err);
                        }
                      }}
                    >
                      Criar EpisodeBrief
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
