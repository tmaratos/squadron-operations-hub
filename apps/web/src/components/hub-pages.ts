/**
 * TN-170 Operations Hub - the shared parts every page is built from.
 *
 * Page headers, cards, number tiles, buttons, status tags, form fields, tables and empty states, in the
 * October 2026 look. Most pages already use these class names (PageHeader, SectionCard, MetricCard,
 * StatusPill, .button), so styling them here gives every page the same look, in light and dark, without
 * touching what any page does. Page-specific layers can still refine a page after this.
 *
 * Several older layers drew these parts for a dark background with pale text; that is what made light mode
 * unreadable in places. Everything here takes its colours from the shell's tokens, so both themes follow.
 */
export const hubPagesCss = String.raw`
/* Page frame */
.cu-shell.hub-v3 .page-stack { display: grid; gap: 20px; max-width: 1500px; margin: 0 auto; min-width: 0; }
.cu-shell.hub-v3 .page-header {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; flex-wrap: wrap;
  padding: 2px 0 4px;
}
.cu-shell.hub-v3 .page-header h1 { margin: 0; font-size: clamp(24px, 2.6vw, 32px); font-weight: 800; letter-spacing: -.03em; line-height: 1.15; color: var(--text); }
.cu-shell.hub-v3 .page-header__eyebrow {
  display: inline-block; margin: 0 0 9px; padding: 4px 10px; border-radius: 999px;
  background: var(--cu-active); color: var(--accent); font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase;
}
.cu-shell.hub-v3 .page-header > div > p:last-child { max-width: 760px; margin: 8px 0 0; color: var(--muted); font-size: 15px; line-height: 1.55; }
.cu-shell.hub-v3 .page-header__actions { display: flex; gap: 10px; flex-wrap: wrap; }

/* Buttons: one size, one shape, three weights. */
.cu-shell.hub-v3 .button {
  min-height: 42px; padding: 0 16px; gap: 8px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 14px; font-weight: 650; box-shadow: none; transform: none;
}
.cu-shell.hub-v3 .button:hover { border-color: #b9cdf3; background: var(--surface-alt); transform: none; }
.cu-shell.hub-v3 .button--primary { background: #2563eb; border-color: #2563eb; color: #fff; box-shadow: 0 4px 12px rgba(37, 99, 235, .22); }
.cu-shell.hub-v3 .button--primary:hover { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.cu-shell.hub-v3 .button--secondary { background: var(--surface); }
.cu-shell.hub-v3 .button--ghost { min-height: 38px; background: transparent; border-color: transparent; color: var(--muted-strong); }
.cu-shell.hub-v3 .button--ghost:hover { background: var(--surface-high); color: var(--text); }
.cu-shell.hub-v3 .button:disabled, .cu-shell.hub-v3 .button[aria-disabled=true] { opacity: .55; cursor: not-allowed; }

/* Cards */
.cu-shell.hub-v3 .section-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden;
}
.cu-shell.hub-v3 .section-card__header { min-height: 0; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-soft); align-items: center; }
.cu-shell.hub-v3 .section-card__header h2 { margin: 0; font-size: 17px; font-weight: 750; letter-spacing: -.01em; color: var(--text); }
.cu-shell.hub-v3 .section-card__header p { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
.cu-shell.hub-v3 .section-card__body { padding: 16px 20px 20px; }

/* Number tiles */
.cu-shell.hub-v3 .metric-grid { gap: 16px; }
.cu-shell.hub-v3 .metric-card {
  min-height: 0; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow);
}
.cu-shell.hub-v3 .metric-card__value { margin-bottom: 6px; font-size: 30px; line-height: 1; font-weight: 800; letter-spacing: -.04em; color: var(--info); }
.cu-shell.hub-v3 .metric-card__label { font-size: 14px; font-weight: 650; color: var(--text-soft); }
.cu-shell.hub-v3 .metric-card__detail { margin-top: 4px; font-size: 12.5px; color: var(--muted); }
.cu-shell.hub-v3 .metric-card__track { height: 6px; margin-top: 14px; background: var(--surface-high); }

/* Status tags: tinted background, dark text, readable size. */
.cu-shell.hub-v3 .status-pill { padding: 4px 10px; border: 0; border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: .01em; }
.cu-shell.hub-v3 .status-pill--danger { color: #b4232f; background: #fdecee; }
.cu-shell.hub-v3 .status-pill--warning { color: #92400e; background: #fdf0d9; }
.cu-shell.hub-v3 .status-pill--success { color: #166534; background: #e3f4ea; }
.cu-shell.hub-v3 .status-pill--info { color: #1d4ed8; background: #e6efff; }
.cu-shell.hub-v3 .status-pill--neutral { color: #475569; background: #eef1f5; }
html[data-theme=dark] .cu-shell.hub-v3 .status-pill--danger { color: #ff9aa4; background: rgba(220, 53, 69, .18); }
html[data-theme=dark] .cu-shell.hub-v3 .status-pill--warning { color: #ffcf7a; background: rgba(217, 119, 6, .2); }
html[data-theme=dark] .cu-shell.hub-v3 .status-pill--success { color: #7fe0a3; background: rgba(22, 163, 74, .2); }
html[data-theme=dark] .cu-shell.hub-v3 .status-pill--info { color: #9cc0ff; background: rgba(37, 99, 235, .24); }
html[data-theme=dark] .cu-shell.hub-v3 .status-pill--neutral { color: #c3cedd; background: rgba(148, 163, 184, .16); }

/* Empty states say something, at a size people can read. */
.cu-shell.hub-v3 .empty-state { min-height: 160px; gap: 8px; padding: 24px; color: var(--muted); }
.cu-shell.hub-v3 .empty-state strong { font-size: 15px; color: var(--text-soft); }
.cu-shell.hub-v3 .empty-state span { font-size: 13px; }

/* Form fields across every page: tall enough to hit, with a visible edge and focus. Element-level
   specificity, so a component that styles its own compact fields (list rows, inline editors) still wins. */
:where(.cu-shell.hub-v3 .cu-main) :is(input, select, textarea):where(:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file])) {
  min-height: 42px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface); color: var(--text); font-size: 14px; color-scheme: light;
}
html[data-theme=dark] :where(.cu-shell.hub-v3 .cu-main) :is(input, select, textarea) { color-scheme: dark; }
:where(.cu-shell.hub-v3 .cu-main) textarea { line-height: 1.55; }
:where(.cu-shell.hub-v3 .cu-main) :is(input, select, textarea)::placeholder { color: var(--muted); opacity: .85; }
:where(.cu-shell.hub-v3 .cu-main) :is(input, select, textarea):focus { outline: 3px solid rgba(37, 99, 235, .22); outline-offset: 0; border-color: #2563eb; }
:where(.cu-shell.hub-v3 .cu-main) label { color: var(--text-soft); }
:where(.cu-shell.hub-v3 .cu-main) input:where([type=checkbox], [type=radio]) { accent-color: #2563eb; width: 18px; height: 18px; }

/* Plain tables read as tables. */
:where(.cu-shell.hub-v3 .cu-main) table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
:where(.cu-shell.hub-v3 .cu-main) th {
  padding: 11px 14px; text-align: left; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: var(--muted); background: var(--surface-alt); border-bottom: 1px solid var(--border);
}
:where(.cu-shell.hub-v3 .cu-main) td { padding: 12px 14px; border-bottom: 1px solid var(--border-soft); color: var(--text); }
:where(.cu-shell.hub-v3 .cu-main) tbody tr:hover td { background: var(--surface-alt); }

/* Notes that a page is showing sample data stay unmistakable. */
.cu-shell.hub-v3 .demo-disclosure { border-radius: 14px; }

@media (max-width: 900px) {
  .cu-shell.hub-v3 .page-stack { gap: 14px; }
  .cu-shell.hub-v3 .page-header { align-items: flex-start; }
  .cu-shell.hub-v3 .page-header > div > p:last-child { font-size: 14px; }
  .cu-shell.hub-v3 .page-header__actions { width: 100%; }
  .cu-shell.hub-v3 .page-header__actions > * { flex: 1 1 auto; }
  .cu-shell.hub-v3 .button { min-height: 46px; font-size: 15px; }
  .cu-shell.hub-v3 .section-card__header { padding: 16px 16px 12px; }
  .cu-shell.hub-v3 .section-card__body { padding: 14px 16px 16px; }
  .cu-shell.hub-v3 .metric-grid--four, .cu-shell.hub-v3 .metric-grid--dashboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cu-shell.hub-v3 .metric-card { padding: 16px; }
  :where(.cu-shell.hub-v3 .cu-main) :is(input, select, textarea):where(:not([type=checkbox]):not([type=radio])) { min-height: 46px; font-size: 16px; }
}
`;
