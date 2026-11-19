"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function KnowledgeSection() {
  const { accessToken, activeWorkspaceId, setNotice, reportError } = useWorkspaceShell();
  const [knowSources, setKnowSources] = useState<
    { id: string; title: string; source_type: string; curation_level: string; status: string; rights_status: string }[]
  >([]);
  const [knowTitle, setKnowTitle] = useState("");
  const [knowContent, setKnowContent] = useState("");
  const [knowQuery, setKnowQuery] = useState("");
  const [knowHits, setKnowHits] = useState<
    { chunk_id: string; source_title: string; curation_level: string; chunk_text: string; hybrid_score: number }[]
  >([]);

  const loadSources = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const list = await api.listKnowledgeSources(accessToken, activeWorkspaceId);
      setKnowSources(list.items);
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, reportError]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  return (
    <section className="card">
      <h2>Knowledge / RAG Studio (SP-06)</h2>
      <p className="muted">
        Curadoria L0–L3, chunking, embeddings versionados em pgvector e citacoes verificaveis. L0 nao entra por padrao
        no contexto.
      </p>
      {!activeWorkspaceId ? (
        <p className="muted">Selecione um workspace.</p>
      ) : (
        <div className="grid-2">
          <div className="card">
            <h3>Importar Copy / Documento</h3>
            <div className="field">
              <label htmlFor="kn-title">Titulo</label>
              <input id="kn-title" className="input" value={knowTitle} onChange={(e) => setKnowTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="kn-body">Conteudo (tratado como dado nao confiavel)</label>
              <textarea
                id="kn-body"
                className="input"
                rows={4}
                value={knowContent}
                onChange={(e) => setKnowContent(e.target.value)}
              />
            </div>
            <div className="row-wrap">
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  if (!accessToken || !knowTitle.trim()) return;
                  try {
                    await api.importKnowledgeSource(accessToken, activeWorkspaceId, {
                      title: knowTitle,
                      source_type: "script",
                      content_text: knowContent,
                      rights_status: "owned",
                      collection_name: "default",
                    });
                    setKnowTitle("");
                    setKnowContent("");
                    await loadSources();
                  } catch (err) {
                    reportError(err);
                  }
                }}
              >
                Importar (L0)
              </button>
              <button type="button" className="btn" onClick={loadSources}>
                Listar Fontes
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if (!accessToken) return;
                  try {
                    const r = await api.reindexKnowledge(accessToken, activeWorkspaceId, false);
                    setNotice({
                      kind: "info",
                      code: "RAG_REINDEXED",
                      message: `Indexados ${r.indexed_sources} fontes (${r.total_chunks} chunks).`,
                    });
                  } catch (err) {
                    reportError(err);
                  }
                }}
              >
                Indexar Aprovados
              </button>
            </div>

            <ul className="mt-sm">
              {knowSources.map((s) => (
                <li key={s.id} className="mb-sm">
                  <strong>{s.title}</strong> [{s.curation_level} / {s.status}]{" "}
                  <span className="inline-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        if (!accessToken) return;
                        try {
                          await api.reviewKnowledgeSource(accessToken, activeWorkspaceId, s.id, {
                            curation_level: "L2",
                            status: "APPROVED",
                          });
                          await loadSources();
                        } catch (err) {
                          reportError(err);
                        }
                      }}
                    >
                      Aprovar L2
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        if (!accessToken) return;
                        try {
                          await api.deleteKnowledgeSource(accessToken, activeWorkspaceId, s.id, false);
                          await loadSources();
                        } catch (err) {
                          reportError(err);
                        }
                      }}
                    >
                      Arquivar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Busca Hibrida &amp; Citacoes (FTS + pgvector)</h3>
            <div className="field">
              <label htmlFor="kn-q">Consulta</label>
              <input id="kn-q" className="input" value={knowQuery} onChange={(e) => setKnowQuery(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                if (!accessToken || !knowQuery.trim()) return;
                try {
                  const res = await api.searchKnowledge(accessToken, activeWorkspaceId, knowQuery);
                  setKnowHits(res.chunks);
                } catch (err) {
                  reportError(err);
                }
              }}
            >
              Buscar Contexto Citavel (L2/L3)
            </button>
            {knowHits.length === 0 ? (
              <p className="muted">Nenhum chunk recuperado ainda.</p>
            ) : (
              <ul>
                {knowHits.map((h) => (
                  <li key={h.chunk_id}>
                    <strong>{h.source_title}</strong> ({h.curation_level}, score {h.hybrid_score.toFixed(2)}):{" "}
                    {h.chunk_text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
