"use client";

import Link from "next/link";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
import { AuthGateCard } from "@/components/shell/AuthGateCard";
import { SectionSkeleton } from "@/components/shell/SectionSkeleton";
import { WorkspaceShellProvider, useWorkspaceShell } from "@/lib/workspace-shell-context";

function StandaloneStudioContent() {
  const {
    authReady,
    isAuthenticated,
    accessToken,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    channels,
    activeChannelId,
    setActiveChannelId,
    notice,
    setNotice,
  } = useWorkspaceShell();

  return (
    <main className="main">
      <header className="topbar">
        <div className="row-wrap">
          <strong>DarkForge · Agent Organization 3D</strong>
          {workspaces.length > 1 && (
            <select
              className="input input-medium"
              value={activeWorkspaceId}
              onChange={(e) => setActiveWorkspaceId(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.workspace.id} value={w.workspace.id}>
                  {w.workspace.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <Link href="/" className="btn studio-btn-sm">
          Voltar ao Channel OS
        </Link>
      </header>

      {notice && (
        <div className={`banner ${notice.kind === "err" ? "err" : ""}`} role="alert">
          <strong>[{notice.code}]</strong> {notice.message}
        </div>
      )}

      {!authReady ? (
        <SectionSkeleton label="Verificando sessao..." />
      ) : !isAuthenticated ? (
        <AuthGateCard />
      ) : (
        <StudioWorkspace
          token={accessToken}
          workspaceId={activeWorkspaceId}
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={setActiveChannelId}
          onNotice={setNotice}
        />
      )}
    </main>
  );
}

export default function StudioRoutePage() {
  return (
    <WorkspaceShellProvider>
      <StandaloneStudioContent />
    </WorkspaceShellProvider>
  );
}
