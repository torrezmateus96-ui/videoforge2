"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function ChannelsSection() {
  const {
    accessToken,
    loading,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    reloadWorkspaces,
    channels,
    activeChannelId,
    setActiveChannelId,
    reloadChannels,
    versions,
    themeChanges,
    reloadChannelHistory,
    setNotice,
    reportError,
  } = useWorkspaceShell();

  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");

  const [chDisplayName, setChDisplayName] = useState("");
  const [chHandle, setChHandle] = useState("");
  const [profName, setProfName] = useState("");
  const [profLang, setProfLang] = useState("pt-BR");
  const [profCountry, setProfCountry] = useState("BR");
  const [profTz, setProfTz] = useState("America/Sao_Paulo");
  const [profNiche, setProfNiche] = useState("");
  const [profPositioning, setProfPositioning] = useState("");
  const [profTheme, setProfTheme] = useState("");
  const [profPillars, setProfPillars] = useState("");
  const [profForbidden, setProfForbidden] = useState("");
  const [profSummary, setProfSummary] = useState("Atualizacao editorial");
  const [profThemeReason, setProfThemeReason] = useState("");

  useEffect(() => {
    const cur = versions[0];
    if (cur) {
      setProfName(cur.name);
      setProfLang(cur.language);
      setProfCountry(cur.country);
      setProfTz(cur.timezone);
      setProfNiche(cur.niche);
      setProfPositioning(cur.positioning);
      setProfTheme(cur.editorial_theme);
      setProfPillars((cur.pillars_json ?? []).join(", "));
      const forb = (cur.restrictions_json?.forbidden_topics as string[] | undefined) ?? [];
      setProfForbidden(forb.join(", "));
    }
  }, [versions]);

  function buildProfilePayload() {
    return {
      name: profName || chDisplayName,
      language: profLang,
      country: profCountry,
      timezone: profTz,
      niche: profNiche,
      positioning: profPositioning,
      editorial_theme: profTheme,
      pillars_json: profPillars.split(",").map((s) => s.trim()).filter(Boolean),
      restrictions_json: {
        forbidden_topics: profForbidden.split(",").map((s) => s.trim()).filter(Boolean),
      },
      change_summary: profSummary,
      theme_change_reason: profThemeReason,
    };
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    try {
      const created = await api.createWorkspace(accessToken, wsName, wsSlug);
      setWsName("");
      setWsSlug("");
      await reloadWorkspaces();
      setActiveWorkspaceId(created.workspace.id);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const created = await api.createChannel(accessToken, activeWorkspaceId, {
        display_name: chDisplayName,
        handle: chHandle || null,
        profile: buildProfilePayload(),
      });
      setChDisplayName("");
      setChHandle("");
      await reloadChannels(activeWorkspaceId);
      setActiveChannelId(created.channel.id);
    } catch (err) {
      reportError(err);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !activeWorkspaceId || !activeChannelId) return;
    try {
      await api.updateProfile(accessToken, activeWorkspaceId, activeChannelId, buildProfilePayload());
      await reloadChannelHistory(activeWorkspaceId, activeChannelId);
      setNotice({
        kind: "info",
        code: "PROFILE_VERSION_CREATED",
        message: "Nova versao editorial salva sem alterar o historico.",
      });
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <>
      <div className="grid-2">
        <section className="card">
          <h2>Workspaces (Isolamento RLS)</h2>
          {loading && <p className="muted">Carregando workspaces...</p>}
          {!loading && workspaces.length === 0 && (
            <p className="muted">Estado vazio legitimo: nenhum workspace vinculado ainda.</p>
          )}
          <div className="field">
            <label htmlFor="ws-select">Selecionar workspace</label>
            <select
              id="ws-select"
              className="input"
              value={activeWorkspaceId}
              onChange={(e) => setActiveWorkspaceId(e.target.value)}
            >
              <option value="">-- Selecione --</option>
              {workspaces.map((w) => (
                <option key={w.workspace.id} value={w.workspace.id}>
                  {w.workspace.name} ({w.role})
                </option>
              ))}
            </select>
          </div>
          <form onSubmit={handleCreateWorkspace}>
            <h3>Novo Workspace</h3>
            <div className="field">
              <label htmlFor="ws-name">Nome</label>
              <input id="ws-name" className="input" required value={wsName} onChange={(e) => setWsName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ws-slug">Slug (minusculo, hifen)</label>
              <input
                id="ws-slug"
                className="input"
                required
                value={wsSlug}
                onChange={(e) => setWsSlug(e.target.value)}
                placeholder="meu-workspace"
              />
            </div>
            <button type="submit" className="btn primary">
              Criar Workspace
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Canais e Perfil Editorial Versionado</h2>
          {!activeWorkspaceId ? (
            <p className="muted">Selecione ou crie um workspace para gerenciar canais.</p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="ch-select">Canal ativo ({channels.length})</label>
                <select
                  id="ch-select"
                  className="input"
                  value={activeChannelId}
                  onChange={(e) => setActiveChannelId(e.target.value)}
                >
                  <option value="">-- Novo ou selecione --</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                      {c.external_channel_id ? ` [${c.external_channel_id}]` : ""} ({c.status})
                    </option>
                  ))}
                </select>
              </div>

              {channels.length > 0 && (
                <div className="row-wrap mb-sm">
                  {channels.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`btn ${activeChannelId === c.id ? "primary" : ""}`}
                      onClick={() => setActiveChannelId(c.id)}
                    >
                      {c.display_name}
                      {c.external_channel_id ? ` (${c.external_channel_id})` : ""}
                    </button>
                  ))}
                </div>
              )}

              {!activeChannelId ? (
                <form onSubmit={handleCreateChannel}>
                  <h3>Cadastrar Canal + Perfil v1</h3>
                  <div className="field">
                    <label htmlFor="ch-name">Nome do canal</label>
                    <input
                      id="ch-name"
                      className="input"
                      required
                      value={chDisplayName}
                      onChange={(e) => setChDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ch-handle">Handle (@canal)</label>
                    <input
                      id="ch-handle"
                      className="input"
                      value={chHandle}
                      onChange={(e) => setChHandle(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="prof-niche">Nicho</label>
                    <input
                      id="prof-niche"
                      className="input"
                      required
                      value={profNiche}
                      onChange={(e) => setProfNiche(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="prof-theme">Tema editorial inicial</label>
                    <input
                      id="prof-theme"
                      className="input"
                      value={profTheme}
                      onChange={(e) => setProfTheme(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn primary">
                    Criar Canal e Perfil v1
                  </button>
                </form>
              ) : (
                <form onSubmit={handleUpdateProfile}>
                  <h3>Editar Perfil (gera nova versao imutavel)</h3>
                  <div className="field">
                    <label htmlFor="ed-niche">Nicho</label>
                    <input
                      id="ed-niche"
                      className="input"
                      required
                      value={profNiche}
                      onChange={(e) => setProfNiche(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ed-pos">Posicionamento</label>
                    <textarea
                      id="ed-pos"
                      className="input"
                      rows={2}
                      value={profPositioning}
                      onChange={(e) => setProfPositioning(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ed-theme">Tema editorial vigente</label>
                    <input
                      id="ed-theme"
                      className="input"
                      value={profTheme}
                      onChange={(e) => setProfTheme(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ed-pillars">Pilares (separados por virgula)</label>
                    <input
                      id="ed-pillars"
                      className="input"
                      value={profPillars}
                      onChange={(e) => setProfPillars(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ed-forb">Temas proibidos (separados por virgula)</label>
                    <input
                      id="ed-forb"
                      className="input"
                      value={profForbidden}
                      onChange={(e) => setProfForbidden(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ed-reason">Motivo da mudanca de tema / resumo</label>
                    <input
                      id="ed-reason"
                      className="input"
                      value={profThemeReason}
                      onChange={(e) => {
                        setProfThemeReason(e.target.value);
                        setProfSummary(e.target.value || "Atualizacao editorial");
                      }}
                    />
                  </div>
                  <button type="submit" className="btn primary">
                    Salvar Nova Versao do Perfil
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {activeChannelId && (
        <section className="card mt-md">
          <h3>Historico Imutavel de Versoes e Mudancas de Tema</h3>
          <div className="grid-2">
            <div>
              <h4>Versoes do Perfil ({versions.length})</h4>
              <ul>
                {versions.map((v) => (
                  <li key={v.id}>
                    <strong>v{v.version_number}</strong> — {v.editorial_theme || v.niche} ({v.change_summary})
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Mudancas de Tema ({themeChanges.length})</h4>
              {themeChanges.length === 0 ? (
                <p className="muted">Nenhuma mudanca de tema registrada apos v1.</p>
              ) : (
                <ul>
                  {themeChanges.map((tc) => (
                    <li key={tc.id}>
                      {tc.previous_theme || "(inicial)"} → <strong>{tc.new_theme}</strong> ({tc.reason || "sem motivo"})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
