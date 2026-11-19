"use client";

import ChannelsSection from "./ChannelsSection";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function DashboardSection() {
  const { workspaces, channels, versions, activeVersion, setSection } = useWorkspaceShell();

  return (
    <>
      <section className="card mb-md">
        <div className="row-between mb-sm">
          <div>
            <h2>Visao Operacional do Channel OS</h2>
            <p className="muted">
              Resumo estrutural do workspace ativo com atalhos diretos aos dominios modulares (code-splitting via{" "}
              <code>next/dynamic</code>).
            </p>
          </div>
          <div className="row-wrap">
            <button type="button" className="btn primary" onClick={() => setSection("studio")}>
              Abrir Estudio 2.5D
            </button>
            <button type="button" className="btn" onClick={() => setSection("research")}>
              Pesquisa &amp; Outliers
            </button>
            <button type="button" className="btn" onClick={() => setSection("reports")}>
              Relatorio Executivo
            </button>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="muted">Workspaces RLS</div>
            <div className="kpi-value">{workspaces.length}</div>
            <div className="muted">Isolamento multi-tenant</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Canais Vinculados</div>
            <div className="kpi-value">{channels.length}</div>
            <div className="muted">Perfis editoriais ativos</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Versao Editorial</div>
            <div className="kpi-value">{activeVersion ? `v${activeVersion.version_number}` : "N/A"}</div>
            <div className="muted">{versions.length} versoes auditadas</div>
          </div>
        </div>
      </section>

      <ChannelsSection />
    </>
  );
}
