"use client";

import dynamic from "next/dynamic";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { AppTopbar } from "@/components/shell/AppTopbar";
import { AuthGateCard } from "@/components/shell/AuthGateCard";
import { SectionSkeleton } from "@/components/shell/SectionSkeleton";
import { WorkspaceShellProvider, useWorkspaceShell } from "@/lib/workspace-shell-context";

const StudioWorkspace = dynamic(
  () => import("@/components/studio/StudioWorkspace").then((m) => m.StudioWorkspace),
  { loading: () => <SectionSkeleton label="Carregando Estudio 2.5D de Agentes..." /> }
);
const AgentsFleetSection = dynamic(() => import("@/components/sections/AgentsFleetSection"), {
  loading: () => <SectionSkeleton label="Carregando Orquestrador Mestre e 40 Subagentes..." />,
});
const DashboardSection = dynamic(() => import("@/components/sections/DashboardSection"), {
  loading: () => <SectionSkeleton label="Carregando Dashboard Operacional..." />,
});
const ReportsSection = dynamic(() => import("@/components/sections/ReportsSection"), {
  loading: () => <SectionSkeleton label="Carregando Central de Relatorios..." />,
});
const ChannelsSection = dynamic(() => import("@/components/sections/ChannelsSection"), {
  loading: () => <SectionSkeleton label="Carregando Canais e Perfil Editorial..." />,
});
const AnalyticsSection = dynamic(() => import("@/components/sections/AnalyticsSection"), {
  loading: () => <SectionSkeleton label="Carregando Analytics Center..." />,
});
const ResearchSection = dynamic(() => import("@/components/sections/ResearchSection"), {
  loading: () => <SectionSkeleton label="Carregando Laboratorio de Pesquisa..." />,
});
const OpportunitiesSection = dynamic(() => import("@/components/sections/OpportunitiesSection"), {
  loading: () => <SectionSkeleton label="Carregando Opportunity Engine..." />,
});
const CalendarSection = dynamic(() => import("@/components/sections/CalendarSection"), {
  loading: () => <SectionSkeleton label="Carregando Calendario Editorial..." />,
});
const BriefsSection = dynamic(() => import("@/components/sections/BriefsSection"), {
  loading: () => <SectionSkeleton label="Carregando EpisodeBriefs..." />,
});
const KnowledgeSection = dynamic(() => import("@/components/sections/KnowledgeSection"), {
  loading: () => <SectionSkeleton label="Carregando Knowledge / RAG Studio..." />,
});
const ProductionSection = dynamic(() => import("@/components/sections/ProductionSection"), {
  loading: () => <SectionSkeleton label="Carregando Gateway de Producao..." />,
});
const JobsSection = dynamic(() => import("@/components/sections/JobsSection"), {
  loading: () => <SectionSkeleton label="Carregando Fila de Jobs & Qualidade..." />,
});
const SettingsSection = dynamic(() => import("@/components/sections/SettingsSection"), {
  loading: () => <SectionSkeleton label="Carregando Configuracoes..." />,
});

function ChannelOsShellContent() {
  const {
    section,
    authReady,
    isAuthenticated,
    isSandboxMode,
    accessToken,
    activeWorkspaceId,
    channels,
    activeChannelId,
    setActiveChannelId,
    health,
    notice,
    setNotice,
  } = useWorkspaceShell();

  return (
    <div className="shell">
      <AppSidebar />

      <main className="main">
        <AppTopbar />

        {!isSandboxMode && health && !health.supabase_reachable && (
          <div className="banner err" role="alert">
            <strong>[MODO DEGRADADO — ADR-015]</strong> Supabase inacessivel. Escritas e conclusoes de jobs estao
            bloqueadas para evitar falso sucesso.
          </div>
        )}

        {notice && (
          <div className={`banner ${notice.kind === "err" ? "err" : ""}`} role="alert">
            <strong>[{notice.code}]</strong> {notice.message}
            {notice.nextAction && <div className="muted">Proxima acao: {notice.nextAction}</div>}
          </div>
        )}

        {!authReady ? (
          <SectionSkeleton label="Verificando sessao de autenticacao..." />
        ) : !isAuthenticated ? (
          <AuthGateCard />
        ) : (
          <>
            {section === "studio" && (
              <StudioWorkspace
                token={accessToken}
                workspaceId={activeWorkspaceId}
                channels={channels}
                activeChannelId={activeChannelId}
                onSelectChannel={setActiveChannelId}
                onNotice={(n) => setNotice(n)}
              />
            )}
            {section === "orchestrator" && <AgentsFleetSection />}
            {section === "dashboard" && <DashboardSection />}
            {section === "reports" && <ReportsSection />}
            {section === "channels" && <ChannelsSection />}
            {section === "analytics" && <AnalyticsSection />}
            {section === "research" && <ResearchSection />}
            {section === "opportunities" && <OpportunitiesSection />}
            {section === "calendar" && <CalendarSection />}
            {section === "briefs" && <BriefsSection />}
            {section === "knowledge" && <KnowledgeSection />}
            {section === "production" && <ProductionSection />}
            {section === "jobs" && <JobsSection />}
            {section === "settings" && <SettingsSection />}
          </>
        )}
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <WorkspaceShellProvider>
      <ChannelOsShellContent />
    </WorkspaceShellProvider>
  );
}
