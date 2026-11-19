"use client";

import { NAV_ITEMS } from "@/lib/navigation";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export function AppSidebar() {
  const { section, setSection, theme, toggleTheme } = useWorkspaceShell();

  return (
    <nav className="sidebar" aria-label="Navegacao principal">
      <div className="sidebar-brand">
        <div className="sidebar-logo-3d" aria-hidden="true">
          ▶
        </div>
        <div>
          <strong className="sidebar-brand-title">DarkForge OS</strong>
          <div className="sidebar-brand-sub">Estúdio &amp; Inteligência 3D</div>
        </div>
      </div>

      <div className="sidebar-nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav-btn"
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => setSection(item.id)}
          >
            <span className="nav-btn-label">{item.label}</span>
            <span className="nav-phase-badge">{item.phase}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="btn studio-btn-sm btn-block"
          onClick={toggleTheme}
        >
          Tema: {theme === "dark" ? "Escuro 3D" : "Claro"}
        </button>
      </div>
    </nav>
  );
}
