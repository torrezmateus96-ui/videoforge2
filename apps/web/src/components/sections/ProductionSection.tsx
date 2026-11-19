"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function ProductionSection() {
  const { accessToken, activeWorkspaceId, reportError } = useWorkspaceShell();
  const [prodHealth, setProdHealth] = useState<{ available: boolean; mode: string; reason: string | null } | null>(null);
  const [prodIntents, setProdIntents] = useState<
    {
      id: string;
      brief_id: string;
      brief_version: number;
      status: string;
      manifest_validated: boolean;
      error_code: string | null;
      error_message: string | null;
    }[]
  >([]);
  const [approvedBriefs, setApprovedBriefs] = useState<{ id: string; title: string; version: number; status: string }[]>([]);

  const loadProduction = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const [h, i, b] = await Promise.all([
        api.getProductionHealth(accessToken, activeWorkspaceId),
        api.listProductionIntents(accessToken, activeWorkspaceId),
        api.listBriefs(accessToken, activeWorkspaceId),
      ]);
      setProdHealth(h);
      setProdIntents(i.items);
      setApprovedBriefs(b.items.filter((x) => x.status === "APPROVED"));
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, reportError]);

  useEffect(() => {
    loadProduction();
  }, [loadProduction]);

  return (
    <section className="card">
      <h2>Producao DarkForge (SP-08 Single-Writer)</h2>
      {!activeWorkspaceId ? (
        <p className="muted">Selecione um workspace primeiro.</p>
      ) : (
        <div>
          <div className="field-row mb-sm">
            <button type="button" className="btn" onClick={loadProduction}>
              Verificar Nucleo DarkForge &amp; Intencoes
            </button>
          </div>

          {prodHealth && (
            <div className={`banner mb-sm ${prodHealth.available ? "" : "err"}`}>
              <strong>Gateway DarkForge:</strong> {prodHealth.mode} {prodHealth.reason ? `— ${prodHealth.reason}` : ""}
            </div>
          )}

          <h3>Briefs Aprovados prontos para Intencao de Producao</h3>
          {approvedBriefs.length === 0 ? (
            <p className="muted">Aprove um EpisodeBrief primeiro para liberar criacao de intencao idempotente.</p>
          ) : (
            <ul>
              {approvedBriefs.map((b) => (
                <li key={b.id} className="mb-sm">
                  {b.title} (v{b.version}){" "}
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      if (!accessToken) return;
                      try {
                        await api.createProductionIntent(
                          accessToken,
                          activeWorkspaceId,
                          b.id,
                          `prod-${b.id}-v${b.version}`
                        );
                        await loadProduction();
                      } catch (err) {
                        reportError(err);
                      }
                    }}
                  >
                    Criar Intencao Idempotente
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3>Intencoes de Producao ({prodIntents.length})</h3>
          {prodIntents.length === 0 ? (
            <p className="muted">Nenhuma intencao de producao criada ainda.</p>
          ) : (
            <ul>
              {prodIntents.map((pi) => (
                <li key={pi.id} className="mb-sm">
                  Brief {pi.brief_id.slice(0, 8)} (v{pi.brief_version}) — <span className="pill info">{pi.status}</span>{" "}
                  manifest_validated={String(pi.manifest_validated)}
                  {pi.error_code && (
                    <span className="muted">
                      {" "}
                      | {pi.error_code}: {pi.error_message}
                    </span>
                  )}{" "}
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      if (!accessToken) return;
                      try {
                        await api.dispatchProductionIntent(accessToken, activeWorkspaceId, pi.id);
                      } catch (err) {
                        reportError(err);
                      } finally {
                        const i = await api.listProductionIntents(accessToken, activeWorkspaceId);
                        setProdIntents(i.items);
                      }
                    }}
                  >
                    Despachar para Executor
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
