"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function BriefsSection() {
  const { accessToken, activeWorkspaceId, reportError } = useWorkspaceShell();
  const [briefs, setBriefs] = useState<
    {
      id: string;
      brief_group_id: string;
      version: number;
      opportunity_id: string;
      title: string;
      hook: string;
      angle: string;
      status: string;
      content_sha256: string;
    }[]
  >([]);
  const [briefExportText, setBriefExportText] = useState("");

  const loadBriefs = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const res = await api.listBriefs(accessToken, activeWorkspaceId);
      setBriefs(res.items);
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, reportError]);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);

  return (
    <section className="card">
      <h2>EpisodeBriefs &amp; Versionamento (SP-07)</h2>
      <button type="button" className="btn mb-sm" onClick={loadBriefs}>
        Carregar Briefs
      </button>

      {briefs.length === 0 ? (
        <p className="muted">Nenhum EpisodeBrief criado ainda.</p>
      ) : (
        <ul>
          {briefs.map((b) => (
            <li key={b.id} className="mb-sm">
              <strong>{b.title}</strong> (v{b.version}) — <span className="pill info">{b.status}</span>
              <div className="muted">
                SHA: {b.content_sha256.slice(0, 12)}... | Hook: {b.hook}
              </div>
              <div className="inline-actions mt-sm">
                {b.status === "DRAFT" && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      if (!accessToken) return;
                      try {
                        await api.approveBrief(accessToken, activeWorkspaceId, b.id);
                        await loadBriefs();
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Aprovar &amp; Congelar
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken) return;
                    try {
                      await api.createBriefVersion(accessToken, activeWorkspaceId, b.id, `${b.title} (rev)`);
                      await loadBriefs();
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Nova Versao
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken) return;
                    try {
                      const ex = await api.exportBrief(accessToken, activeWorkspaceId, b.id, "markdown");
                      setBriefExportText(ex.content);
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Exportar MD
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {briefExportText && <pre className="code-preview">{briefExportText}</pre>}
    </section>
  );
}
