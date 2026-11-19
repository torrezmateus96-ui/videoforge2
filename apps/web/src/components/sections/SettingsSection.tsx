"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ConnectionDTO } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function SettingsSection() {
  const { accessToken, userIdentifier, activeWorkspaceId, reportError } = useWorkspaceShell();
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [diagBundle, setDiagBundle] = useState("");

  const loadConnections = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const res = await api.listConnections(accessToken, activeWorkspaceId);
      setConnections(res.items);
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, reportError]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  return (
    <section className="card">
      <h2>Configuracoes &amp; Conexoes</h2>
      <p>
        <strong>Usuario autenticado:</strong> {userIdentifier}
      </p>

      <h3>Conexoes YouTube OAuth ({connections.length})</h3>
      {connections.length === 0 ? (
        <p className="muted">Nenhuma conexao YouTube cadastrada neste workspace.</p>
      ) : (
        <ul>
          {connections.map((c) => (
            <li key={c.id} className="mb-sm">
              Canal {c.channel_id} — <span className="pill info">{c.status}</span> (escopos: {c.scopes.join(", ")}){" "}
              <div className="inline-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken || !activeWorkspaceId) return;
                    try {
                      await api.disconnectConnection(accessToken, activeWorkspaceId, c.id, "keep_readonly");
                      await loadConnections();
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Desconectar (Manter historico)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!accessToken || !activeWorkspaceId) return;
                    try {
                      await api.disconnectConnection(accessToken, activeWorkspaceId, c.id, "purge_synced_data");
                      await loadConnections();
                    } catch (err) {
                      reportError(err);
                    }
                  }}
                >
                  Desconectar e Apagar Dados
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="muted">Nenhuma chave privilegiada de servidor e enviada ou armazenada no navegador.</p>

      {activeWorkspaceId && (
        <div className="mt-sm">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (!accessToken) return;
              try {
                const d = await api.exportDiagnostics(accessToken, activeWorkspaceId);
                setDiagBundle(JSON.stringify(d, null, 2));
              } catch (err) {
                reportError(err);
              }
            }}
          >
            Exportar Diagnostico com Redaction (JOB-007)
          </button>
          {diagBundle && <pre className="code-preview">{diagBundle}</pre>}
        </div>
      )}
    </section>
  );
}
