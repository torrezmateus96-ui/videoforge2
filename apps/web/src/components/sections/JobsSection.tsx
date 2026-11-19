"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type JobDTO, type JobEventDTO, type StorageReconcileDTO } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function JobsSection() {
  const { accessToken, activeWorkspaceId, setNotice, reportError } = useWorkspaceShell();
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [jobStatusFilter, setJobStatusFilter] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<{ job: JobDTO; events: JobEventDTO[] } | null>(null);
  const [reconcileReport, setReconcileReport] = useState<StorageReconcileDTO | null>(null);

  const loadJobs = useCallback(
    async (status?: string) => {
      if (!accessToken || !activeWorkspaceId) return;
      try {
        const res = await api.listJobs(accessToken, activeWorkspaceId, status || undefined);
        setJobs(res.items);
      } catch (err) {
        reportError(err);
      }
    },
    [accessToken, activeWorkspaceId, reportError]
  );

  useEffect(() => {
    loadJobs(jobStatusFilter);
  }, [jobStatusFilter, loadJobs]);

  return (
    <section className="card">
      <h2>Jobs, Recovery &amp; Qualidade (SP-02)</h2>
      {!activeWorkspaceId ? (
        <p className="muted">Selecione um workspace para gerenciar jobs e Storage.</p>
      ) : (
        <>
          <div className="row-wrap mb-sm">
            <select
              aria-label="Filtrar jobs por estado"
              className="input input-medium"
              value={jobStatusFilter}
              onChange={(e) => setJobStatusFilter(e.target.value)}
            >
              <option value="">Todos os estados</option>
              <option value="QUEUED">QUEUED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="PAUSED">PAUSED</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="RECOVERABLE">RECOVERABLE</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="SUCCEEDED">SUCCEEDED</option>
            </select>

            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                if (!accessToken || !activeWorkspaceId) return;
                try {
                  const key = `diag-${crypto.randomUUID()}`;
                  await api.enqueueJob(
                    accessToken,
                    activeWorkspaceId,
                    { job_type: "diagnostic.multi_step", payload: { steps: ["prepare", "process", "verify"] }, total_steps: 3 },
                    key
                  );
                  await loadJobs(jobStatusFilter);
                  setNotice({
                    kind: "info",
                    code: "JOB_QUEUED",
                    message: "Job diagnostico enfileirado na fila unica Postgres.",
                  });
                } catch (err) {
                  reportError(err);
                }
              }}
            >
              Enfileirar Job de Teste
            </button>

            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!accessToken || !activeWorkspaceId) return;
                try {
                  const rep = await api.reconcileStorage(accessToken, activeWorkspaceId, "exports");
                  setReconcileReport(rep.report);
                } catch (err) {
                  reportError(err);
                }
              }}
            >
              Reconciliar Storage (exports)
            </button>
          </div>

          {reconcileReport && (
            <div className="banner mb-sm">
              <strong>Reconciliacao bucket {reconcileReport.bucket}:</strong> ausentes=
              {reconcileReport.missing_in_storage.length}, orfaos={reconcileReport.orphaned_in_storage.length},
              incompletos={reconcileReport.incomplete_uploads.length}
            </div>
          )}

          {jobs.length === 0 ? (
            <p className="muted">Nenhum job encontrado para este filtro.</p>
          ) : (
            <div className="grid-2">
              <div>
                {jobs.map((j) => (
                  <div key={j.id} className="card mb-sm">
                    <div className="row-between">
                      <strong>{j.job_type}</strong>
                      <span
                        className={`pill ${
                          j.status === "SUCCEEDED"
                            ? "ok"
                            : j.status === "FAILED" || j.status === "BLOCKED"
                            ? "err"
                            : "warn"
                        }`}
                      >
                        {j.status}
                      </span>
                    </div>
                    <p className="muted">
                      Etapa: <strong>{j.current_step}</strong> ({j.completed_steps}/{j.total_steps}) • Tentativa #
                      {j.attempt_count}
                    </p>
                    {j.error_code && (
                      <p className="err-text">
                        [{j.error_code}] {j.error_message} ({j.retryable ? "recuperavel" : "nao recuperavel"})
                      </p>
                    )}
                    <div className="row-wrap">
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            const d = await api.getJobDetail(accessToken, activeWorkspaceId, j.id);
                            setSelectedJob(d);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Detalhes &amp; Logs
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            const res = await api.pauseJob(accessToken, activeWorkspaceId, j.id);
                            setNotice({ kind: "info", code: "PAUSE_CONTROL", message: `Controle: ${res.control_result}` });
                            await loadJobs(jobStatusFilter);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Pausar
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            await api.resumeJob(accessToken, activeWorkspaceId, j.id);
                            await loadJobs(jobStatusFilter);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Retomar
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!accessToken) return;
                          try {
                            const res = await api.cancelJob(accessToken, activeWorkspaceId, j.id);
                            setNotice({ kind: "info", code: "CANCEL_CONTROL", message: `Controle: ${res.control_result}` });
                            await loadJobs(jobStatusFilter);
                          } catch (err) {
                            reportError(err);
                          }
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3>Eventos do Job</h3>
                {!selectedJob ? (
                  <p className="muted">Selecione um job para inspecionar checkpoints e eventos SSE/replay.</p>
                ) : (
                  <ul>
                    {selectedJob.events.map((ev) => (
                      <li key={ev.sequence_no}>
                        <code>#{ev.sequence_no}</code> [{ev.status}] <strong>{ev.step_name}</strong>: {ev.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
