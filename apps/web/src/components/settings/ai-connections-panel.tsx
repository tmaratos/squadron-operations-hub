"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, KeyRound, Trash2 } from "lucide-react";

type Connection = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function AiConnectionsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [name, setName] = useState("My ChatGPT connection");
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("/api/mcp");

  useEffect(() => {
    setUrl(window.location.origin + "/api/mcp");
    void reload();
  }, []);

  async function reload() {
    try {
      const response = await fetch("/api/integrations/ai-connections", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load your connections.");
      const result = (await response.json()) as { connections: Connection[] };
      setConnections(result.connections || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Connection list could not be loaded.");
    }
  }

  async function create() {
    setBusy(true);
    setSecret("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/ai-connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name })
      });
      const data = (await response.json()) as { token?: string; message?: string };
      if (!response.ok || !data.token) throw new Error(data.message ?? "Unable to create this connection.");
      setSecret(data.token);
      setNotice("Created. Copy the key to the connection form. It is displayed only once.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create connection.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, label: string) {
    if (!window.confirm("Revoke " + label + "? ChatGPT or Claude will lose access immediately.")) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/integrations/ai-connections", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!response.ok) throw new Error("Unable to revoke this connection.");
      setSecret("");
      setNotice("Connection revoked. The external AI client no longer has access with that key.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Revocation failed.");
    } finally {
      setBusy(false);
    }
  }

  function clipboard(value: string) {
    void navigator.clipboard.writeText(value).then(() => setNotice("Copied. Keep connection keys private."))
      .catch(() => setNotice("Copy was unavailable. Select and copy the text manually."));
  }

  return (
    <div className="ai-connect-manager">
      <div className="ai-connect-panel">
        <h2><Link2 size={20} aria-hidden="true" /> Your connection address</h2>
        <p>Use the address shown here after the domain move. It automatically follows the Hub domain you opened.</p>
        <div className="ai-connect-secret">
          <code>{url}</code>
          <button type="button" onClick={() => clipboard(url)} aria-label="Copy MCP server address"><Copy size={16} /> Copy address</button>
        </div>
        <p>When using a client that supports bearer/API-key authentication, enter your personal key in its secure connection settings. Never paste it into an AI conversation.</p>
      </div>

      <div className="ai-connect-panel">
        <h2><KeyRound size={20} aria-hidden="true" /> Create your personal connection key</h2>
        <p>Keys are read-only, expire after 90 days, and inherit your approved Hub role and Google Shared Drive access.</p>
        <label htmlFor="ai-connection-name">Connection name</label>
        <div className="ai-connect-create">
          <input id="ai-connection-name" value={name} maxLength={50} onChange={(event) => setName(event.target.value)} />
          <button type="button" disabled={busy || name.trim().length < 2} onClick={() => void create()}>Create key</button>
        </div>
        {secret ? (
          <div className="ai-connect-key" role="group" aria-label="One-time connection key">
            <strong>One-time key — save it now</strong>
            <div className="ai-connect-secret">
              <input type="password" readOnly aria-label="One-time private connection key" value={secret} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" onClick={() => clipboard(secret)}><Copy size={16} /> Copy key</button>
            </div>
            <button type="button" className="ai-connect-hide" onClick={() => setSecret("")}>Hide key</button>
          </div>
        ) : null}
      </div>

      <div className="ai-connect-panel">
        <h2>Existing connections</h2>
        {!connections.length ? <p>No connections found. Create a personal key above when you're ready to connect.</p> : (
          <ul className="ai-connect-list">
            {connections.map((item) => (
              <li key={item.id}>
                <span><strong>{item.label}</strong>
                  <small>{item.revokedAt ? "Revoked" : new Date(item.expiresAt) <= new Date() ? "Expired" : "Active"} · Expires {new Date(item.expiresAt).toLocaleDateString()} · Last used {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : "Never"}</small>
                </span>
                {!item.revokedAt ? <button disabled={busy} type="button" onClick={() => void revoke(item.id, item.label)}><Trash2 size={16} /> Revoke</button> : null}
              </li>
            ))}
          </ul>
        )}
        {notice ? <p role="status" className="ai-connect-notice">{notice}</p> : null}
      </div>
    </div>
  );
}
