"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  api,
  type ChannelDTO,
  type ChannelProfileVersionDTO,
  type EditorialThemeChangeDTO,
  type HealthDTO,
  type WorkspaceListItem,
} from "./api";
import { SANDBOX_ACCESS_TOKEN, SANDBOX_USER_EMAIL, defaultSandboxApi } from "./local-sandbox-api";
import { mapErrorToNotice, type NavSection, type UiNotice } from "./navigation";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

const SANDBOX_SESSION_KEY = "darkforge_sandbox_mode_active";

export interface WorkspaceShellContextValue {
  theme: "dark" | "light";
  toggleTheme: () => void;
  section: NavSection;
  setSection: (section: NavSection) => void;
  authReady: boolean;
  isAuthenticated: boolean;
  isSandboxMode: boolean;
  supabaseConfigured: boolean;
  accessToken: string;
  userIdentifier: string;
  enterSandboxMode: () => void;
  signOut: () => Promise<void>;
  health: HealthDTO | null;
  refreshHealth: () => Promise<void>;
  loading: boolean;
  notice: UiNotice | null;
  setNotice: (notice: UiNotice | null) => void;
  reportError: (err: unknown) => void;
  workspaces: WorkspaceListItem[];
  activeWorkspaceId: string;
  setActiveWorkspaceId: (wsId: string) => void;
  activeWorkspace: WorkspaceListItem | null;
  reloadWorkspaces: () => Promise<void>;
  channels: ChannelDTO[];
  activeChannelId: string;
  setActiveChannelId: (chId: string) => void;
  activeChannel: ChannelDTO | null;
  reloadChannels: (wsIdOverride?: string) => Promise<void>;
  versions: ChannelProfileVersionDTO[];
  themeChanges: EditorialThemeChangeDTO[];
  activeVersion: ChannelProfileVersionDTO | null;
  reloadChannelHistory: (wsIdOverride?: string, chIdOverride?: string) => Promise<void>;
}

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

export function WorkspaceShellProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [section, setSection] = useState<NavSection>("studio");
  const [session, setSession] = useState<Session | null>(null);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const [health, setHealth] = useState<HealthDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<UiNotice | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [versions, setVersions] = useState<ChannelProfileVersionDTO[]>([]);
  const [themeChanges, setThemeChanges] = useState<EditorialThemeChangeDTO[]>([]);

  const supabaseConfigured = useMemo(() => isSupabaseConfigured(), []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const reportError = useCallback((err: unknown) => {
    setNotice(mapErrorToNotice(err));
  }, []);

  const refreshHealth = useCallback(async () => {
    if (isSandboxMode) {
      const sbHealth = await defaultSandboxApi.health();
      setHealth(sbHealth);
      return;
    }
    try {
      const h = await api.health();
      setHealth(h);
    } catch {
      setHealth({ status: "degraded", supabase_reachable: false, service: "darkforge-channel-os-api" });
    }
  }, [isSandboxMode]);

  useEffect(() => {
    refreshHealth();
    if (!supabaseConfigured) {
      const savedSandbox =
        typeof window !== "undefined" && window.sessionStorage.getItem(SANDBOX_SESSION_KEY) === "1";
      if (savedSandbox) {
        setIsSandboxMode(true);
      }
      setAuthReady(true);
      return;
    }
    const supa = getSupabaseClient();
    supa.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supa.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabaseConfigured, refreshHealth]);

  const accessToken = isSandboxMode ? SANDBOX_ACCESS_TOKEN : (session?.access_token ?? "");
  const isAuthenticated = Boolean(accessToken);
  const userIdentifier = isSandboxMode
    ? `${SANDBOX_USER_EMAIL} (Sandbox Local Efemero)`
    : (session?.user.email ?? session?.user.id ?? "");

  const enterSandboxMode = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SANDBOX_SESSION_KEY, "1");
    }
    setIsSandboxMode(true);
    setNotice({
      kind: "info",
      code: "SANDBOX_LOCAL_ACTIVE",
      message: "Modo Sandbox Local Efemero ativado. Nenhuma metrica privada falsa e fabricada (UNKNOWN preservado).",
    });
  }, []);

  const signOut = useCallback(async () => {
    if (isSandboxMode) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SANDBOX_SESSION_KEY);
      }
      setIsSandboxMode(false);
      setNotice(null);
      return;
    }
    if (supabaseConfigured) {
      const supa = getSupabaseClient();
      await supa.auth.signOut();
    }
    setNotice(null);
  }, [isSandboxMode, supabaseConfigured]);

  const reloadWorkspaces = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await api.listWorkspaces(accessToken);
      setWorkspaces(res.items);
      if (res.items.length > 0) {
        setActiveWorkspaceId((prev) =>
          res.items.some((i) => i.workspace.id === prev) ? prev : res.items[0].workspace.id
        );
      } else {
        setActiveWorkspaceId("");
      }
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, reportError]);

  useEffect(() => {
    if (accessToken) {
      reloadWorkspaces();
    } else {
      setWorkspaces([]);
      setChannels([]);
      setVersions([]);
      setThemeChanges([]);
      setActiveWorkspaceId("");
      setActiveChannelId("");
    }
  }, [accessToken, reloadWorkspaces]);

  const reloadChannels = useCallback(
    async (wsIdOverride?: string) => {
      const wsId = wsIdOverride ?? activeWorkspaceId;
      if (!accessToken || !wsId) return;
      setLoading(true);
      try {
        const res = await api.listChannels(accessToken, wsId);
        setChannels(res.items);
        if (res.items.length > 0) {
          const preferred = res.items.find((c) => c.external_channel_id) ?? res.items[0];
          setActiveChannelId((prev) =>
            res.items.some((c) => c.id === prev) ? prev : preferred.id
          );
        } else {
          setActiveChannelId("");
        }
      } catch (err) {
        setChannels([]);
        reportError(err);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, activeWorkspaceId, reportError]
  );

  useEffect(() => {
    if (accessToken && activeWorkspaceId) {
      reloadChannels(activeWorkspaceId);
    }
  }, [accessToken, activeWorkspaceId, reloadChannels]);

  const reloadChannelHistory = useCallback(
    async (wsIdOverride?: string, chIdOverride?: string) => {
      const wsId = wsIdOverride ?? activeWorkspaceId;
      const chId = chIdOverride ?? activeChannelId;
      if (!accessToken || !wsId || !chId) {
        setVersions([]);
        setThemeChanges([]);
        return;
      }
      try {
        const [vRes, tcRes] = await Promise.all([
          api.listProfileVersions(accessToken, wsId, chId),
          api.listThemeChanges(accessToken, wsId, chId),
        ]);
        setVersions(vRes.items);
        setThemeChanges(tcRes.items);
      } catch (err) {
        reportError(err);
      }
    },
    [accessToken, activeWorkspaceId, activeChannelId, reportError]
  );

  useEffect(() => {
    if (accessToken && activeWorkspaceId && activeChannelId) {
      reloadChannelHistory(activeWorkspaceId, activeChannelId);
    } else {
      setVersions([]);
      setThemeChanges([]);
    }
  }, [accessToken, activeWorkspaceId, activeChannelId, reloadChannelHistory]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );
  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId]
  );
  const activeVersion = versions[0] ?? null;

  const value = useMemo<WorkspaceShellContextValue>(
    () => ({
      theme,
      toggleTheme,
      section,
      setSection,
      authReady,
      isAuthenticated,
      isSandboxMode,
      supabaseConfigured,
      accessToken,
      userIdentifier,
      enterSandboxMode,
      signOut,
      health,
      refreshHealth,
      loading,
      notice,
      setNotice,
      reportError,
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      activeWorkspace,
      reloadWorkspaces,
      channels,
      activeChannelId,
      setActiveChannelId,
      activeChannel,
      reloadChannels,
      versions,
      themeChanges,
      activeVersion,
      reloadChannelHistory,
    }),
    [
      theme,
      toggleTheme,
      section,
      authReady,
      isAuthenticated,
      isSandboxMode,
      supabaseConfigured,
      accessToken,
      userIdentifier,
      enterSandboxMode,
      signOut,
      health,
      refreshHealth,
      loading,
      notice,
      reportError,
      workspaces,
      activeWorkspaceId,
      activeWorkspace,
      reloadWorkspaces,
      channels,
      activeChannelId,
      activeChannel,
      reloadChannels,
      versions,
      themeChanges,
      activeVersion,
      reloadChannelHistory,
    ]
  );

  return <WorkspaceShellContext.Provider value={value}>{children}</WorkspaceShellContext.Provider>;
}

export function useWorkspaceShell(): WorkspaceShellContextValue {
  const ctx = useContext(WorkspaceShellContext);
  if (!ctx) {
    throw new Error("useWorkspaceShell deve ser usado dentro de <WorkspaceShellProvider>.");
  }
  return ctx;
}
