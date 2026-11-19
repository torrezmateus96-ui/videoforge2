"use client";

import React, { useState } from "react";
import { getInitialAuthEmail, getInitialAuthPassword, sanitizeAuthEmail } from "@/lib/auth-defaults";
import { getSupabaseClient } from "@/lib/supabase";
import { useWorkspaceShell } from "@/lib/workspace-shell-context";

export function AuthGateCard() {
  const { supabaseConfigured, enterSandboxMode, setNotice, reportError } = useWorkspaceShell();
  const [email, setEmail] = useState<string>(() => getInitialAuthEmail());
  const [password, setPassword] = useState<string>(() => getInitialAuthPassword());
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!supabaseConfigured) {
      setNotice({
        kind: "warn",
        code: "CONFIG_MISSING",
        message: "Credenciais publicas do Supabase nao configuradas neste ambiente. Use o Modo Sandbox Local abaixo ou configure o .env.",
      });
      return;
    }
    try {
      const supa = getSupabaseClient();
      const result =
        authMode === "signin"
          ? await supa.auth.signInWithPassword({ email, password })
          : await supa.auth.signUp({ email, password });
      if (result.error) {
        setNotice({ kind: "err", code: "AUTH_ERROR", message: result.error.message });
      }
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <div className="grid-2">
      <section className="card auth-card">
        <h2>Autenticacao no Produto (Supabase Auth)</h2>
        <p className="muted">
          A sessao do Channel OS e separada de qualquer conexao OAuth do YouTube (AUTH-004). Zero credenciais pre-preenchidas em producao (RH-01).
        </p>
        <form onSubmit={handleAuthSubmit} autoComplete="on">
          <div className="field">
            <label htmlFor="auth-email">E-mail</label>
            <input
              id="auth-email"
              className="input"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(sanitizeAuthEmail(e.target.value) || e.target.value.trim())}
            />
          </div>
          <div className="field">
            <label htmlFor="auth-pass">Senha</label>
            <input
              id="auth-pass"
              className="input"
              type="password"
              autoComplete={authMode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn primary">
              {authMode === "signin" ? "Entrar" : "Criar conta"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setAuthMode((m) => (m === "signin" ? "signup" : "signin"))}
            >
              {authMode === "signin" ? "Novo usuario" : "Ja tenho conta"}
            </button>
          </div>
        </form>
      </section>

      {!supabaseConfigured && (
        <section className="card auth-card">
          <h2>Explorar em Modo Sandbox Local Efemero</h2>
          <p className="muted">
            As variaveis publicas <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> nao estao definidas neste preview.
          </p>
          <p className="muted">
            Ative o Sandbox Local em memoria para inspecionar as <strong>13 secoes modularizadas</strong> e o{" "}
            <strong>Estudio 2.5D de Agentes</strong> com fidelidade de contratos (metricas nao sincronizadas permanecem{" "}
            <code>UNKNOWN</code> — zero numeros falsos).
          </p>
          <button type="button" className="btn primary" onClick={enterSandboxMode}>
            Explorar Modo Sandbox Local (Sem Nuvem)
          </button>
        </section>
      )}
    </div>
  );
}
