export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="dashboard-grid flex min-h-screen items-center px-6 py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="page-intro">
          <p className="text-sm font-semibold uppercase tracking-[0.36em] text-primary">
            Repository Console
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-tight text-balance sm:text-6xl">
            Monitoring UI rebuilt around live telemetry, alerts, and operator workflows.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            NodePrism combines fleet health, incidents, logs, forecasting, and service visibility in
            one operations-focused workspace.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href="/dashboard"
              className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.25)] transition hover:-translate-y-0.5"
            >
              Go to Dashboard
            </a>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center rounded-xl border border-border/80 bg-card/70 px-6 text-sm font-semibold text-foreground transition hover:bg-accent/60"
            >
              API Health Check
            </a>
          </div>
        </section>

        <section className="monitor-panel page-intro rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Platform Surface
          </p>
          <div className="mt-6 space-y-4">
            {[
              ['Servers', 'Fleet inventory, tags, agents, and live capacity snapshots'],
              ['Alerts', 'Severity-driven triage, acknowledgements, and silence flows'],
              ['Metrics', 'Prometheus-backed charts, trends, and custom dashboards'],
              ['Incidents', 'Status timelines and operational context for active issues'],
            ].map(([title, copy], index) => (
              <div
                key={title}
                className="rounded-[1.2rem] border border-border/70 bg-accent/20 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="metric-text text-sm text-primary">0{index + 1}</span>
                  <h2 className="text-lg font-semibold">{title}</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
