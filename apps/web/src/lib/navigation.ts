import { ApiClientError } from "./api";

export type NavSection =
  | "studio"
  | "orchestrator"
  | "dashboard"
  | "reports"
  | "channels"
  | "analytics"
  | "research"
  | "opportunities"
  | "calendar"
  | "briefs"
  | "knowledge"
  | "production"
  | "jobs"
  | "settings";

export type UiNotice = {
  kind: "info" | "warn" | "err";
  code: string;
  message: string;
  nextAction?: string;
};

export const NAV_ITEMS: readonly { id: NavSection; label: string; phase: string }[] = [
  { id: "studio", label: "Estudio 2.5D", phase: "UI" },
  { id: "orchestrator", label: "Orquestrador & Agentes", phase: "DAG" },
  { id: "dashboard", label: "Dashboard", phase: "SP-01" },
  { id: "reports", label: "Relatorios & Central", phase: "SP-24" },
  { id: "channels", label: "Canais & Perfil", phase: "SP-01" },
  { id: "analytics", label: "Analytics Center", phase: "SP-03" },
  { id: "research", label: "Pesquisa", phase: "SP-04" },
  { id: "opportunities", label: "Oportunidades", phase: "SP-07" },
  { id: "calendar", label: "Calendario", phase: "SP-07" },
  { id: "briefs", label: "Briefs e Geracoes", phase: "SP-07" },
  { id: "knowledge", label: "Knowledge / Copies", phase: "SP-06" },
  { id: "production", label: "Producao DarkForge", phase: "SP-08" },
  { id: "jobs", label: "Jobs e Qualidade", phase: "SP-02" },
  { id: "settings", label: "Configuracoes", phase: "SP-01" },
] as const;

export function mapErrorToNotice(err: unknown): UiNotice {
  if (err instanceof ApiClientError) {
    const isCritical =
      err.envelope.code === "SUPABASE_UNAVAILABLE" ||
      err.envelope.code === "WORKSPACE_FORBIDDEN";
    return {
      kind: isCritical ? "err" : "warn",
      code: err.envelope.code,
      message: err.envelope.message,
      nextAction: err.envelope.details?.next_action,
    };
  }
  return {
    kind: "err",
    code: "UNEXPECTED_ERROR",
    message: err instanceof Error ? err.message : "Erro inesperado ao consultar dados.",
  };
}
