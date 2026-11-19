"use client";

export function SectionSkeleton({ label = "Carregando modulo..." }: { label?: string }) {
  return (
    <section className="card skeleton-card" aria-busy="true" aria-live="polite">
      <div className="skeleton-line skeleton-title" />
      <p className="muted">{label}</p>
      <div className="skeleton-line" />
      <div className="skeleton-line skeleton-short" />
    </section>
  );
}
