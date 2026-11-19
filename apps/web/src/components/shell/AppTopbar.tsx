"use client";

import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export function AppTopbar() {
  const {
    activeWorkspace,
    activeChannel,
    activeVersion,
    health,
    refreshHealth,
    isAuthenticated,
    isSandboxMode,
    signOut,
  } = useWorkspaceShell();

  return (
    <header className="topbar" aria-label="Contexto ativo do workspace">
      <div className="row-wrap">
        <span className="pill info">
          Workspace:{" "}
          <strong>
            {activeWorkspace
              ? `${activeWorkspace.workspace.name} (${activeWorkspace.role})`
              : "Nenhum"}
          </strong>
        </span>
        <span className="pill">
          Canal: <strong>{activeChannel ? activeChannel.display_name : "Nenhum"}</strong>
        </span>
        <span className="pill">
          Perfil Editorial: <strong>{activeVersion ? `v${activeVersion.version_number}` : "N/A"}</strong>
        </span>
        {isSandboxMode && (
          <span className="pill warn">Modo Sandbox Local Efemero</span>
        )}
      </div>

      <div className="row-wrap">
        <span className={`pill ${health?.supabase_reachable ? "ok" : "err"}`}>
          {isSandboxMode
            ? "Store: Sandbox Em Memoria"
            : `Supabase: ${health?.supabase_reachable ? "Conectado" : "Degradado / Offline"}`}
        </span>
        <button type="button" className="btn" onClick={refreshHealth}>
          Verificar
        </button>
        {isAuthenticated && (
          <button type="button" className="btn" onClick={signOut}>
            {isSandboxMode ? "Sair do Sandbox" : "Encerrar sessao"}
          </button>
        )}
      </div>
    </header>
  );
}
