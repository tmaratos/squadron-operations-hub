/**
 * Task lists and the task panel, in the October 2026 look.
 *
 * Loaded after the list's own styles (lwCss, tpCss) and the older shell layer, and written against the same
 * class names, so every view, editor, drag target and shortcut keeps working - only how it looks changes.
 * The old purple accent becomes the Hub's blue; colours come from the shell's tokens so light and dark both
 * follow; everything a finger has to hit is at least 40px tall.
 */
export const listDesignCss = String.raw`
/* The list as one card on the page. */
.cu-shell.hub-v3 .lw { margin: 0; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); overflow: visible; --lw-border: var(--border-soft); --lw-muted: var(--muted); --lw-hover: var(--surface-alt); --lw-bg: var(--surface); }
.cu-shell.hub-v3 .lw-head { display: flex; align-items: center; gap: 14px; padding: 20px 22px 14px; background: none; border-radius: 18px 18px 0 0; }
.cu-shell.hub-v3 .lw-space-badge { width: 44px; height: 44px; border-radius: 12px; font-size: 18px; background: linear-gradient(145deg, #2f6df0, #1a47b8); color: #fff; }
.cu-shell.hub-v3 .lw-head-text { display: grid; gap: 3px; min-width: 0; flex: 1; }
.cu-shell.hub-v3 .lw-head h1 { margin: 0; font-size: clamp(20px, 2.2vw, 26px); font-weight: 800; letter-spacing: -.02em; color: var(--text); overflow-wrap: anywhere; }
.cu-shell.hub-v3 .lw-head-count { font-size: 14px; color: var(--muted); }
.cu-shell.hub-v3 .lw-head-add { flex: none; }

/* Views as tabs. */
.cu-shell.hub-v3 .lw-views { gap: 4px; padding: 0 16px; min-height: 0; background: none; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.cu-shell.hub-v3 .lw-views > button { min-height: 44px; padding: 0 14px; border-radius: 0; border-bottom: 3px solid transparent; color: var(--muted-strong); font-size: 14px; font-weight: 600; white-space: nowrap; background: none; }
.cu-shell.hub-v3 .lw-views > button:hover { color: var(--text); background: none; }
.cu-shell.hub-v3 .lw-views > button.is-active { color: var(--accent); border-bottom-color: #2563eb; background: none; font-weight: 700; }
.cu-shell.hub-v3 .lw-view-plus { min-height: 36px; margin: 4px 0; padding: 0 12px; border-radius: 9px; border: 1px dashed var(--border); background: none; color: var(--muted-strong); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.cu-shell.hub-v3 .lw-view-plus:hover { border-color: #2563eb; color: var(--accent); }
.cu-shell.hub-v3 .lw-view-default { color: #2563eb; }
.cu-shell.hub-v3 .lw-view-new { border-radius: 14px; border: 1px solid var(--border); background: var(--surface); box-shadow: 0 16px 40px rgba(9, 20, 44, .18); padding: 12px; gap: 8px; }
.cu-shell.hub-v3 .lw-why { padding: 12px 22px; font-size: 13.5px; background: var(--cu-active); color: var(--text); border-bottom: 1px solid var(--border-soft); }
.cu-shell.hub-v3 .lw-why button { color: var(--accent); font-size: 13.5px; }

/* Toolbar: what to show on the left, search and Customize on the right. */
.cu-shell.hub-v3 .lw-toolbar { display: flex; gap: 12px; padding: 12px 16px; background: none; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.cu-shell.hub-v3 .lw-chips, .cu-shell.hub-v3 .lw-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.cu-shell.hub-v3 .lw-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text-soft); font-size: 13.5px; font-weight: 600; }
.cu-shell.hub-v3 .lw-chip:hover { border-color: #b9cdf3; }
.cu-shell.hub-v3 .lw-chip--on { background: var(--cu-active); border-color: #2563eb; color: var(--accent); }
.cu-shell.hub-v3 .lw-chip--select { color: var(--muted); font-weight: 600; }
.cu-shell.hub-v3 .lw-chip--select select { min-height: 0; padding: 0 2px; border: 0; background: none; color: var(--text); font-size: 13.5px; font-weight: 650; cursor: pointer; }
.cu-shell.hub-v3 .lw-chip--select select:focus { outline: none; }
.cu-shell.hub-v3 .lw-searchbox { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--muted); }
.cu-shell.hub-v3 .lw-searchbox:focus-within { border-color: #2563eb; outline: 3px solid rgba(37, 99, 235, .18); }
.cu-shell.hub-v3 .lw-searchbox .lw-search { width: 180px; height: auto; min-height: 0; padding: 0; border: 0; background: none; outline: none; font-size: 14px; color: var(--text); }
.cu-shell.hub-v3 .lw-primary { min-height: 42px; padding: 0 18px; border-radius: 10px; background: #2563eb; color: #fff; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(37, 99, 235, .22); }
.cu-shell.hub-v3 .lw-primary:hover { background: #1d4ed8; }
.cu-shell.hub-v3 .lw-ghost { min-height: 40px; padding: 0 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 650; }
.cu-shell.hub-v3 .lw-ghost:hover { border-color: #b9cdf3; background: var(--surface-alt); }
.cu-shell.hub-v3 .lw-ghost--danger { color: #c2273d; }
.lw-customize { position: relative; }
.lw-customize-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 60; width: 290px; padding: 6px; display: grid; gap: 2px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: 0 16px 40px rgba(9, 20, 44, .2); }
.lw-customize-menu button { display: grid; gap: 2px; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.lw-customize-menu button:hover { background: var(--surface-alt); }
.lw-customize-menu strong { font-size: 14px; }
.lw-customize-menu small { font-size: 12.5px; color: var(--muted); line-height: 1.4; }

/* Selected tasks. */
.cu-shell.hub-v3 .lw-bulk { margin: 12px 16px 0; padding: 12px 16px; border-radius: 14px; background: #2563eb; box-shadow: 0 8px 20px rgba(37, 99, 235, .25); }
.cu-shell.hub-v3 .lw-bulk select { min-height: 40px; border-radius: 9px; font-size: 14px; color: #0f1b33; background: #fff; }
.cu-shell.hub-v3 .lw-bulk-delete, .cu-shell.hub-v3 .lw-bulk-clear { min-height: 40px; border-radius: 9px; font-size: 14px; }
.cu-shell.hub-v3 .lw-pick { width: 20px; height: 20px; accent-color: #2563eb; }

/* Sections and rows. */
.cu-shell.hub-v3 .lw-groups { gap: 22px; padding: 18px 16px 28px; }
.cu-shell.hub-v3 .lw-group-head { gap: 10px; margin-bottom: 8px; }
.cu-shell.hub-v3 .lw-pill { padding: 5px 11px 5px 8px; border-radius: 8px; font-size: 12px; letter-spacing: .04em; }
.cu-shell.hub-v3 .lw-n { font-size: 13px; font-weight: 650; color: var(--muted); }
.cu-shell.hub-v3 .lw-row { min-height: 50px; border-bottom: 1px solid var(--border-soft); }
.cu-shell.hub-v3 .lw-row:hover { background: var(--surface-alt); }
.cu-shell.hub-v3 .lw-row:hover .lw-title { color: var(--accent); }
.cu-shell.hub-v3 .lw-title { font-size: 14.5px; font-weight: 600; color: var(--text); }
.cu-shell.hub-v3 .lw-complete { width: 32px; height: 32px; }
.cu-shell.hub-v3 .lw-sicon { width: 18px; height: 18px; }
.cu-shell.hub-v3 .lw-cell { font-size: 13px; }
.cu-shell.hub-v3 .lw-late { color: #c2273d; font-weight: 650; }
.cu-shell.hub-v3 .lw-today { color: #b45309; font-weight: 650; }
html[data-theme=dark] .cu-shell.hub-v3 .lw-late { color: #ff8a96; }
html[data-theme=dark] .cu-shell.hub-v3 .lw-today { color: #ffc067; }
.cu-shell.hub-v3 .lw-avatar { width: 28px; height: 28px; font-size: 10.5px; background: linear-gradient(145deg, #2f6df0, #1a47b8); border-color: var(--surface); }
.cu-shell.hub-v3 .lw-inline:hover:not(:disabled) { background: var(--cu-active); }
.cu-shell.hub-v3 .lw-add { min-height: 44px; font-size: 14px; font-weight: 600; color: var(--muted-strong); border-radius: 0 0 10px 10px; }
.cu-shell.hub-v3 .lw-add:hover { color: var(--accent); background: var(--surface-alt); }
.cu-shell.hub-v3 .lw-addform input { height: auto; min-height: 42px; }
.cu-shell.hub-v3 .lw-group--over { outline: 2px dashed #2563eb; outline-offset: 4px; border-radius: 10px; }

/* Board. */
.cu-shell.hub-v3 .lw-board { gap: 14px; padding: 18px 16px 28px; }
.cu-shell.hub-v3 .lw-column { flex-basis: 290px; padding: 10px; border-radius: 14px; background: var(--surface-alt); border: 1px solid var(--border-soft); }
.cu-shell.hub-v3 .lw-card { padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); box-shadow: 0 1px 2px rgba(15, 27, 51, .05); font-size: 14px; }
.cu-shell.hub-v3 .lw-card:hover { border-color: #2563eb; }
.cu-shell.hub-v3 .lw-card strong { font-weight: 650; color: var(--text); }

/* Table. */
.cu-shell.hub-v3 .lw-table-wrap { padding: 0 0 12px; }
.cu-shell.hub-v3 .lw-table { font-size: 14px; }
.cu-shell.hub-v3 .lw-table th { padding: 11px 10px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); background: var(--surface-alt); }
.cu-shell.hub-v3 .lw-table td { padding: 8px 10px; }
.cu-shell.hub-v3 .lw-table tr:hover td { background: var(--surface-alt); }

/* Calendar. */
.cu-shell.hub-v3 .lw-cal { padding: 16px; }
.cu-shell.hub-v3 .lw-cal-grid { border-color: var(--border); border-radius: 12px; overflow: hidden; }
.cu-shell.hub-v3 .lw-cal-day { min-height: 112px; padding: 6px; border-color: var(--border-soft); }
.cu-shell.hub-v3 .lw-cal-day.is-today .lw-cal-date { background: #2563eb; color: #fff; }
.cu-shell.hub-v3 .lw-cal-item { padding: 4px 7px; border-radius: 6px; font-size: 12px; background: var(--surface-alt); }
.cu-shell.hub-v3 .lw-cal-item:hover { color: var(--accent); }

/* Editors and menus. */
.cu-shell.hub-v3 .lw-overlay { background: rgba(8, 17, 34, .45); }
.cu-shell.hub-v3 .lw-modal { border-radius: 18px; border-color: var(--border); background: var(--surface); padding: 20px 22px; box-shadow: 0 24px 60px rgba(5, 15, 35, .35); }
.cu-shell.hub-v3 .lw-panel-top strong { font-size: 17px; }
.cu-shell.hub-v3 .lw-close { width: 40px; height: 40px; border-radius: 10px; }
.cu-shell.hub-v3 .lw-rowmenu, .cu-shell.hub-v3 .lw-pop { border-radius: 14px; border-color: var(--border); background: var(--surface); box-shadow: 0 16px 40px rgba(9, 20, 44, .2); }
.cu-shell.hub-v3 .lw-rowmenu-item, .cu-shell.hub-v3 .lw-pop-item { min-height: 40px; border-radius: 9px; font-size: 14px; }
.cu-shell.hub-v3 .lw-rowmenu-item:hover, .cu-shell.hub-v3 .lw-pop-item:hover { background: var(--surface-alt); }
.cu-shell.hub-v3 .lw-toast { border-radius: 14px; background: #0f1b33; color: #fff; padding: 12px 14px 12px 18px; font-size: 14px; box-shadow: 0 14px 34px rgba(5, 15, 35, .35); }
.cu-shell.hub-v3 .lw-toast-undo { min-height: 38px; padding: 0 16px; border-radius: 9px; background: #2563eb; color: #fff; font-weight: 700; }
.cu-shell.hub-v3 .lw-error { margin: 12px 16px 0; padding: 12px 16px; border-radius: 12px; background: #fdecee; color: #b4232f; font-size: 14px; }
html[data-theme=dark] .cu-shell.hub-v3 .lw-error { background: rgba(220, 53, 69, .18); color: #ff9aa4; }

/* The task panel. */
.cu-shell.hub-v3 .tp { --tp-bg: var(--surface); --tp-side: var(--surface-alt); --tp-border: var(--border); --tp-muted: var(--muted); --tp-hover: var(--surface-high); color: var(--text); }
.cu-shell.hub-v3 .tp-top { min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
.cu-shell.hub-v3 .tp-icon { width: 40px; height: 40px; border-radius: 10px; }
.cu-shell.hub-v3 .tp-watch { min-height: 40px; border-radius: 10px; font-size: 13.5px; font-weight: 650; }
.cu-shell.hub-v3 .tp-title { font-size: clamp(21px, 2vw, 27px); font-weight: 800; letter-spacing: -.02em; }
.cu-shell.hub-v3 .tp-done { width: 40px; height: 40px; border-radius: 50%; background: #16a34a; color: #fff; font-size: 18px; }
.cu-shell.hub-v3 .tp-h { font-size: 15px; font-weight: 750; color: var(--text); }
.cu-shell.hub-v3 .tp-prop { border-radius: 12px; background: var(--surface-alt); border-color: var(--border-soft); }
.cu-shell.hub-v3 .tp-label { font-size: 12.5px; font-weight: 700; color: var(--muted-strong); }
.cu-shell.hub-v3 .tp-desc { min-height: 110px; border-radius: 12px; font-size: 15px; line-height: 1.6; }
.cu-shell.hub-v3 .tp-desc:focus { border-color: #2563eb; }
.cu-shell.hub-v3 .tp-progress span { background: #16a34a; }
.cu-shell.hub-v3 .tp-sub { min-height: 48px; }
.cu-shell.hub-v3 .tp-side { background: var(--surface-alt); }
.cu-shell.hub-v3 .tp-comment-card { border-radius: 12px; border-color: var(--border-soft); }
.cu-shell.hub-v3 .tp-ai { border-radius: 14px; background: var(--cu-active); border-color: transparent; }

@media (max-width: 900px) {
  .cu-shell.hub-v3 .lw { border-radius: 16px; }
  .cu-shell.hub-v3 .lw-head { padding: 16px; flex-wrap: wrap; }
  .cu-shell.hub-v3 .lw-space-badge { width: 38px; height: 38px; font-size: 16px; }
  .cu-shell.hub-v3 .lw-head-add { flex: 1 1 100%; min-height: 48px; font-size: 15px; }
  .cu-shell.hub-v3 .lw-views { padding: 0 8px; }
  .cu-shell.hub-v3 .lw-toolbar { padding: 10px; }
  .cu-shell.hub-v3 .lw-chips, .cu-shell.hub-v3 .lw-tools { flex: 1 1 100%; }
  .cu-shell.hub-v3 .lw-searchbox { flex: 1 1 auto; min-height: 46px; }
  .cu-shell.hub-v3 .lw-searchbox .lw-search { width: 100%; font-size: 16px; }
  .cu-shell.hub-v3 .lw-chip, .cu-shell.hub-v3 .lw-ghost { min-height: 44px; }
  .lw-customize-menu { position: fixed; top: auto; left: 8px; right: 8px; bottom: calc(84px + env(safe-area-inset-bottom)); width: auto; }
  .cu-shell.hub-v3 .lw-groups, .cu-shell.hub-v3 .lw-board { padding: 14px 10px 24px; }
  .cu-shell.hub-v3 .lw-row { min-height: 60px; }
  .cu-shell.hub-v3 .lw-column { flex-basis: 84vw; }
}
`;
