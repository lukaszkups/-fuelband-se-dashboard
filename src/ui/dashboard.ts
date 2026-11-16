import type { BandSnapshot, ConnectionState, FuelBandClient } from "../ble/client.ts";

function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "-";
  return Math.round(n).toLocaleString("en-US");
}

function fmtTime(d: Date | null): string {
  if (!d) return "never";
  return d.toLocaleString();
}

function goalProgress(fuel: number | null, goal: number | null): number {
  if (fuel == null || goal == null || goal <= 0) return 0;
  return Math.min(100, Math.round((fuel / goal) * 100));
}

export function mountDashboard(
  root: HTMLElement,
  client: FuelBandClient,
): void {
  root.innerHTML = `
    <div class="noise" aria-hidden="true"></div>
    <div class="led-strip" aria-hidden="true"></div>
    <main class="shell">
      <header class="brand-block">
        <p class="eyebrow">Nike+ FuelBand SE · local readout</p>
        <h1 class="brand">SE Readout</h1>
        <p class="tagline">Live metrics from your band over Bluetooth. No Nike cloud.</p>
      </header>

      <div class="actions">
        <button type="button" class="btn primary" data-action="connect">Connect</button>
        <button type="button" class="btn" data-action="refresh" disabled>Refresh</button>
        <button type="button" class="btn ghost" data-action="disconnect" disabled>Disconnect</button>
      </div>

      <p class="status" data-status role="status">Disconnected</p>

      <section class="metrics" data-metrics hidden>
        <div class="who">
          <span data-field="who">-</span>
          <span class="serial" data-field="serial"></span>
        </div>

        <div class="hero-metric">
          <span class="label">Fuel</span>
          <span class="value fuel" data-field="fuel">-</span>
          <div class="goal-bar" aria-hidden="true">
            <div class="goal-fill" data-field="goal-fill"></div>
          </div>
          <span class="goal-caption">
            Goal <span data-field="goal">-</span>
            · <span data-field="goal-pct">0</span>%
          </span>
        </div>

        <div class="row">
          <div class="metric">
            <span class="label">Steps</span>
            <span class="value" data-field="steps">-</span>
          </div>
          <div class="metric">
            <span class="label">Calories</span>
            <span class="value" data-field="calories">-</span>
          </div>
          <div class="metric">
            <span class="label">Lifetime Fuel</span>
            <span class="value" data-field="lifetime">-</span>
          </div>
        </div>

        <p class="synced">Last sync: <span data-field="synced">never</span></p>
      </section>

      <p class="hint" data-hint>
        Needs Chrome or Edge with Bluetooth. Wake the band (button), then Connect.
      </p>
    </main>
  `;

  const statusEl = root.querySelector("[data-status]") as HTMLElement;
  const metricsEl = root.querySelector("[data-metrics]") as HTMLElement;
  const hintEl = root.querySelector("[data-hint]") as HTMLElement;
  const connectBtn = root.querySelector('[data-action="connect"]') as HTMLButtonElement;
  const refreshBtn = root.querySelector('[data-action="refresh"]') as HTMLButtonElement;
  const disconnectBtn = root.querySelector(
    '[data-action="disconnect"]',
  ) as HTMLButtonElement;

  const field = (name: string) =>
    root.querySelector(`[data-field="${name}"]`) as HTMLElement;

  const renderSnapshot = (snap: BandSnapshot) => {
    metricsEl.hidden = false;
    const who =
      snap.firstName && snap.firstName.length > 0
        ? snap.firstName
        : "FuelBand SE";
    field("who").textContent = who;
    field("serial").textContent = snap.serial ? ` · ${snap.serial}` : "";
    field("fuel").textContent = fmt(snap.fuel);
    field("steps").textContent = fmt(snap.steps);
    field("calories").textContent = fmt(snap.calories);
    field("lifetime").textContent = fmt(snap.lifetimeFuel);
    field("goal").textContent = fmt(snap.tempGoal);
    const pct = goalProgress(snap.fuel, snap.tempGoal);
    field("goal-pct").textContent = String(pct);
    (field("goal-fill") as HTMLElement).style.width = `${pct}%`;
    field("synced").textContent = fmtTime(snap.syncedAt);
  };

  const setBusy = (busy: boolean) => {
    connectBtn.disabled = busy || client.getState() === "ready";
    refreshBtn.disabled = busy || client.getState() !== "ready";
    disconnectBtn.disabled = busy || client.getState() === "disconnected";
  };

  const onStatus = (state: ConnectionState, detail?: string) => {
    const labels: Record<ConnectionState, string> = {
      disconnected: "Disconnected",
      connecting: "Connecting…",
      authenticating: "Authenticating…",
      ready: "Connected",
      error: "Error",
    };
    statusEl.textContent = detail ? `${labels[state]} - ${detail}` : labels[state];
    statusEl.dataset.state = state;

    const ready = state === "ready";
    connectBtn.disabled = ready || state === "connecting" || state === "authenticating";
    refreshBtn.disabled = !ready;
    disconnectBtn.disabled = state === "disconnected";
    hintEl.hidden = ready;
  };

  client.setStatusListener(onStatus);
  onStatus(client.getState());

  if (!client.isSupported()) {
    statusEl.textContent =
      "Web Bluetooth unavailable - open this page in Chrome or Edge on desktop Linux";
    statusEl.dataset.state = "error";
    connectBtn.disabled = true;
  }

  connectBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
      await client.connect();
      const snap = await client.refresh();
      renderSnapshot(snap);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.disconnect().catch(() => undefined);
      onStatus("error", message);
      statusEl.dataset.state = "error";
      connectBtn.disabled = false;
      refreshBtn.disabled = true;
      disconnectBtn.disabled = true;
      console.error(err);
      return;
    }
    setBusy(false);
    onStatus(client.getState(), client.getSnapshot().firstName ?? undefined);
  });

  refreshBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
      const snap = await client.refresh();
      renderSnapshot(snap);
      onStatus("ready", "Refreshed");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onStatus("error", message);
      console.error(err);
    }
    setBusy(false);
  });

  disconnectBtn.addEventListener("click", async () => {
    await client.disconnect();
    metricsEl.hidden = true;
  });
}
