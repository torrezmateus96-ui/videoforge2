"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export default function CalendarSection() {
  const { accessToken, activeWorkspaceId, activeChannelId, reportError } = useWorkspaceShell();
  const [calItems, setCalItems] = useState<
    { id: string; title: string; scheduled_for: string; status: string; auto_publish_enabled: boolean }[]
  >([]);
  const [calTitle, setCalTitle] = useState("");
  const [calDate, setCalDate] = useState("2026-11-20");

  const loadCalendar = useCallback(async () => {
    if (!accessToken || !activeWorkspaceId) return;
    try {
      const res = await api.listCalendar(accessToken, activeWorkspaceId);
      setCalItems(res.items);
    } catch (err) {
      reportError(err);
    }
  }, [accessToken, activeWorkspaceId, reportError]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  return (
    <section className="card">
      <h2>Calendario Editorial Manual (SP-07)</h2>
      <p className="muted">Planejamento manual apenas; auto-publicacao no YouTube permanece desabilitada (EDIT-005).</p>
      {activeWorkspaceId && activeChannelId && (
        <div className="field-row mb-sm">
          <input
            className="input input-grow"
            placeholder="Titulo planejado..."
            value={calTitle}
            onChange={(e) => setCalTitle(e.target.value)}
          />
          <input
            className="input input-compact"
            type="date"
            value={calDate}
            onChange={(e) => setCalDate(e.target.value)}
          />
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              if (!accessToken || !calTitle.trim()) return;
              try {
                await api.createCalendarItem(accessToken, activeWorkspaceId, {
                  channel_id: activeChannelId,
                  title: calTitle,
                  scheduled_for: calDate,
                });
                setCalTitle("");
                await loadCalendar();
              } catch (err) {
                reportError(err);
              }
            }}
          >
            Agendar Manualmente
          </button>
          <button type="button" className="btn" onClick={loadCalendar}>
            Atualizar
          </button>
        </div>
      )}

      {calItems.length === 0 ? (
        <p className="muted">Nenhum item no calendario editorial.</p>
      ) : (
        <ul>
          {calItems.map((c) => (
            <li key={c.id}>
              <strong>{c.scheduled_for}</strong> — {c.title} ({c.status}, auto_publish=
              {String(c.auto_publish_enabled)})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
