"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, type BudgetLine, type Direction, type Meeting, type Transaction, type TxStatus } from "@/lib/finance/finance";
import type { Finding, Summary } from "@/lib/finance/findings";

// The squadron's money on one page.
//
// Three views because there are three genuinely different questions: what moved (Ledger), what we said we
// would do (Budget), and whether the committee met (Committee). Everything the page says about itself sits
// at the top as findings, computed from the numbers - the point being that a finance officer should never be
// the mechanism by which the squadron remembers that a deposit has not gone to wing.

type Tab = "ledger" | "budget" | "committee";

interface State {
  fiscalYear: number;
  transactions: Transaction[];
  budget: BudgetLine[];
  meetings: Meeting[];
  summary: Summary;
  findings: Finding[];
  openingSource: string | null;
}

function statusLabel(status: TxStatus, direction: Direction): string {
  if (status === "SUBMITTED") return direction === "INCOME" ? "Deposit advice in" : "Check requested";
  return status === "RECORDED" ? "Recorded" : status === "CLEARED" ? "Cleared" : "Void";
}

/** What pressing the state button does next, and nothing beyond it. */
function nextStatus(status: TxStatus, direction: Direction): { to: TxStatus; label: string } | null {
  if (status === "RECORDED") {
    return direction === "INCOME"
      ? { to: "SUBMITTED", label: "Deposit advice sent" }
      : { to: "SUBMITTED", label: "Check requested from wing" };
  }
  if (status === "SUBMITTED") {
    return direction === "INCOME"
      ? { to: "CLEARED", label: "Wing has it" }
      : { to: "CLEARED", label: "Check received" };
  }
  return null;
}

function money(cents: number): string {
  const negative = cents < 0;
  const text = "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return negative ? "-" + text : text;
}

/** Dollars typed by a person into whole cents, without letting a float near it. */
function toCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayText(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FinanceTracker({ initial, years, canEdit, people, lists }: {
  initial: State;
  years: number[];
  canEdit: boolean;
  people: Array<{ userId: string; fullName: string }>;
  lists: Array<{ id: string; name: string; spaceName: string }>;
}) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<Tab>("ledger");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [opening, setOpening] = useState("");
  const [openingSource, setOpeningSource] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();

  const [form, setForm] = useState({
    direction: "EXPENSE" as "INCOME" | "EXPENSE",
    amount: "",
    occurredOn: today(),
    category: "SUPPLIES",
    purpose: "",
    counterparty: ""
  });

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as Partial<State> & { message?: string; itemId?: string };
      if (!response.ok) throw new Error(data.message || "That could not be saved.");
      if (data.transactions && data.summary && data.findings && data.budget && data.meetings) {
        setState({
          fiscalYear: data.fiscalYear ?? state.fiscalYear,
          transactions: data.transactions,
          budget: data.budget,
          meetings: data.meetings,
          summary: data.summary,
          findings: data.findings,
          openingSource: data.openingSource ?? null
        });
      }
      setNote(data.message ?? "Saved.");
      router.refresh();
      return data;
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be saved.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function switchYear(year: number) {
    setBusy(true);
    try {
      const response = await fetch("/api/finance?fy=" + year);
      const data = (await response.json()) as State;
      if (response.ok) setState(data);
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    const amountCents = toCents(form.amount);
    if (!amountCents) return setNote("Give an amount, in dollars and cents.");
    if (form.purpose.trim().length < 3) return setNote("Say what the money was for. Somebody reading this in a year has only that line.");
    await send({
      action: "record",
      direction: form.direction,
      amountCents,
      occurredOn: form.occurredOn,
      category: form.category,
      purpose: form.purpose,
      counterparty: form.counterparty || null
    });
    setForm({ ...form, amount: "", purpose: "", counterparty: "" });
    setAdding(false);
  }

  const visible = useMemo(
    () => state.transactions.filter((entry) => showVoid || entry.status !== "VOID"),
    [state.transactions, showVoid]
  );

  const categoriesFor = (direction: "INCOME" | "EXPENSE") => CATEGORIES.filter((entry) => entry.direction === direction);
  const financeList = lists.find((list) => /finance/i.test(list.spaceName)) ?? lists[0];

  const tiles = [
    {
      label: "On hand",
      value: state.summary.balanceCents === null ? "Not known" : money(state.summary.balanceCents),
      // Never a guess. Until somebody enters what the year opened with, the Hub has only the movement since
      // 1 October, which is not a balance and must not be shown as one.
      hint: state.summary.balanceCents === null
        ? "Set what FY" + state.fiscalYear + " opened with"
        : "Opened at " + money(state.summary.openingCents ?? 0) + (state.openingSource ? " \u00b7 " + state.openingSource : "")
    },
    { label: "In", value: money(state.summary.incomeCents), hint: state.summary.pendingInCents ? money(state.summary.pendingInCents) + " not yet cleared" : "All cleared" },
    { label: "Out", value: money(state.summary.expenseCents), hint: state.summary.pendingOutCents ? money(state.summary.pendingOutCents) + " not yet cleared" : "All cleared" },
    { label: "Net this year", value: money(state.summary.netCents), hint: "Cleared only: " + money(state.summary.clearedNetCents) },
    { label: "Budgeted out", value: money(state.summary.plannedExpenseCents), hint: state.summary.plannedExpenseCents ? Math.round((state.summary.expenseCents / state.summary.plannedExpenseCents) * 100) + " per cent used" : "No budget set for this year" }
  ];

  return (
    <div className="fin">
      <style>{finCss}</style>

      <div className="fin-bar">
        <div className="fin-tabs" role="tablist">
          {([["ledger", "Ledger"], ["budget", "Budget"], ["committee", "Committee"]] as Array<[Tab, string]>).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={"fin-tab" + (tab === key ? " is-active" : "")}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="fin-year">
          <span>Fiscal year</span>
          <select value={state.fiscalYear} onChange={(event) => switchYear(Number(event.target.value))} disabled={busy}>
            {years.map((year) => <option key={year} value={year}>FY{year}</option>)}
          </select>
        </label>
      </div>

      {/* CAP's year, said once, because everybody's instinct is January. */}
      <p className="fin-faint">
        FY{state.fiscalYear} runs 1 October {state.fiscalYear - 1} to 30 September {state.fiscalYear}, which is CAP&rsquo;s fiscal year and not the calendar one.
        {state.summary.entryCount ? " " + state.summary.entryCount + " entries recorded." : " Nothing recorded yet."}
      </p>

      {note ? <p className="fin-note" role="status">{note}</p> : null}

      {state.summary.balanceCents === null && canEdit ? (
        <div className="fin-form fin-form--row">
          <label>
            <span>What FY{state.fiscalYear} opened with</span>
            <input value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="1250.00" inputMode="decimal" />
          </label>
          <label>
            <span>Where that came from</span>
            <input value={openingSource} onChange={(event) => setOpeningSource(event.target.value)} placeholder="Wing statement, 1 Oct" />
          </label>
          <button
            className="fin-btn fin-btn--primary"
            disabled={busy}
            onClick={() => {
              const cents = toCents(opening);
              if (cents === null) return setNote("Give the opening figure in dollars and cents.");
              send({ action: "opening", fiscalYear: state.fiscalYear, cents, source: openingSource || null });
            }}
          >
            Set it
          </button>
          <p className="fin-faint fin-wide">
            Taken from wing&rsquo;s QuickBooks report for the unit, not worked out here. Without it the Hub can tell you
            what moved this year but not what the unit holds, and it will not guess at a balance or claim the unit is
            overdrawn.
          </p>
        </div>
      ) : null}

      <div className="fin-tiles">
        {tiles.map((tile) => (
          <div className="fin-tile" key={tile.label}>
            <span className="fin-tile-label">{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.hint}</small>
          </div>
        ))}
      </div>

      {/* The automated half. Arithmetic on what is recorded, never an opinion about it. */}
      {state.findings.length ? (
        <section className="fin-findings">
          <h2>What the ledger says</h2>
          <p className="fin-faint">Worked out from the entries and the budget. Every one can be checked by hand.</p>
          <ul>
            {state.findings.map((finding) => (
              <li key={finding.code + finding.says} className={"fin-finding fin-finding--" + finding.severity.toLowerCase()}>
                <div>
                  <strong>{finding.says}</strong>
                  <span>{finding.because}</span>
                </div>
                {canEdit && finding.suggestedTask && financeList ? (
                  <button
                    className="fin-btn"
                    disabled={busy}
                    onClick={() => send({ action: "task", listId: financeList.id, title: finding.suggestedTask, detail: finding.says + "\n\n" + finding.because })}
                  >
                    Make a task
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : state.summary.entryCount ? (
        <p className="fin-clear">Nothing outstanding: everything recorded is inside its budget, has a receipt, and has been reconciled.</p>
      ) : null}

      {tab === "ledger" ? (
        <section className="fin-section">
          <header className="fin-section-head">
            <h2>Ledger</h2>
            <div className="fin-section-actions">
              <label className="fin-check">
                <input type="checkbox" checked={showVoid} onChange={(event) => setShowVoid(event.target.checked)} />
                Show voided
              </label>
              {canEdit ? <button className="fin-btn fin-btn--primary" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Record money"}</button> : null}
            </div>
          </header>

          {adding ? (
            <div className="fin-form">
              <div className="fin-form-row">
                <label>
                  <span>Direction</span>
                  <select
                    value={form.direction}
                    onChange={(event) => {
                      const direction = event.target.value as "INCOME" | "EXPENSE";
                      setForm({ ...form, direction, category: categoriesFor(direction)[0].code });
                    }}
                  >
                    <option value="EXPENSE">Money out</option>
                    <option value="INCOME">Money in</option>
                  </select>
                </label>
                <label>
                  <span>Amount</span>
                  <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="125.00" inputMode="decimal" />
                </label>
                <label>
                  <span>Date</span>
                  <input type="date" value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
                </label>
              </div>
              <div className="fin-form-row">
                <label>
                  <span>Category</span>
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {categoriesFor(form.direction).map((entry) => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>{form.direction === "INCOME" ? "From" : "Paid to"}</span>
                  <input value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} placeholder={form.direction === "INCOME" ? "Who it came from" : "Who was paid"} />
                </label>
              </div>
              <label className="fin-wide">
                <span>What for</span>
                <input value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="AEX rocketry kits for the January meeting" />
              </label>
              <p className="fin-faint">{CATEGORIES.find((entry) => entry.code === form.category)?.hint}</p>
              <div className="fin-form-actions">
                <button className="fin-btn" onClick={() => setAdding(false)} disabled={busy}>Cancel</button>
                <button className="fin-btn fin-btn--primary" onClick={record} disabled={busy}>Record it</button>
              </div>
            </div>
          ) : null}

          {visible.length ? (
            <ul className="fin-rows">
              {visible.map((entry) => {
                const next = nextStatus(entry.status, entry.direction);
                return (
                  <li key={entry.id} className={"fin-row" + (entry.status === "VOID" ? " is-void" : "")}>
                    <button className="fin-row-open" onClick={() => setOpen(open === entry.id ? null : entry.id)} aria-expanded={open === entry.id}>
                      <span className="fin-row-date">{dayText(entry.occurredOn)}</span>
                      <span className="fin-row-main">
                        <strong>{entry.purpose}</strong>
                        <small>{entry.categoryLabel}{entry.counterparty ? " · " + entry.counterparty : ""}</small>
                      </span>
                      <span className={"fin-row-amount" + (entry.direction === "INCOME" ? " is-in" : "")}>
                        {entry.direction === "INCOME" ? "+" : "−"}{money(entry.amountCents)}
                      </span>
                      <span className={"fin-pill fin-pill--" + entry.status.toLowerCase()}>{statusLabel(entry.status, entry.direction)}</span>
                    </button>

                    {open === entry.id ? (
                      <div className="fin-detail">
                        <dl>
                          <div><dt>Date</dt><dd>{entry.occurredOn}</dd></div>
                          <div><dt>Quarter</dt><dd>Q{entry.fiscalQuarter} FY{entry.fiscalYear}</dd></div>
                          <div><dt>Receipt</dt><dd>{entry.receiptName ?? "None attached"}</dd></div>
                          <div><dt>Approved by</dt><dd>{entry.approverName ?? "Nobody recorded"}</dd></div>
                          <div>
                            <dt>{entry.direction === "INCOME" ? "Deposit advice" : "Check request"}</dt>
                            <dd>{entry.wingReference ?? "\u2014"}</dd>
                          </div>
                          {entry.itemTitle ? <div><dt>Task</dt><dd><Link href={"/tasks?item=" + entry.itemId}>{entry.itemTitle}</Link></dd></div> : null}
                        </dl>
                        {entry.notes ? <p className="fin-faint">{entry.notes}</p> : null}
                        {canEdit && entry.status !== "VOID" ? (
                          <div className="fin-detail-actions">
                            {next ? <button className="fin-btn" disabled={busy} onClick={() => send({ action: "update", id: entry.id, status: next.to })}>{next.label}</button> : null}
                            {!entry.approvedBy ? (
                              <label className="fin-inline">
                                <span>Approved by</span>
                                <select defaultValue="" disabled={busy} onChange={(event) => event.target.value && send({ action: "update", id: entry.id, approvedBy: event.target.value })}>
                                  <option value="">Choose</option>
                                  {people.map((person) => <option key={person.userId} value={person.userId}>{person.fullName}</option>)}
                                </select>
                              </label>
                            ) : null}
                            <button
                              className="fin-btn fin-btn--danger"
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt("Voiding keeps the entry on the ledger and stops it counting. Why?");
                                if (reason && reason.trim().length > 2) send({ action: "void", id: entry.id, reason });
                              }}
                            >
                              Void
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="fin-empty">Nothing recorded for FY{state.fiscalYear}. {canEdit ? "Record the first entry and the budget comparison starts working on its own." : ""}</p>
          )}
        </section>
      ) : null}

      {tab === "budget" ? (
        <section className="fin-section">
          <header className="fin-section-head">
            <h2>Budget for FY{state.fiscalYear}</h2>
          </header>
          <p className="fin-faint">
            What the unit planned, against what has actually moved. Actuals are added up from the ledger, so this is never
            out of date and never needs a second spreadsheet. Set a line to nothing to drop it.
          </p>
          <BudgetTable
            lines={state.budget}
            canEdit={canEdit}
            busy={busy}
            fiscalYear={state.fiscalYear}
            onSet={(category, plannedCents) => send({ action: "budget", fiscalYear: state.fiscalYear, category, plannedCents })}
          />
        </section>
      ) : null}

      {tab === "committee" ? (
        <section className="fin-section">
          <header className="fin-section-head">
            <h2>Finance committee</h2>
          </header>
          <p className="fin-faint">
            Quarterly is the minimum under CAPR 173-1 para 9.c.(8), and TN-170 meets in the first month of each fiscal
            quarter. The Hub does not hold the minutes - those belong in the Drive - it holds whether a meeting happened,
            so a quarter going by with nothing recorded is something the page can tell you rather than something somebody
            has to notice.
          </p>
          {financeList ? (
            <p className="fin-faint">
              The dated obligations that go with this - CAPF 172, CAPF 171, the annual budget to the Wing Director of
              Finance - are tasks with reminders on them, in{" "}
              <Link href={"/lists/" + financeList.id}>{financeList.name}</Link>. They are deliberately not repeated here.
            </p>
          ) : null}
          <CommitteeLog
            meetings={state.meetings}
            fiscalYear={state.fiscalYear}
            canEdit={canEdit}
            busy={busy}
            onRecord={(metOn, attendees, decisions) => send({ action: "meeting", metOn, attendees, decisions })}
          />
        </section>
      ) : null}
    </div>
  );
}

function BudgetTable({ lines, canEdit, busy, fiscalYear, onSet }: {
  lines: BudgetLine[];
  canEdit: boolean;
  busy: boolean;
  fiscalYear: number;
  onSet: (category: string, plannedCents: number) => void;
}) {
  const [addCategory, setAddCategory] = useState(CATEGORIES[6].code);
  const [addAmount, setAddAmount] = useState("");
  const present = new Set(lines.map((line) => line.category));

  return (
    <>
      {(["EXPENSE", "INCOME"] as const).map((direction) => {
        const group = lines.filter((line) => line.direction === direction);
        if (!group.length) return null;
        return (
          <div className="fin-budget" key={direction}>
            <h3>{direction === "EXPENSE" ? "Money out" : "Money in"}</h3>
            <ul>
              {group.map((line) => (
                <li key={line.category}>
                  <span className="fin-budget-label">{line.categoryLabel}</span>
                  <span className="fin-bar" aria-hidden="true">
                    <i style={{ width: Math.min(100, Math.round(line.used * 100)) + "%", background: line.used > 1 && direction === "EXPENSE" ? "#d03b3b" : undefined }} />
                  </span>
                  <span className="fin-budget-nums">
                    <strong>{money(line.actualCents)}</strong>
                    <small>of {line.plannedCents ? money(line.plannedCents) : "nothing planned"}</small>
                  </span>
                  {canEdit ? (
                    <input
                      className="fin-num"
                      defaultValue={line.plannedCents ? (line.plannedCents / 100).toFixed(2) : ""}
                      placeholder="0.00"
                      inputMode="decimal"
                      disabled={busy}
                      onBlur={(event) => {
                        const cents = toCents(event.target.value || "0");
                        if (cents !== null && cents !== line.plannedCents) onSet(line.category, cents);
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {canEdit ? (
        <div className="fin-form fin-form--row">
          <label>
            <span>Add a budget line</span>
            <select value={addCategory} onChange={(event) => setAddCategory(event.target.value)}>
              {CATEGORIES.filter((entry) => !present.has(entry.code)).map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Planned</span>
            <input value={addAmount} onChange={(event) => setAddAmount(event.target.value)} placeholder="500.00" inputMode="decimal" />
          </label>
          <button
            className="fin-btn fin-btn--primary"
            disabled={busy}
            onClick={() => {
              const cents = toCents(addAmount);
              if (cents) { onSet(addCategory, cents); setAddAmount(""); }
            }}
          >
            Add to FY{fiscalYear}
          </button>
        </div>
      ) : null}
    </>
  );
}

function CommitteeLog({ meetings, fiscalYear, canEdit, busy, onRecord }: {
  meetings: Meeting[];
  fiscalYear: number;
  canEdit: boolean;
  busy: boolean;
  onRecord: (metOn: string, attendees: string, decisions: string) => void;
}) {
  const [metOn, setMetOn] = useState(today());
  const [attendees, setAttendees] = useState("");
  const [decisions, setDecisions] = useState("");
  const held = new Map(meetings.map((meeting) => [meeting.fiscalQuarter, meeting]));

  return (
    <>
      <div className="fin-quarters">
        {[1, 2, 3, 4].map((quarter) => {
          const meeting = held.get(quarter);
          return (
            <div className={"fin-quarter" + (meeting ? " is-held" : "")} key={quarter}>
              <span className="fin-tile-label">Q{quarter}</span>
              <strong>{meeting ? dayText(meeting.metOn) : "Not recorded"}</strong>
              {meeting?.decisions ? <small>{meeting.decisions}</small> : null}
            </div>
          );
        })}
      </div>

      {canEdit ? (
        <div className="fin-form">
          <div className="fin-form-row">
            <label>
              <span>Met on</span>
              <input type="date" value={metOn} onChange={(event) => setMetOn(event.target.value)} />
            </label>
            <label>
              <span>Who was there</span>
              <input value={attendees} onChange={(event) => setAttendees(event.target.value)} placeholder="Commander, finance officer, one member" />
            </label>
          </div>
          <label className="fin-wide">
            <span>What was decided</span>
            <input value={decisions} onChange={(event) => setDecisions(event.target.value)} placeholder="Approved the FY budget; agreed the fundraiser target" />
          </label>
          <div className="fin-form-actions">
            <button className="fin-btn fin-btn--primary" disabled={busy} onClick={() => onRecord(metOn, attendees, decisions)}>Record the meeting</button>
          </div>
        </div>
      ) : null}

      {meetings.length ? null : <p className="fin-empty">No meetings recorded against FY{fiscalYear} yet.</p>}
    </>
  );
}

const finCss = [
  ".fin{display:flex;flex-direction:column;gap:16px;min-width:0;max-width:100%}",
  ".fin-bar{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}",
  ".fin-tabs{display:flex;gap:4px;flex-wrap:wrap}",
  ".fin-tab{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13px;font-weight:600;padding:6px 13px;border-radius:8px;cursor:pointer}",
  ".fin-tab.is-active{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".fin-year{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600}",
  ".fin-year select,.fin-form select,.fin-form input,.fin-num{font:inherit;font-size:13.5px;padding:6px 9px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-height:34px;min-width:0}",
  ".fin-tiles{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))}",
  ".fin-tile,.fin-quarter{border:1px solid var(--border,#e4e6eb);border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:2px;min-width:0}",
  "html[data-theme=dark] .fin-tile,html[data-theme=dark] .fin-quarter,html[data-theme=dark] .fin-form,html[data-theme=dark] .fin-row{background:#222326;border-color:#34363b}",
  ".fin-tile strong{font-size:19px;font-variant-numeric:tabular-nums}",
  ".fin-tile-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.55}",
  ".fin-tile small,.fin-quarter small{font-size:11.5px;opacity:.6}",
  ".fin-findings{border:1px solid var(--border,#e4e6eb);border-radius:10px;padding:13px}",
  ".fin-findings h2{margin:0;font-size:15px}",
  ".fin-findings ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".fin-finding{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:9px 11px;border-radius:8px;border-left:3px solid #7b68ee;background:rgba(123,104,238,.08);flex-wrap:wrap}",
  ".fin-finding--attention{border-left-color:#d03b3b;background:rgba(208,59,59,.08)}",
  ".fin-finding--watch{border-left-color:#d9932b;background:rgba(217,147,43,.08)}",
  ".fin-finding div{display:flex;flex-direction:column;gap:2px;flex:1 1 240px;min-width:0}",
  ".fin-finding strong{font-size:13.5px}.fin-finding span{font-size:12.5px;opacity:.75}",
  ".fin-clear{margin:0;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(46,160,96,.1)}",
  ".fin-note{margin:0;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(123,104,238,.12)}",
  ".fin-section{display:flex;flex-direction:column;gap:11px;min-width:0}",
  ".fin-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}",
  ".fin-section-head h2{margin:0;font-size:16px}",
  ".fin-section-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
  ".fin-check{display:flex;align-items:center;gap:6px;font-size:12.5px}",
  ".fin-btn{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer;white-space:nowrap}",
  ".fin-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".fin-btn--danger{color:#d03b3b}.fin-btn--danger:hover{border-color:#d03b3b}",
  ".fin-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".fin-row{border:1px solid var(--border,#e4e6eb);border-radius:9px;min-width:0}",
  ".fin-row.is-void{opacity:.5}",
  ".fin-row-open{display:grid;grid-template-columns:58px minmax(0,1fr) auto auto;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;padding:9px 11px;cursor:pointer}",
  ".fin-row-date{font-size:11.5px;opacity:.6;white-space:nowrap}",
  ".fin-row-main{display:flex;flex-direction:column;gap:1px;min-width:0}",
  ".fin-row-main strong{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".fin-row-main small{font-size:11.5px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".fin-row-amount{font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}",
  ".fin-row-amount.is-in{color:#2ea060}",
  ".fin-pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(127,127,127,.15);white-space:nowrap}",
  ".fin-pill--submitted{background:rgba(217,147,43,.18)}",
  ".fin-pill--cleared{background:rgba(46,160,96,.18)}",
  ".fin-detail{padding:0 11px 11px;display:flex;flex-direction:column;gap:9px}",
  ".fin-detail dl{display:grid;gap:7px;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));margin:0}",
  ".fin-detail dt{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;opacity:.5}",
  ".fin-detail dd{margin:1px 0 0;font-size:12.5px}",
  ".fin-detail-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
  ".fin-inline{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}",
  ".fin-form{display:flex;flex-direction:column;gap:9px;padding:12px;border:1px solid var(--border,#e4e6eb);border-radius:10px;min-width:0}",
  ".fin-form--row{flex-direction:row;flex-wrap:wrap;align-items:flex-end}",
  ".fin-form-row{display:flex;gap:10px;flex-wrap:wrap}",
  ".fin-form label,.fin-form-row label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;flex:1 1 150px;min-width:0}",
  ".fin-wide{width:100%}",
  ".fin-form-actions{display:flex;gap:8px;justify-content:flex-end}",
  ".fin-budget h3{margin:0 0 7px;font-size:13.5px}",
  ".fin-budget ul{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:7px}",
  ".fin-budget li{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,1fr) auto auto;gap:10px;align-items:center}",
  ".fin-budget-label{font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis}",
  ".fin-bar{height:6px;border-radius:999px;background:rgba(123,104,238,.16);overflow:hidden}",
  ".fin-bar i{display:block;height:100%;background:#7b68ee;border-radius:999px}",
  ".fin-budget-nums{display:flex;flex-direction:column;text-align:right;white-space:nowrap}",
  ".fin-budget-nums strong{font-size:13px;font-variant-numeric:tabular-nums}",
  ".fin-budget-nums small{font-size:11px;opacity:.6}",
  ".fin-num{width:92px}",
  ".fin-quarters{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))}",
  ".fin-quarter.is-held{border-color:rgba(46,160,96,.5)}",
  ".fin-empty{margin:0;padding:14px;border:1px dashed var(--border,#d5d8de);border-radius:10px;font-size:13px}",
  ".fin-faint{margin:0;font-size:12.5px;opacity:.7;line-height:1.5}",
  "@media (max-width:640px){",
  ".fin-row-open{grid-template-columns:minmax(0,1fr) auto;row-gap:4px}",
  ".fin-row-date{grid-column:1;font-size:11px}",
  ".fin-row-main{grid-column:1;grid-row:2}",
  ".fin-row-amount{grid-column:2;grid-row:2;text-align:right}",
  ".fin-pill{grid-column:2;grid-row:1;justify-self:end}",
  ".fin-budget li{grid-template-columns:minmax(0,1fr) auto;row-gap:5px}",
  ".fin-bar{grid-column:1/-1;grid-row:2}",
  ".fin-num{grid-column:2;grid-row:1;width:84px}",
  "}"
].join("");
