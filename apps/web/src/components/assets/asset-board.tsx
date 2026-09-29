"use client";

import { useState } from "react";
import type { Asset, AssetKind } from "@/lib/assets/assets";

// The board a member looks at to answer "where is the van".
//
// Sign-out is one press and two fields, because a sheet that takes longer than fetching the keys is a sheet
// that gets filled in afterwards from memory, if at all. Everything else - inspection dates, custodians, what
// the squadron holds at all - is behind Edit, where staff go once a quarter rather than once a trip.

const KINDS: Array<{ value: AssetKind; label: string }> = [
  { value: "VEHICLE", label: "Vehicle" },
  { value: "AIRCRAFT", label: "Aircraft" },
  { value: "RADIO", label: "Radio" },
  { value: "EQUIPMENT", label: "Equipment" }
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((kind) => [kind.value, kind.label]));

export interface BoardMember {
  id: string;
  name: string;
}

export function AssetBoard({
  initial,
  members,
  canManage,
  me
}: {
  initial: Asset[];
  members: BoardMember[];
  canManage: boolean;
  me: string | null;
}) {
  const [assets, setAssets] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState<string | null>(null);
  const [bookingIn, setBookingIn] = useState<string | null>(null);
  const [editing, setEditing] = useState<Asset | "new" | null>(null);

  const [driver, setDriver] = useState(me ?? "");
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [reading, setReading] = useState("");

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { message?: string; assets?: Asset[] };
      if (data.assets) setAssets(data.assets);
      setNote(data.message ?? null);
      return response.ok;
    } catch {
      setNote("That did not reach the Hub. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function clearForm() {
    setSigningOut(null);
    setBookingIn(null);
    setPurpose("");
    setDestination("");
    setReading("");
    setDriver(me ?? "");
  }

  async function doSignOut(id: string) {
    const ok = await send({
      action: "out",
      id,
      memberId: driver,
      purpose: purpose.trim() || null,
      destination: destination.trim() || null,
      odometerOut: reading.trim() ? Number(reading.trim()) : null
    });
    if (ok) clearForm();
  }

  async function doBookIn(id: string) {
    const ok = await send({ action: "in", id, odometerIn: reading.trim() ? Number(reading.trim()) : null });
    if (ok) clearForm();
  }

  const live = assets.filter((asset) => asset.status !== "RETURNED");
  const gone = assets.filter((asset) => asset.status === "RETURNED");

  return (
    <div className="ab">
      <style>{abCss}</style>

      {canManage ? (
        <div className="ab-top">
          <button type="button" className="ab-btn ab-btn--primary" onClick={() => setEditing("new")}>
            Add something
          </button>
        </div>
      ) : null}

      {note ? <p className="ab-note" role="status">{note}</p> : null}

      {live.length === 0 ? (
        <p className="ab-empty">
          Nothing is recorded yet. When wing assigns the squadron a vehicle or a piece of equipment, add it here
          and it becomes something the unit can account for rather than something one person keeps track of.
        </p>
      ) : null}

      <ul className="ab-grid">
        {live.map((asset) => (
          <li key={asset.id} className={"ab-card is-" + asset.status.toLowerCase()}>
            <header className="ab-card-head">
              <div className="ab-title">
                <strong>{asset.name}</strong>
                <small>
                  {KIND_LABEL[asset.kind] ?? asset.kind}
                  {asset.identifier ? " · " + asset.identifier : ""}
                </small>
              </div>
              <span className={"ab-pill ab-pill--" + asset.status.toLowerCase()}>
                {asset.status === "OUT" ? "Signed out" : asset.status === "GROUNDED" ? "Unserviceable" : "Available"}
              </span>
            </header>

            <dl className="ab-facts">
              {asset.custodianName ? (
                <div><dt>Answerable</dt><dd>{asset.custodianName}</dd></div>
              ) : null}
              {asset.odometer !== null ? (
                <div><dt>Odometer</dt><dd>{asset.odometer.toLocaleString()}</dd></div>
              ) : null}
              {asset.inspectionDueOn ? (
                <div><dt>Inspection</dt><dd>{asset.inspectionDueOn}</dd></div>
              ) : null}
              {asset.registrationExpiresOn ? (
                <div><dt>Registration</dt><dd>{asset.registrationExpiresOn}</dd></div>
              ) : null}
            </dl>

            {asset.warnings.map((warning) => (
              <p key={warning} className="ab-warn">{warning}</p>
            ))}

            {asset.openBooking ? (
              <p className="ab-out">
                <strong>{asset.openBooking.memberName ?? "Somebody"}</strong> has it
                {asset.openBooking.destination ? " — " + asset.openBooking.destination : ""}
                {asset.openBooking.purpose ? " (" + asset.openBooking.purpose + ")" : ""}
                , since {new Date(asset.openBooking.outAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
              </p>
            ) : null}

            {signingOut === asset.id ? (
              <div className="ab-form">
                <select className="ab-input" value={driver} onChange={(event) => setDriver(event.target.value)}>
                  <option value="">Who is taking it?</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
                <input className="ab-input" value={destination} placeholder="Where to" maxLength={200}
                       onChange={(event) => setDestination(event.target.value)} />
                <input className="ab-input" value={purpose} placeholder="What for" maxLength={200}
                       onChange={(event) => setPurpose(event.target.value)} />
                <input className="ab-input" value={reading} inputMode="numeric" placeholder="Odometer out"
                       onChange={(event) => setReading(event.target.value.replace(/\D/g, ""))} />
                <div className="ab-form-actions">
                  <button type="button" className="ab-btn ab-btn--primary" disabled={busy || !driver}
                          onClick={() => doSignOut(asset.id)}>
                    {busy ? "Saving…" : "Sign out"}
                  </button>
                  <button type="button" className="ab-link" disabled={busy} onClick={clearForm}>Cancel</button>
                </div>
              </div>
            ) : bookingIn === asset.id ? (
              <div className="ab-form">
                <input className="ab-input" value={reading} inputMode="numeric" placeholder="Odometer in"
                       onChange={(event) => setReading(event.target.value.replace(/\D/g, ""))} />
                <div className="ab-form-actions">
                  <button type="button" className="ab-btn ab-btn--primary" disabled={busy}
                          onClick={() => doBookIn(asset.id)}>
                    {busy ? "Saving…" : "Book back in"}
                  </button>
                  <button type="button" className="ab-link" disabled={busy} onClick={clearForm}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="ab-actions">
                {asset.status === "OUT" ? (
                  <button type="button" className="ab-btn" disabled={busy}
                          onClick={() => { clearForm(); setBookingIn(asset.id); }}>
                    Book back in
                  </button>
                ) : asset.status === "AVAILABLE" ? (
                  <button type="button" className="ab-btn" disabled={busy}
                          onClick={() => { clearForm(); setSigningOut(asset.id); }}>
                    Sign out
                  </button>
                ) : null}
                {canManage ? (
                  <>
                    <button type="button" className="ab-link" disabled={busy} onClick={() => setEditing(asset)}>Edit</button>
                    {asset.status === "GROUNDED" ? (
                      <button type="button" className="ab-link" disabled={busy}
                              onClick={() => send({ action: "status", id: asset.id, status: "AVAILABLE" })}>
                        Back in service
                      </button>
                    ) : asset.status === "AVAILABLE" ? (
                      <button type="button" className="ab-link" disabled={busy}
                              onClick={() => send({ action: "status", id: asset.id, status: "GROUNDED" })}>
                        Mark unserviceable
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>

      {gone.length ? (
        <details className="ab-gone">
          <summary>{gone.length === 1 ? "One item returned to wing" : gone.length + " items returned to wing"}</summary>
          <ul>
            {gone.map((asset) => (
              <li key={asset.id}>{asset.name}{asset.identifier ? " · " + asset.identifier : ""}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {editing ? (
        <AssetEditor
          asset={editing === "new" ? null : editing}
          members={members}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await send({ action: "save", ...body });
            if (ok) setEditing(null);
          }}
          onDelete={async (id) => {
            const ok = await send({ action: "delete", id });
            if (ok) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AssetEditor({
  asset,
  members,
  busy,
  onCancel,
  onSave,
  onDelete
}: {
  asset: Asset | null;
  members: BoardMember[];
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? "VEHICLE");
  const [name, setName] = useState(asset?.name ?? "");
  const [identifier, setIdentifier] = useState(asset?.identifier ?? "");
  const [custodianId, setCustodianId] = useState(asset?.custodianId ?? "");
  const [assignedOn, setAssignedOn] = useState(asset?.assignedOn ?? "");
  const [inspectionDueOn, setInspectionDueOn] = useState(asset?.inspectionDueOn ?? "");
  const [registrationExpiresOn, setRegistrationExpiresOn] = useState(asset?.registrationExpiresOn ?? "");
  const [odometer, setOdometer] = useState(asset?.odometer === null || asset?.odometer === undefined ? "" : String(asset.odometer));
  const [notes, setNotes] = useState(asset?.notes ?? "");

  const vehicle = kind === "VEHICLE";

  return (
    <div className="ab-sheet" role="dialog" aria-label={asset ? "Edit " + asset.name : "Add something"}>
      <div className="ab-sheet-inner">
        <h3>{asset ? asset.name : "Add something"}</h3>

        <label className="ab-field">
          <span>What is it</span>
          <select className="ab-input" value={kind} onChange={(event) => setKind(event.target.value as AssetKind)}>
            {KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="ab-field">
          <span>Name</span>
          <input className="ab-input" value={name} maxLength={120} placeholder="Squadron van"
                 onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="ab-field">
          <span>CAP number</span>
          <input className="ab-input" value={identifier} maxLength={60} placeholder="Vehicle, tail or property number"
                 onChange={(event) => setIdentifier(event.target.value)} />
        </label>

        <label className="ab-field">
          <span>Who is answerable for it</span>
          <select className="ab-input" value={custodianId} onChange={(event) => setCustodianId(event.target.value)}>
            <option value="">Nobody yet</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>

        <label className="ab-field">
          <span>Assigned to the squadron on</span>
          <input className="ab-input" type="date" value={assignedOn} onChange={(event) => setAssignedOn(event.target.value)} />
        </label>

        {vehicle ? (
          <>
            <label className="ab-field">
              <span>Odometer</span>
              <input className="ab-input" value={odometer} inputMode="numeric"
                     onChange={(event) => setOdometer(event.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="ab-field">
              <span>Inspection due</span>
              <input className="ab-input" type="date" value={inspectionDueOn}
                     onChange={(event) => setInspectionDueOn(event.target.value)} />
            </label>
            <label className="ab-field">
              <span>Registration expires</span>
              <input className="ab-input" type="date" value={registrationExpiresOn}
                     onChange={(event) => setRegistrationExpiresOn(event.target.value)} />
            </label>
          </>
        ) : null}

        <label className="ab-field">
          <span>Notes</span>
          <textarea className="ab-input" rows={3} value={notes} maxLength={2000}
                    onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div className="ab-form-actions">
          <button
            type="button"
            className="ab-btn ab-btn--primary"
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave({
                ...(asset ? { id: asset.id } : {}),
                kind,
                name: name.trim(),
                identifier: identifier.trim() || null,
                custodianId: custodianId || null,
                assignedOn: assignedOn || null,
                notes: notes.trim() || null,
                odometer: vehicle && odometer.trim() ? Number(odometer.trim()) : null,
                registrationExpiresOn: vehicle ? registrationExpiresOn || null : null,
                inspectionDueOn: vehicle ? inspectionDueOn || null : null
              })
            }
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="ab-link" disabled={busy} onClick={onCancel}>Cancel</button>
          {asset ? (
            <button type="button" className="ab-link ab-link--danger" disabled={busy} onClick={() => onDelete(asset.id)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const abCss = [
  ".ab{display:grid;gap:14px}",
  ".ab-top{display:flex;gap:8px;flex-wrap:wrap}",
  ".ab-grid{list-style:none;margin:0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}",
  ".ab-card{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;background:var(--cu-bg,#fff);padding:15px 16px;display:flex;flex-direction:column;gap:10px}",
  "html[data-theme=dark] .ab-card{background:#222326;border-color:#3a3d44}",
  ".ab-card.is-grounded{opacity:.75}",
  ".ab-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}",
  ".ab-title{display:flex;flex-direction:column;gap:2px;min-width:0}",
  ".ab-title strong{font-size:15.5px}",
  ".ab-title small{font-size:12.5px;color:var(--cu-muted,#656f7d)}",
  ".ab-pill{flex:0 0 auto;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:rgba(12,163,12,.14);color:#0a7a0a}",
  ".ab-pill--out{background:rgba(229,154,0,.16);color:#8a5c00}",
  ".ab-pill--grounded{background:rgba(208,59,59,.14);color:#b03030}",
  ".ab-facts{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}",
  ".ab-facts div{display:flex;flex-direction:column;gap:1px;min-width:0}",
  ".ab-facts dt{font-size:11.5px;color:var(--cu-muted,#8b93a1);text-transform:uppercase;letter-spacing:.03em}",
  ".ab-facts dd{margin:0;font-size:14px;font-variant-numeric:tabular-nums}",
  ".ab-warn{margin:0;font-size:12.5px;font-weight:600;color:#b03030}",
  ".ab-out{margin:0;font-size:13px;line-height:1.5;padding:9px 11px;border-radius:9px;background:rgba(229,154,0,.1)}",
  ".ab-actions,.ab-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
  ".ab-form{display:grid;gap:8px}",
  ".ab-input{width:100%;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:14px;padding:9px 11px}",
  "html[data-theme=dark] .ab-input{border-color:#3a3d44}",
  ".ab-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:9px 15px;border-radius:9px;cursor:pointer}",
  ".ab-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".ab-btn:disabled{opacity:.55;cursor:default}",
  ".ab-link{border:0;background:none;padding:0;color:#7b68ee;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:underline}",
  ".ab-link--danger{color:#d03b3b}",
  ".ab-note{margin:0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".ab-empty{margin:0;font-size:14px;line-height:1.6;max-width:70ch;color:var(--cu-muted,#656f7d)}",
  ".ab-gone{font-size:13.5px;color:var(--cu-muted,#656f7d)}",
  ".ab-gone ul{margin:8px 0 0;padding-left:20px;display:grid;gap:4px}",
  ".ab-sheet{position:fixed;inset:0;background:rgba(10,12,18,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:60}",
  ".ab-sheet-inner{width:min(520px,100%);max-height:88vh;overflow:auto;background:var(--cu-bg,#fff);border-radius:14px;padding:20px;display:grid;gap:11px}",
  "html[data-theme=dark] .ab-sheet-inner{background:#222326}",
  ".ab-sheet-inner h3{margin:0;font-size:17px}",
  ".ab-field{display:grid;gap:4px}",
  ".ab-field>span{font-size:12.5px;font-weight:600;color:var(--cu-muted,#656f7d)}",
  "@media (max-width:760px){.ab-grid{grid-template-columns:1fr}}"
].join("");
