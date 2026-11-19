"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionSkeleton } from "@/components/shell/SectionSkeleton";
import { api } from "@/lib/api";
import type {
  AgentDivisionKey,
  MissionScopeKey,
  OrchestratorExecutionReportDTO,
  OrchestratorLeadDTO,
  OrchestratorPlanDTO,
  OrchestratorSubagentDTO,
  OrchestratorTopologyDTO,
} from "@/lib/orchestrator-catalog";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

type DivisionFilter = "all" | AgentDivisionKey;

export default function AgentsFleetSection() {
  const { accessToken, activeWorkspaceId, activeChannelId, setSection, setNotice, reportError } =
    useWorkspaceShell();

  const [topology, setTopology] = useState<OrchestratorTopologyDTO | null>(null);
  const [loadingTopo, setLoadingTopo] = useState(false);

  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("all");
  const [selectedLeadKey, setSelectedLeadKey] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [inspectedSubagentKey, setInspectedSubagentKey] = useState<string>("dados.sync_auditor");

  const [missionScope, setMissionScope] = useState<MissionScopeKey>("full_project");
  const [missionObjective, setMissionObjective] = useState<string>(
    "Executar coordenacao integrada de todos os dominios editoriais do Estudio 2.5D e todos os subsistemas de engenharia, seguranca, workers, scrapers e qualidade do DarkForge Channel OS."
  );
  const [approveHumanGates, setApproveHumanGates] = useState<boolean>(false);
  const [activePlan, setActivePlan] = useState<OrchestratorPlanDTO | null>(null);
  const [executionReport, setExecutionReport] = useState<OrchestratorExecutionReportDTO | null>(null);
  const [runningAction, setRunningAction] = useState<"idle" | "planning" | "executing">("idle");

  const loadTopology = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    setLoadingTopo(true);
    try {
      const res = await api.getOrchestratorTopology(accessToken, activeWorkspaceId);
      setTopology(res);
      if (res.subagents.length > 0) {
        setInspectedSubagentKey((prev) =>
          res.subagents.some((s) => s.key === prev) ? prev : res.subagents[0].key
        );
      }
    } catch (err) {
      reportError(err);
    } finally {
      setLoadingTopo(false);
    }
  }, [accessToken, activeWorkspaceId, reportError]);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  const filteredLeads = useMemo<OrchestratorLeadDTO[]>(() => {
    if (!topology) return [];
    const q = searchQuery.trim().toLowerCase();
    return topology.leads.filter((lead) => {
      if (divisionFilter !== "all" && lead.division !== divisionFilter) return false;
      if (!q) return true;
      return (
        lead.display_name.toLowerCase().includes(q) ||
        lead.key.toLowerCase().includes(q) ||
        lead.domain.toLowerCase().includes(q) ||
        lead.mission.toLowerCase().includes(q) ||
        lead.subagent_keys.some((sk) => sk.toLowerCase().includes(q))
      );
    });
  }, [topology, divisionFilter, searchQuery]);

  const filteredSubagents = useMemo<OrchestratorSubagentDTO[]>(() => {
    if (!topology) return [];
    const q = searchQuery.trim().toLowerCase();
    return topology.subagents.filter((sub) => {
      if (divisionFilter !== "all" && sub.division !== divisionFilter) return false;
      if (selectedLeadKey !== "all" && sub.lead_key !== selectedLeadKey) return false;
      if (!q) return true;
      return (
        sub.display_name.toLowerCase().includes(q) ||
        sub.key.toLowerCase().includes(q) ||
        sub.domain.toLowerCase().includes(q) ||
        sub.mission.toLowerCase().includes(q) ||
        sub.skills.some((sk) => sk.toLowerCase().includes(q))
      );
    });
  }, [topology, divisionFilter, selectedLeadKey, searchQuery]);

  const inspectedSubagent = useMemo<OrchestratorSubagentDTO | null>(() => {
    if (!topology) return null;
    return (
      topology.subagents.find((s) => s.key === inspectedSubagentKey) ??
      filteredSubagents[0] ??
      topology.subagents[0] ??
      null
    );
  }, [topology, inspectedSubagentKey, filteredSubagents]);

  const handleApplyPreset = (presetId: string) => {
    if (!topology) return;
    const found = topology.PresetMissions.find((p) => p.id === presetId);
    if (!found) return;
    setMissionScope(found.scope);
    setMissionObjective(found.objective);
    setSelectedLeadKey("all");
    setActivePlan(null);
    setExecutionReport(null);
  };

  const handlePlanMission = async () => {
    if (!accessToken || !activeWorkspaceId) return;
    setRunningAction("planning");
    try {
      const leadFilter = selectedLeadKey !== "all" ? [selectedLeadKey] : undefined;
      const res = await api.planOrchestratorMission(accessToken, activeWorkspaceId, {
        objective: missionObjective,
        scope: missionScope,
        lead_keys: leadFilter,
      });
      setActivePlan(res.plan);
      setExecutionReport(null);
      setNotice({
        kind: "info",
        code: "ORCHESTRATOR_PLAN_READY",
        message: `Plano ${res.plan.plan_id} gerado com ${res.plan.steps.length} subagentes ordenados em DAG.`,
      });
    } catch (err) {
      reportError(err);
    } finally {
      setRunningAction("idle");
    }
  };

  const handleExecuteMission = async () => {
    if (!accessToken || !activeWorkspaceId) return;
    setRunningAction("executing");
    try {
      const leadFilter = selectedLeadKey !== "all" ? [selectedLeadKey] : undefined;
      const [planRes, execRes] = await Promise.all([
        api.planOrchestratorMission(accessToken, activeWorkspaceId, {
          objective: missionObjective,
          scope: missionScope,
          lead_keys: leadFilter,
        }),
        api.executeOrchestratorMission(accessToken, activeWorkspaceId, {
          objective: missionObjective,
          scope: missionScope,
          channel_id: activeChannelId || null,
          lead_keys: leadFilter,
          approve_human_gates: approveHumanGates,
        }),
      ]);
      setActivePlan(planRes.plan);
      setExecutionReport(execRes.report);
      setNotice({
        kind: "info",
        code: "ORCHESTRATOR_EXECUTION_FINISHED",
        message: `Execucao ${execRes.report.execution_id}: ${execRes.report.completed_count} etapas concluidas e ${execRes.report.human_gate_pending_count} aguardando aprovacao humana.`,
      });
    } catch (err) {
      reportError(err);
    } finally {
      setRunningAction("idle");
    }
  };

  const handleResetFilters = () => {
    setDivisionFilter("all");
    setSelectedLeadKey("all");
    setSearchQuery("");
  };

  if (!activeWorkspaceId) {
    return (
      <section className="card">
        <h2>Orquestrador Mestre, Agentes &amp; Subagentes</h2>
        <p className="muted">
          Selecione ou crie um workspace ativo para inspecionar e acionar a frota de agentes do projeto.
        </p>
      </section>
    );
  }

  if (loadingTopo && !topology) {
    return <SectionSkeleton label="Carregando topologia do Orquestrador Mestre e 40 Subagentes..." />;
  }

  if (!topology) {
    return (
      <section className="card">
        <h2>Orquestrador Mestre, Agentes &amp; Subagentes</h2>
        <p className="muted">Topologia ainda nao carregada para este workspace.</p>
        <button type="button" className="btn primary mt-sm" onClick={loadTopology}>
          Recarregar Frota
        </button>
      </section>
    );
  }

  const editorialSubCount = topology.subagents.filter((s) => s.division === "editorial_runtime").length;
  const engineeringSubCount = topology.subagents.filter((s) => s.division === "engineering_platform").length;
  const humanGatesTotal = topology.subagents.filter((s) => s.requires_human_gate).length;

  return (
    <>
      <section className="card mb-md">
        <div className="row-between mb-sm">
          <div>
            <h2>{topology.master.display_name}</h2>
            <div className="meta-inline">
              <span>Versao {topology.master.version}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">1 Orquestrador Mestre</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{topology.master.total_leads} Agentes Lideres</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{topology.master.total_subagents} Subagentes Especializados</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{humanGatesTotal} Gates Humanos</span>
            </div>
          </div>
          <div className="row-wrap">
            <button type="button" className="btn" onClick={() => setSection("studio")}>
              Ver Palco 2.5D
            </button>
            <button type="button" className="btn" onClick={loadTopology}>
              Atualizar Topologia
            </button>
          </div>
        </div>

        <p className="muted">{topology.master.mission}</p>

        <div className="kpi-grid mt-md">
          <div className="kpi-card">
            <div className="muted">Unidades Totais</div>
            <div className="kpi-value tabular-nums">
              {1 + topology.master.total_leads + topology.master.total_subagents}
            </div>
            <div className="muted">Cobertura ponta a ponta</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Divisao Editorial &amp; 2.5D</div>
            <div className="kpi-value tabular-nums">8 + {editorialSubCount}</div>
            <div className="muted">Lideres + subagentes de canal</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Divisao Engenharia &amp; Caos</div>
            <div className="kpi-value tabular-nums">4 + {engineeringSubCount}</div>
            <div className="muted">Arquitetura, seguranca, scrapers e QA</div>
          </div>
          <div className="kpi-card">
            <div className="muted">Politica de Publicacao</div>
            <div className="kpi-value">Manual</div>
            <div className="muted">Zero auto-postagem (ADR-002)</div>
          </div>
        </div>

        <hr className="divider" />

        <div className="grid-2">
          <div>
            <strong>Politica de Roteamento Topologico (DAG)</strong>
            <ul className="orch-list-clean">
              {topology.master.routing_policy.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Guardrails Globais Inviolaveis</strong>
            <ul className="orch-list-clean">
              {topology.master.global_guardrails.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card mb-md">
        <div className="row-between mb-sm">
          <div>
            <h3>01. Planejador &amp; Executor de Missoes Multi-Subagente</h3>
            <p className="muted">
              Selecione uma missao pre-configurada ou descreva qualquer tarefa editorial ou de engenharia para gerar e
              executar o grafo ordenado de agentes e subagentes.
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="orch-preset-select">Missoes de Referencia</label>
          <div className="field-row">
            {topology.PresetMissions.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn"
                onClick={() => handleApplyPreset(preset.id)}
              >
                {preset.title.split("(")[0].trim()}
              </button>
            ))}
          </div>
        </div>

        <div className="inline-grid-3">
          <div className="field">
            <label htmlFor="orch-scope-select">Escopo Operacional</label>
            <select
              id="orch-scope-select"
              className="input"
              value={missionScope}
              onChange={(e) => setMissionScope(e.target.value as MissionScopeKey)}
            >
              <option value="full_project">Projeto Completo (Editorial + Engenharia)</option>
              <option value="editorial">Somente Editorial &amp; Estudio 2.5D</option>
              <option value="engineering">Somente Engenharia, Seguranca &amp; Caos</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="orch-lead-scope">Foco em Squad Lider</label>
            <select
              id="orch-lead-scope"
              className="input"
              value={selectedLeadKey}
              onChange={(e) => setSelectedLeadKey(e.target.value)}
            >
              <option value="all">Selecao Automatica pelo Orquestrador</option>
              {topology.leads.map((ld) => (
                <option key={ld.key} value={ld.key}>
                  {ld.display_name} ({ld.subagent_keys.length} subagentes)
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="orch-human-toggle">Gates Intermediarios</label>
            <label className="studio-check-label mt-sm" htmlFor="orch-human-toggle">
              <input
                id="orch-human-toggle"
                type="checkbox"
                checked={approveHumanGates}
                onChange={(e) => setApproveHumanGates(e.target.checked)}
              />
              <span>Pre-aprovar revisoes intermediarias (mantem trava final de publicacao)</span>
            </label>
          </div>
        </div>

        <div className="field">
          <label htmlFor="orch-objective-input">Objetivo da Missao</label>
          <textarea
            id="orch-objective-input"
            className="input"
            rows={3}
            value={missionObjective}
            onChange={(e) => setMissionObjective(e.target.value)}
            placeholder="Descreva o objetivo editorial, analitico, arquitetural ou de seguranca..."
          />
        </div>

        <div className="field-row">
          <button
            type="button"
            className="btn"
            disabled={runningAction !== "idle"}
            onClick={handlePlanMission}
          >
            {runningAction === "planning" ? "Montando Grafo DAG..." : "Gerar Plano DAG"}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={runningAction !== "idle"}
            onClick={handleExecuteMission}
          >
            {runningAction === "executing" ? "Executando Subagentes..." : "Executar Missao Multi-Subagente"}
          </button>
        </div>

        {activePlan && (
          <>
            <hr className="divider" />
            <div className="row-between mb-sm">
              <div>
                <strong>Plano Topologico Ativo: {activePlan.plan_id}</strong>
                <div className="meta-inline">
                  <span>Escopo: {activePlan.scope}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{activePlan.selected_lead_keys.length} lideres acionados</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{activePlan.steps.length} etapas em DAG</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{activePlan.human_gates_count} pontos de revisao humana</span>
                </div>
              </div>
            </div>

            {executionReport && (
              <div className="meta-inline mb-sm">
                <span className={executionReport.overall_status === "completed" ? "status-text-ok" : "status-text-warn"}>
                  Execucao {executionReport.execution_id}: {executionReport.overall_status}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{executionReport.completed_count} validados</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{executionReport.human_gate_pending_count} aguardando humano</span>
                <span aria-hidden="true">·</span>
                <span>Publicacao manual obrigatoria: Sim</span>
              </div>
            )}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ordem</th>
                    <th>Agente Lider</th>
                    <th>Subagente Especializado</th>
                    <th>Dominio</th>
                    <th>Dependencias Previas</th>
                    <th>Estado / Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlan.steps.map((step) => {
                    const execStep = executionReport?.executed_steps.find(
                      (es) => es.subagent_key === step.subagent_key
                    );
                    return (
                      <tr
                        key={step.subagent_key}
                        className={`orch-row-clickable ${
                          inspectedSubagent?.key === step.subagent_key ? "orch-row-selected" : ""
                        }`}
                        onClick={() => setInspectedSubagentKey(step.subagent_key)}
                      >
                        <td className="tabular-nums">{step.step_order}</td>
                        <td>{step.lead_display_name}</td>
                        <td>
                          <strong>{step.subagent_display_name}</strong>
                          <div className="muted-tiny">{step.subagent_key}</div>
                        </td>
                        <td>{step.domain}</td>
                        <td className="muted-tiny">
                          {step.depends_on.length > 0 ? step.depends_on.join(", ") : "Raiz independente"}
                        </td>
                        <td>
                          {execStep ? (
                            <span
                              className={
                                execStep.status === "completed" ? "status-text-ok" : "status-text-warn"
                              }
                            >
                              {execStep.status === "completed"
                                ? `Concluido (${execStep.artifact_type})`
                                : "Aguardando aprovacao humana"}
                            </span>
                          ) : step.requires_human_gate ? (
                            <span className="status-text-warn">Requer aprovacao humana</span>
                          ) : (
                            <span>Automatico auditavel</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card mb-md">
        <div className="row-between mb-sm">
          <div>
            <h3>02. Catalogo Completo dos 12 Squads Lideres &amp; 40 Subagentes</h3>
            <p className="muted">
              Filtre por divisao ou squad lider e clique em qualquer subagente para inspecionar contratos de entrada,
              saida, skills e guardrails.
            </p>
          </div>
          <div className="row-wrap">
            <input
              type="search"
              className="input input-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar agente, skill ou dominio..."
              aria-label="Buscar agente, skill ou dominio"
            />
            {(divisionFilter !== "all" || selectedLeadKey !== "all" || searchQuery) && (
              <button type="button" className="btn" onClick={handleResetFilters}>
                Limpar Filtros
              </button>
            )}
          </div>
        </div>

        <div className="tabs-inline" role="tablist" aria-label="Filtro de divisao de agentes">
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={divisionFilter === "all"}
            onClick={() => {
              setDivisionFilter("all");
              setSelectedLeadKey("all");
            }}
          >
            Todas as Divisoes ({topology.leads.length} lideres · {topology.subagents.length} subagentes)
          </button>
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={divisionFilter === "editorial_runtime"}
            onClick={() => {
              setDivisionFilter("editorial_runtime");
              setSelectedLeadKey("all");
            }}
          >
            Editorial &amp; Estudio 2.5D (8 lideres · {editorialSubCount} subagentes)
          </button>
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={divisionFilter === "engineering_platform"}
            onClick={() => {
              setDivisionFilter("engineering_platform");
              setSelectedLeadKey("all");
            }}
          >
            Engenharia, Seguranca &amp; Caos (4 lideres · {engineeringSubCount} subagentes)
          </button>
        </div>

        <div className="orch-lead-grid mb-md">
          {filteredLeads.map((lead) => {
            const isSelected = selectedLeadKey === lead.key;
            return (
              <button
                key={lead.key}
                type="button"
                className="orch-lead-btn"
                aria-pressed={isSelected}
                onClick={() => setSelectedLeadKey(isSelected ? "all" : lead.key)}
              >
                <strong>{lead.display_name}</strong>
                <div className="meta-inline">
                  <span>{lead.division === "editorial_runtime" ? "Editorial" : "Engenharia"}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{lead.subagent_keys.length} subagentes</span>
                  {lead.studio_room_key && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Sala: {lead.studio_room_key}</span>
                    </>
                  )}
                </div>
                <span className="muted-tiny">{lead.mission}</span>
              </button>
            );
          })}
        </div>

        <hr className="divider" />

        {filteredSubagents.length === 0 ? (
          <div>
            <p className="muted">Nenhum subagente encontrado para os filtros atuais.</p>
            <button type="button" className="btn mt-sm" onClick={handleResetFilters}>
              Restaurar Todos os 40 Subagentes
            </button>
          </div>
        ) : (
          <div className="orch-split-layout">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Chave</th>
                    <th>Subagente</th>
                    <th>Squad Lider</th>
                    <th>Dominio</th>
                    <th>Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubagents.map((sub) => (
                    <tr
                      key={sub.key}
                      className={`orch-row-clickable ${
                        inspectedSubagent?.key === sub.key ? "orch-row-selected" : ""
                      }`}
                      onClick={() => setInspectedSubagentKey(sub.key)}
                    >
                      <td className="tabular-nums">
                        <code>{sub.key}</code>
                      </td>
                      <td>
                        <strong>{sub.display_name}</strong>
                      </td>
                      <td>{sub.lead_key}</td>
                      <td>{sub.domain}</td>
                      <td>
                        {sub.requires_human_gate ? (
                          <span className="status-text-warn">Humano</span>
                        ) : (
                          <span>Auto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {inspectedSubagent && (
              <div className="analyst-card">
                <h4>{inspectedSubagent.display_name}</h4>
                <div className="meta-inline mb-sm">
                  <code>{inspectedSubagent.key}</code>
                  <span aria-hidden="true">·</span>
                  <span>Lider: {inspectedSubagent.lead_key}</span>
                  <span aria-hidden="true">·</span>
                  <span>Dominio: {inspectedSubagent.domain}</span>
                </div>

                <p className="muted">{inspectedSubagent.mission}</p>

                <hr className="divider" />

                <div>
                  <strong>Skills Ativadas</strong>
                  <div className="meta-inline mt-sm">
                    {inspectedSubagent.skills.join(" · ")}
                  </div>
                </div>

                <div className="mt-sm">
                  <strong>Contrato de Entrada &rarr; Saida</strong>
                  <div className="meta-inline mt-sm">
                    <span>Entradas: {inspectedSubagent.inputs.join(", ")}</span>
                    <span aria-hidden="true">&rarr;</span>
                    <span>Saidas: {inspectedSubagent.outputs.join(", ")}</span>
                  </div>
                </div>

                <div className="mt-sm">
                  <strong>Dependencias DAG</strong>
                  <div className="meta-inline mt-sm">
                    {inspectedSubagent.depends_on.length > 0
                      ? inspectedSubagent.depends_on.join(" · ")
                      : "Nenhuma dependencia anterior (no inicial)"}
                  </div>
                </div>

                <div className="mt-sm">
                  <strong>Guardrails Obrigatorios</strong>
                  <ul className="orch-list-clean">
                    {inspectedSubagent.guardrails.map((gr) => (
                      <li key={gr}>{gr}</li>
                    ))}
                  </ul>
                </div>

                <div className="field-row mt-md">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      if (!accessToken || !activeWorkspaceId) return;
                      setRunningAction("executing");
                      try {
                        const [planRes, execRes] = await Promise.all([
                          api.planOrchestratorMission(accessToken, activeWorkspaceId, {
                            objective: `Executar subagente ${inspectedSubagent.display_name} com suas dependencias DAG`,
                            scope:
                              inspectedSubagent.division === "editorial_runtime"
                                ? "editorial"
                                : "engineering",
                            subagent_keys: [inspectedSubagent.key],
                          }),
                          api.executeOrchestratorMission(accessToken, activeWorkspaceId, {
                            objective: `Executar subagente ${inspectedSubagent.display_name} com suas dependencias DAG`,
                            scope:
                              inspectedSubagent.division === "editorial_runtime"
                                ? "editorial"
                                : "engineering",
                            channel_id: activeChannelId || null,
                            subagent_keys: [inspectedSubagent.key],
                            approve_human_gates: approveHumanGates,
                          }),
                        ]);
                        setActivePlan(planRes.plan);
                        setExecutionReport(execRes.report);
                      } catch (err) {
                        reportError(err);
                      } finally {
                        setRunningAction("idle");
                      }
                    }}
                  >
                    Executar Subagente + Dependencias
                  </button>
                  {inspectedSubagent.studio_room_key && (
                    <button type="button" className="btn" onClick={() => setSection("studio")}>
                      Ir para Sala {inspectedSubagent.studio_room_key}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
