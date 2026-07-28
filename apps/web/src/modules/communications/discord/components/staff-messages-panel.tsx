"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Hash, Link2, LoaderCircle, MessageSquareText, RefreshCw, Send, Unlink } from "lucide-react";

interface AvailableChannel { id: string; name: string; }
interface LinkedChannel { channelId: string; displayName: string; purpose: string; }
interface Message { id: string; content: string; timestamp: string; author: { username: string; global_name?: string | null }; }

export function StaffMessagesPanel({ canManage, canSend }: { canManage: boolean; canSend: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<AvailableChannel[]>([]);
  const [linked, setLinked] = useState<LinkedChannel[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);

  const loadChannels = useCallback(async () => {
    const response = await fetch("/api/discord/channels");
    const result = await response.json() as { configured?: boolean; available?: AvailableChannel[]; linked?: LinkedChannel[]; message?: string };
    if (!response.ok) return setNotice(result.message || "Discord could not be loaded.");
    setConfigured(Boolean(result.configured));
    setAvailable(result.available || []);
    setLinked(result.linked || []);
    setSelected((current) => current || result.linked?.[0]?.channelId || "");
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    if (!channelId) return setMessages([]);
    const response = await fetch(`/api/discord/messages?channelId=${encodeURIComponent(channelId)}`);
    const result = await response.json() as { messages?: Message[]; message?: string };
    if (!response.ok) return setNotice(result.message || "Messages could not be loaded.");
    setMessages((result.messages || []).reverse());
  }, []);

  useEffect(() => { void loadChannels(); }, [loadChannels]);
  useEffect(() => { void loadMessages(selected); }, [selected, loadMessages]);

  async function linkChannel(channel: AvailableChannel) {
    setWorking(true); setNotice("");
    const response = await fetch("/api/discord/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", channelId: channel.id, displayName: channel.name, purpose: "STAFF" })
    });
    const result = await response.json() as { message?: string };
    setNotice(response.ok ? `#${channel.name} is linked.` : result.message || "Channel could not be linked.");
    if (response.ok) await loadChannels();
    setWorking(false);
  }

  async function unlinkChannel(channel: LinkedChannel) {
    setWorking(true); setNotice("");
    const response = await fetch("/api/discord/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink", channelId: channel.channelId })
    });
    const result = await response.json() as { message?: string };
    setNotice(response.ok ? `#${channel.displayName} was unlinked.` : result.message || "Channel could not be unlinked.");
    if (response.ok) { setSelected(""); await loadChannels(); }
    setWorking(false);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !content.trim()) return;
    setWorking(true); setNotice("");
    const response = await fetch("/api/discord/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: selected, content })
    });
    const result = await response.json() as { message?: string | Message };
    if (response.ok) { setContent(""); setNotice("Message sent to Discord."); await loadMessages(selected); }
    else setNotice(typeof result.message === "string" ? result.message : "Message could not be sent.");
    setWorking(false);
  }

  if (configured === false) return (
    <section className="discord-setup-card">
      <MessageSquareText size={32} />
      <div><h2>Discord is ready for credentials</h2><p>Add the bot token and guild ID as Cloudflare bindings, then return here to approve channels.</p></div>
    </section>
  );

  return (
    <div className="discord-workspace">
      {notice ? <div className="discord-notice" role="status">{notice}</div> : null}
      <aside className="discord-channel-panel">
        <header><div><h2>Linked channels</h2><p>Only these channels are available inside the Hub.</p></div><button onClick={() => void loadChannels()} aria-label="Refresh channels"><RefreshCw size={16} /></button></header>
        <div className="linked-channel-list">
          {linked.map((channel) => (
            <button className={selected === channel.channelId ? "is-selected" : ""} key={channel.channelId} onClick={() => setSelected(channel.channelId)}>
              <Hash size={16} /><span><strong>{channel.displayName}</strong><small>{channel.purpose.replaceAll("_", " ")}</small></span>
              {canManage ? <i onClick={(event) => { event.stopPropagation(); void unlinkChannel(channel); }}><Unlink size={14} /></i> : null}
            </button>
          ))}
          {!linked.length ? <p className="discord-empty">No channels linked yet.</p> : null}
        </div>
        {canManage ? (
          <div className="available-channel-list">
            <h3>Available in Discord</h3>
            {available.filter((channel) => !linked.some((item) => item.channelId === channel.id)).map((channel) => (
              <button disabled={working} key={channel.id} onClick={() => void linkChannel(channel)}><Hash size={14} /><span>{channel.name}</span><Link2 size={14} /></button>
            ))}
          </div>
        ) : null}
      </aside>

      <section className="discord-message-panel">
        <header>
          <div><Hash size={18} /><span><strong>{linked.find((channel) => channel.channelId === selected)?.displayName || "Select a channel"}</strong><small>Live Discord messages</small></span></div>
          <button disabled={!selected} onClick={() => void loadMessages(selected)}><RefreshCw size={15} /> Refresh</button>
        </header>
        <div className="discord-message-list">
          {messages.map((message) => <article key={message.id}><span>{initials(message.author.global_name || message.author.username)}</span><div><strong>{message.author.global_name || message.author.username}<time>{formatTime(message.timestamp)}</time></strong><p>{message.content || "Attachment or embed"}</p></div></article>)}
          {selected && !messages.length ? <div className="discord-empty">No recent messages in this channel.</div> : null}
          {!selected ? <div className="discord-empty">Link and select a channel to view messages.</div> : null}
        </div>
        <form onSubmit={send}>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={1800} disabled={!selected || !canSend || working} placeholder={canSend ? "Write a message to the selected Discord channel…" : "Your Hub role is read-only."} />
          <div><span>{content.length}/1800</span><button type="submit" disabled={!selected || !canSend || working || !content.trim()}>{working ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send to Discord</button></div>
        </form>
      </section>
    </div>
  );
}

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
