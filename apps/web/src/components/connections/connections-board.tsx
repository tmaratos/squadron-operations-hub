"use client";

import { useState } from "react";
import type { ConnectionSummary, ProviderDefinition } from "@/lib/connections";

const SECTIONS: Array<{ id: ProviderDefinition["category"]; title: string; blurb: string }> = [
  { id: "files", title: "Files", blurb: "Open and attach documents from your own storage." },
  { id: "email", title: "Email", blurb: "Turn emails into tasks without copying and pasting." },
  { id: "ai", title: "AI assistants", blurb: "Optional. Connect your own AI account. Your key is locked away and never shown again — not even to administrators." }
];

type Notice = { provider: string; ok: boolean; message: string };

export function ConnectionsBoard({ providers, initialConnections }: { providers: ProviderDefinition[]; initialConnections: ConnectionSummary[] }) {
  const [connections, setConnections] = useState<ConnectionSummary[]>(initialConnections);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function call(provider: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(provider);
    setNotice(null);
    try {
      const response = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, ...body }) });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; connections?: ConnectionSummary[] };
      if (data.connections) setConnections(data.connections);
      const ok = response.ok && data.ok !== false;
      setNotice({ provider, ok, message: data.message ?? (ok ? "Done." : "Something went wrong. Try again.") });
      return ok;
    } catch {
      setNotice({ provider, ok: false, message: "Couldn't reach the Hub. Check your internet and try again." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function startConnect(providerId: string) {
    setOpenProvider(providerId);
    setApiKey("");
    setBaseUrl("");
    setShowKey(false);
    setNotice(null);
  }

  const connectedCount = connections.filter((connection) => connection.status === "CONNECTED").length;

  return (
    <div className="cx">
      <style>{cxCss}</style>
      <div className="cx-intro">
        <span className="cx-intro-icon" aria-hidden="true">🔒</span>
        <p><strong>{connectedCount} connected.</strong> Only you can use what you connect here. You can disconnect anything at any time, and it takes effect right away.</p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.id} className="cx-section" aria-labelledby={"cx-" + section.id}>
          <header className="cx-section-head">
            <h2 id={"cx-" + section.id}>{section.title}</h2>
            <p>{section.blurb}</p>
          </header>
          <div className="cx-grid">
            {providers.filter((provider) => provider.category === section.id).map((provider) => {
              const connection = connections.find((entry) => entry.provider === provider.id);
              const connected = connection?.status === "CONNECTED";
              const problem = connection?.status === "ERROR";
              const isOpen = openProvider === provider.id;
              const isBusy = busy === provider.id;
              const shortName = provider.name.split(" (")[0];
              return (
                <article key={provider.id} className={"cx-card" + (connected ? " is-connected" : "") + (problem ? " is-problem" : "")}>
                  <div className="cx-card-top">
                    <span className="cx-logo" style={{ background: provider.color }} aria-hidden="true">{provider.initials}</span>
                    <div className="cx-card-title">
                      <h3>{provider.name}</h3>
                      <p>{provider.summary}</p>
                    </div>
                  </div>

                  <div className="cx-status">
                    {connected ? <span className="cx-pill cx-pill--ok">✓ Connected</span>
                      : problem ? <span className="cx-pill cx-pill--bad">! Needs attention</span>
                      : provider.method === "coming_soon" ? <span className="cx-pill">Coming soon</span>
                      : <span className="cx-pill">Not connected</span>}
                    {connection?.accountEmail ? <span className="cx-meta">{connection.accountEmail}</span> : null}
                    {connection?.keyHint ? <span className="cx-meta">Key ending {connection.keyHint.replace(/•/g, "")}</span> : null}
                  </div>

                  {problem && connection?.lastError ? <p className="cx-message cx-message--bad">{connection.lastError}</p> : null}
                  {notice && notice.provider === provider.id ? <p className={"cx-message " + (notice.ok ? "cx-message--ok" : "cx-message--bad")} role="status">{notice.message}</p> : null}

                  {provider.method === "google_signin" ? (
                    <p className="cx-help">{connected ? "Connected through your Google sign-in. Nothing else to do." : "Sign out, then sign back in with Google and allow Drive access."}</p>
                  ) : null}

                  {provider.method === "coming_soon" ? (
                    <div className="cx-actions">
                      <button type="button" className="cx-btn" disabled>Coming soon</button>
                      <span className="cx-help">Your administrator is setting this up.</span>
                    </div>
                  ) : null}

                  {provider.method === "api_key" && isOpen ? (
                    <form
                      className="cx-form"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const ok = await call(provider.id, { action: "save", apiKey, baseUrl: provider.needsBaseUrl ? baseUrl : null });
                        if (ok) {
                          setOpenProvider(null);
                          setApiKey("");
                          setShowKey(false);
                        }
                      }}
                    >
                      <ol className="cx-steps">
                        {provider.keyUrl ? (
                          <li>
                            <span className="cx-step-text">Get your key from {shortName}.</span>
                            <a className="cx-btn cx-btn--ghost" href={provider.keyUrl} target="_blank" rel="noreferrer noopener">Open the key page ↗</a>
                            {provider.keyHelp ? <small>{provider.keyHelp}</small> : null}
                          </li>
                        ) : null}
                        {provider.needsBaseUrl ? (
                          <li>
                            <label className="cx-field">
                              <span className="cx-step-text">Type the service address.</span>
                              <input type="url" inputMode="url" placeholder="https://" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} autoComplete="off" />
                            </label>
                          </li>
                        ) : null}
                        <li>
                          <label className="cx-field">
                            <span className="cx-step-text">Paste your key here.</span>
                            <span className="cx-key-row">
                              <input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste key" aria-label={shortName + " key"} />
                              <button type="button" className="cx-btn cx-btn--ghost" onClick={() => setShowKey(!showKey)}>{showKey ? "Hide" : "Show"}</button>
                            </span>
                          </label>
                        </li>
                      </ol>
                      <div className="cx-actions">
                        <button type="button" className="cx-btn cx-btn--ghost" onClick={() => setOpenProvider(null)}>Cancel</button>
                        <button type="submit" className="cx-btn cx-btn--primary" disabled={isBusy || apiKey.trim().length < 8 || Boolean(provider.needsBaseUrl && !baseUrl.trim())}>
                          {isBusy ? "Checking your key…" : "Save and test"}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {provider.method === "api_key" && !isOpen ? (
                    <div className="cx-actions">
                      {connection ? (
                        <>
                          <button type="button" className="cx-btn" disabled={isBusy} onClick={() => call(provider.id, { action: "test" })}>{isBusy ? "Testing…" : "Test again"}</button>
                          <button type="button" className="cx-btn" disabled={isBusy} onClick={() => startConnect(provider.id)}>Replace key</button>
                          <button type="button" className="cx-btn cx-btn--danger" disabled={isBusy} onClick={() => { if (window.confirm("Disconnect " + provider.name + "? Your saved key will be deleted.")) call(provider.id, { action: "disconnect" }); }}>Disconnect</button>
                        </>
                      ) : (
                        <button type="button" className="cx-btn cx-btn--primary" onClick={() => startConnect(provider.id)}>Connect {shortName}</button>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="cx-footnote">Running your own AI on squadron computers (local AI) is planned for later.</p>
    </div>
  );
}

const cxCss = [
  ".cx{--cx-card:#ffffff;--cx-border:var(--cu-border,#e4e6eb);--cx-muted:var(--cu-muted,#656f7d);--cx-hover:var(--cu-hover,rgba(15,23,42,.05));display:flex;flex-direction:column;gap:28px;max-width:1200px}",
  "html[data-theme=dark] .cx{--cx-card:#222326}",
  ".cx-intro{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:rgba(123,104,238,.1);border:1px solid rgba(123,104,238,.3)}",
  ".cx-intro p{margin:0;font-size:14px;line-height:1.5}.cx-intro-icon{font-size:20px}",
  ".cx-section{display:flex;flex-direction:column;gap:12px}",
  ".cx-section-head h2{margin:0;font-size:18px;font-weight:650}.cx-section-head p{margin:4px 0 0;font-size:14px;color:var(--cx-muted)}",
  ".cx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}",
  ".cx-card{display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:14px;background:var(--cx-card);border:1px solid var(--cx-border);transition:border-color .15s,box-shadow .15s}",
  ".cx-card:hover{box-shadow:0 6px 18px rgba(0,0,0,.08)}",
  ".cx-card.is-connected{border-color:rgba(12,163,12,.45)}.cx-card.is-problem{border-color:rgba(208,59,59,.5)}",
  ".cx-card-top{display:flex;gap:12px;align-items:flex-start}",
  ".cx-logo{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;color:#fff;font-weight:800;font-size:14px;flex:none}",
  ".cx-card-title h3{margin:0;font-size:16px;font-weight:650}.cx-card-title p{margin:4px 0 0;font-size:13px;line-height:1.45;color:var(--cx-muted)}",
  ".cx-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px}",
  ".cx-pill{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:12px;font-size:12px;font-weight:600;background:var(--cx-hover);color:var(--cx-muted)}",
  ".cx-pill--ok{background:rgba(12,163,12,.14);color:#0a7a0a}.cx-pill--bad{background:rgba(208,59,59,.14);color:#c03030}",
  "html[data-theme=dark] .cx-pill--ok{color:#5fd35f}html[data-theme=dark] .cx-pill--bad{color:#f19b9b}",
  ".cx-meta{font-size:12px;color:var(--cx-muted)}",
  ".cx-message{margin:0;padding:9px 12px;border-radius:8px;font-size:13px;line-height:1.45}",
  ".cx-message--ok{background:rgba(12,163,12,.12);color:#0a7a0a}.cx-message--bad{background:rgba(208,59,59,.12);color:#c03030}",
  "html[data-theme=dark] .cx-message--ok{color:#7fdc7f}html[data-theme=dark] .cx-message--bad{color:#f5a9a9}",
  ".cx-help{margin:0;font-size:13px;color:var(--cx-muted)}",
  ".cx-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto}",
  ".cx-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 16px;border-radius:8px;border:1px solid var(--cx-border);background:var(--cx-card);color:inherit;font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}",
  ".cx-btn:hover:not(:disabled){border-color:#7b68ee;color:#7b68ee}.cx-btn:disabled{opacity:.55;cursor:default}",
  ".cx-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.cx-btn--primary:hover:not(:disabled){background:#6a58e0;color:#fff}",
  ".cx-btn--ghost{background:transparent}",
  ".cx-btn--danger:hover:not(:disabled){border-color:#d03b3b;color:#d03b3b}",
  ".cx-form{display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:10px;background:var(--cx-hover)}",
  ".cx-steps{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:12px}",
  ".cx-steps li{display:flex;flex-direction:column;align-items:flex-start;gap:6px;font-size:14px}",
  ".cx-steps li::marker{font-weight:700;color:#7b68ee}",
  ".cx-steps small{font-size:12px;color:var(--cx-muted)}",
  ".cx-step-text{font-weight:600}",
  ".cx-field{display:flex;flex-direction:column;gap:6px;width:100%}",
  ".cx-field input{width:100%;min-height:40px;font-size:15px}",
  ".cx-key-row{display:flex;gap:6px;width:100%}.cx-key-row input{flex:1;min-width:0}",
  ".cx-footnote{margin:0;font-size:13px;color:var(--cx-muted)}",
  "@media (max-width:600px){.cx-grid{grid-template-columns:minmax(0,1fr)}.cx-btn{flex:1}}"
].join("");
