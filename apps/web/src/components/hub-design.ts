/**
 * TN-170 Operations Hub - the October 2026 look.
 *
 * A navy sidebar down the whole left edge, a white bar across the top with search, New, notifications and
 * who is signed in, and pages on a pale field. Loaded after the older shell layers so it wins, and written
 * against the same class names, so every action those pages already have keeps working untouched.
 *
 * No Air Force insignia or third-party institutional logos are used here; the mark is the Hub's own.
 */
export const hubDesignCss = String.raw`
.cu-shell.hub-v3 {
  --cu-bg: #f3f5f9; --cu-side: #0b1a33; --cu-top: #ffffff;
  --cu-border: #e3e8f0; --cu-text: #0f1b33; --cu-muted: #5b6b84;
  --cu-hover: #eef3fc; --cu-active: #e6efff; --cu-accent: #2563eb;
  --background: #f3f5f9; --background-soft: #eef2f8;
  --surface: #ffffff; --surface-alt: #f7f9fc; --surface-high: #eef3fb;
  --border: #e3e8f0; --border-soft: #e9edf4;
  --text: #0f1b33; --text-soft: #24344f;
  --muted: #5b6b84; --muted-strong: #44546d;
  --accent: #2563eb; --accent-strong: #1d4ed8;
  --shadow: 0 1px 2px rgba(15, 27, 51, .04), 0 6px 20px rgba(15, 27, 51, .05);
  --hub-navy: #0b1a33; --hub-navy-2: #0f2244;
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  grid-template-rows: 70px minmax(0, 1fr);
  grid-template-areas: "side top" "side main";
  height: 100vh; height: 100dvh;
  background: var(--cu-bg);
}
html[data-theme=dark] .cu-shell.hub-v3 {
  --cu-bg: #0a1322; --cu-top: #0f1a2e; --cu-border: #22324d;
  --cu-text: #e8eef8; --cu-muted: #9fb0c9; --cu-hover: #17263f; --cu-active: #1b335a; --cu-accent: #7aa7ff;
  --background: #0a1322; --background-soft: #0f1a2e;
  --surface: #111d33; --surface-alt: #15233c; --surface-high: #1a2b48;
  --border: #22324d; --border-soft: #1e2d46;
  --text: #e8eef8; --text-soft: #cfdaeb; --muted: #9fb0c9; --muted-strong: #b8c6da;
  --accent: #7aa7ff; --accent-strong: #9cbcff;
  --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px rgba(0, 0, 0, .18);
  --hub-navy: #071122; --hub-navy-2: #0a1830;
}
.cu-shell.hub-v3 .cu-rail { display: none; }

/* The sidebar: navy, full height, its own colours for everything inside it. */
.cu-shell.hub-v3 .cu-sidebar {
  grid-area: side; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background: linear-gradient(180deg, var(--hub-navy-2) 0%, var(--hub-navy) 100%);
  border-right: 0; color: #dbe4f3;
  --cu-text: #dbe4f3; --cu-muted: #8fa1bf; --cu-hover: rgba(255, 255, 255, .07);
  --cu-active: rgba(37, 99, 235, .38); --cu-accent: #a9c6ff; --cu-border: rgba(255, 255, 255, .09);
  --cu-side: #0b1a33; --cu-bg: #12264a;
}
.hub-logo { display: flex; align-items: center; gap: 8px; padding: 20px 16px 18px 18px; }
.hub-logo-link { display: flex; align-items: center; gap: 12px; color: #fff; text-decoration: none; min-width: 0; flex: 1; }
.hub-mark {
  flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center;
  color: #fff; background: linear-gradient(145deg, #2f6df0, #1a47b8);
  box-shadow: 0 6px 16px rgba(17, 60, 160, .35), inset 0 1px 0 rgba(255, 255, 255, .18);
}
.hub-logo-text { display: grid; gap: 1px; min-width: 0; line-height: 1.15; }
.hub-logo-text strong { color: #fff; font-size: 19px; font-weight: 800; letter-spacing: -.01em; }
.hub-logo-text span { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #c3d2ec; }
.hub-logo-text small { font-size: 11px; color: #8fa1bf; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hub-nav-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; display: grid; align-content: start; gap: 2px;
  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .15) transparent; }
.hub-nav-foot { padding: 10px 12px 16px; border-top: 1px solid rgba(255, 255, 255, .08); display: grid; gap: 2px; max-height: 45vh; overflow-y: auto; }
.hub-nav {
  display: flex; align-items: center; gap: 13px; width: 100%; min-height: 44px; padding: 10px 14px;
  border: 0; border-radius: 10px; background: none; color: #c9d4e8; font: inherit; font-size: 14.5px;
  font-weight: 560; text-align: left; text-decoration: none; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.hub-nav svg { flex: none; color: #9fb3d6; }
.hub-nav > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-nav:hover { background: rgba(255, 255, 255, .07); color: #fff; }
.hub-nav:hover svg { color: #fff; }
.hub-nav.is-active { background: #2563eb; color: #fff; box-shadow: 0 6px 18px rgba(37, 99, 235, .35); }
.hub-nav.is-active svg, .hub-nav.is-within, .hub-nav.is-within svg { color: #fff; }
.hub-nav-row { display: flex; align-items: center; border-radius: 10px; transition: background .15s ease; }
.hub-nav-row > .hub-nav { flex: 1; min-width: 0; background: none; box-shadow: none; }
.hub-nav-row:hover { background: rgba(255, 255, 255, .07); }
.hub-nav-row.is-active { background: #2563eb; box-shadow: 0 6px 18px rgba(37, 99, 235, .35); }
.hub-nav-row.is-active > .hub-nav, .hub-nav-row.is-active svg, .hub-nav-row.is-within > .hub-nav, .hub-nav-row.is-within svg { color: #fff; }
.hub-nav-toggle { flex: none; width: 40px; height: 40px; margin-right: 2px; display: grid; place-items: center; border: 0; border-radius: 9px; background: none; color: #9fb3d6; cursor: pointer; }
.hub-nav-toggle:hover { background: rgba(255, 255, 255, .1); color: #fff; }
.hub-nav-toggle .hub-chevron { margin-left: 0; }
.hub-group.is-open > .hub-nav-row .hub-chevron { transform: rotate(90deg); }
.hub-nav-heading { margin: 16px 14px 6px; font-size: 10.5px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; color: #7f92b3; }
.hub-chevron { margin-left: auto; opacity: .7; transition: transform .15s ease; }
.hub-group.is-open > .hub-nav .hub-chevron { transform: rotate(90deg); }
.hub-sub { margin: 2px 0 6px 23px; padding-left: 10px; border-left: 1px solid rgba(255, 255, 255, .1); display: grid; gap: 1px; }
.cu-shell.hub-v3 .hub-sub .cu-link { min-height: 36px; padding: 7px 10px; border-radius: 9px; font-size: 13px; color: #c9d4e8; }
.cu-shell.hub-v3 .hub-sub .cu-link:hover { background: rgba(255, 255, 255, .07); color: #fff; }
.cu-shell.hub-v3 .hub-sub .cu-link.is-active { background: rgba(37, 99, 235, .4); color: #fff; }
.cu-shell.hub-v3 .hub-sub .cu-link-icon { color: #8fa1bf; }
.cu-shell.hub-v3 .hub-sub .cu-nav-text small { color: #8193b3; font-size: 11px; }
.hub-spaces { display: grid; gap: 1px; margin-top: 4px; }
.hub-spaces-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px 4px; font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8193b3; }
.cu-shell.hub-v3 .hub-spaces .cu-head-actions button { border: 0; background: none; color: #8fa1bf; cursor: pointer; }
.cu-shell.hub-v3 .hub-spaces .cu-head-actions button:hover { color: #fff; background: rgba(255, 255, 255, .1); }
.cu-shell.hub-v3 .cu-space-avatar { background: #2563eb; }
.cu-shell.hub-v3 .cu-sidebar .cu-count { color: #8fa1bf; }
.cu-shell.hub-v3 .cu-sidebar .cu-empty { color: #8fa1bf; }
.cu-shell.hub-v3 .cu-close { display: none; border: 0; background: rgba(255, 255, 255, .08); color: #fff; width: 38px; height: 38px; border-radius: 10px; place-items: center; cursor: pointer; }

/* The bar across the top. */
.cu-shell.hub-v3 .cu-topbar {
  grid-area: top; grid-column: auto; display: flex; align-items: center; gap: 14px; min-width: 0;
  padding: 0 clamp(16px, 2.2vw, 32px); background: var(--cu-top); border-bottom: 1px solid var(--cu-border);
}
.hub-top-brand { display: none; }
.cu-shell.hub-v3 .cu-search {
  flex: 0 1 560px; margin: 0 auto 0 0; max-width: 560px; height: 44px; border-radius: 12px;
  background: var(--surface-alt); border: 1px solid var(--cu-border); color: var(--cu-muted); padding: 0 14px; gap: 10px;
}
.cu-shell.hub-v3 .cu-search:hover { border-color: #c9d6ea; }
.cu-shell.hub-v3 .cu-search kbd { padding: 2px 7px; border-radius: 6px; border: 1px solid var(--cu-border); background: var(--surface); color: var(--muted-strong); font-size: 11px; }
.cu-shell.hub-v3 .cu-top-actions { gap: 10px; margin-left: auto; }
.cu-shell.hub-v3 .cu-top-actions > button, .cu-shell.hub-v3 .cu-top-actions > a,
.cu-shell.hub-v3 .cu-top-actions .hub-theme { width: 42px; height: 42px; border-radius: 11px; color: var(--cu-muted); }
.hub-new { position: relative; }
.cu-shell.hub-v3 .cu-top-actions .hub-new-button {
  display: inline-flex; align-items: center; gap: 7px; width: auto; height: 42px; padding: 0 18px 0 15px;
  border-radius: 10px; background: #2563eb; color: #fff; font: inherit; font-size: 14px; font-weight: 650;
  box-shadow: 0 4px 12px rgba(37, 99, 235, .25);
}
.cu-shell.hub-v3 .cu-top-actions .hub-new-button:hover { background: #1d4ed8; color: #fff; }
.cu-shell.hub-v3 .hub-new-menu { left: auto; right: 0; min-width: 250px; }
.cu-shell.hub-v3 .cu-top-actions .hub-me {
  display: flex; align-items: center; gap: 10px; width: auto; height: 50px; padding: 4px 8px 4px 4px;
  border-radius: 12px; color: var(--cu-text); font: inherit; text-align: left;
}
.cu-shell.hub-v3 .cu-top-actions .hub-me:hover { background: var(--cu-hover); }
.cu-shell.hub-v3 .hub-me .cu-avatar { width: 40px; height: 40px; font-size: 13.5px; background: linear-gradient(145deg, #2f6df0, #1a47b8); cursor: pointer; }
.hub-me-text { display: grid; line-height: 1.2; min-width: 0; max-width: 180px; }
.hub-me-text strong { font-size: 14px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hub-me-text small { font-size: 12px; color: var(--cu-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hub-me-chevron { color: var(--cu-muted); }
.cu-shell.hub-v3 .cu-me-menu { top: 56px; }

.cu-shell.hub-v3 .cu-main { grid-area: main; min-width: 0; min-height: 0; overflow-y: auto; padding: 26px clamp(18px, 2.4vw, 36px) 56px; background: var(--cu-bg); }
.cu-shell.hub-v3 .cu-crumbs a:hover { color: var(--cu-accent); }
.cu-shell.hub-v3 .cu-link.is-drop { background: rgba(37, 99, 235, .3); outline-color: #6ea0ff; }
.cu-shell.hub-v3 .cu-move-note { background: #2563eb; }

/* Older pages were drawn for a dark background and kept pale text in places; on the light theme those
   went nearly invisible. The light theme gets darker versions of the same colours. */
html:not([data-theme=dark]) .cu-shell.hub-v3 {
  --warning: #b45309; --success: #15803d; --danger: #c2273d; --info: #1d4ed8; --neutral: #5b6b84;
}
html:not([data-theme=dark]) .cu-shell.hub-v3 .member-avatar,
html:not([data-theme=dark]) .cu-shell.hub-v3 .count-badge { background: #e6efff; color: #1d4ed8; }
html:not([data-theme=dark]) .cu-shell.hub-v3 .status-chip--approved { background: #e3f4ea; color: #166534; }
html:not([data-theme=dark]) .cu-shell.hub-v3 .status-chip--pending { background: #fdf0d9; color: #92400e; }
html:not([data-theme=dark]) .cu-shell.hub-v3 .status-chip--archived { background: #eef1f5; color: #475569; }
html:not([data-theme=dark]) .cu-shell.hub-v3 .owner-marker { color: #92400e; }
html:not([data-theme=dark]) .cu-shell.hub-v3 .nc-icon--warning { background: #b45309; }

@media (max-width: 900px) {
  .cu-shell.hub-v3 {
    grid-template-columns: minmax(0, 1fr); grid-template-rows: 62px minmax(0, 1fr);
    grid-template-areas: "top" "main";
  }
  .cu-shell.hub-v3 .cu-sidebar {
    position: fixed; top: 0; bottom: 0; left: 0; z-index: 90; width: min(320px, 88vw);
    transform: translateX(-105%); transition: transform .2s ease; box-shadow: 20px 0 60px rgba(5, 15, 35, .35);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .cu-shell.hub-v3 .cu-sidebar.is-open { transform: none; }
  .cu-shell.hub-v3 .cu-close { display: grid; }
  .cu-shell.hub-v3 .cu-topbar { padding: 0 10px; gap: 6px; }
  .cu-shell.hub-v3 .cu-mobile { display: none; }
  .hub-top-brand { display: flex; align-items: center; gap: 9px; color: var(--cu-text); text-decoration: none; min-width: 0; margin-right: auto; }
  .hub-top-brand .hub-mark { width: 36px; height: 36px; border-radius: 10px; }
  .hub-top-brand span:last-child { display: grid; line-height: 1.1; }
  .hub-top-brand strong { font-size: 16px; font-weight: 800; }
  .hub-top-brand small { font-size: 9.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--cu-muted); }
  .cu-shell.hub-v3 .cu-search { flex: none; width: 42px; height: 42px; padding: 0; justify-content: center; margin: 0; background: none; border: 0; }
  .cu-shell.hub-v3 .cu-search .cp-trigger-text, .cu-shell.hub-v3 .cu-search kbd { display: none; }
  .cu-shell.hub-v3 .cu-search svg { width: 18px; height: 18px; }
  .cu-shell.hub-v3 .cu-top-actions { gap: 2px; margin-left: 0; }
  .cu-shell.hub-v3 .cu-top-actions .hub-new-button { width: 42px; padding: 0; justify-content: center; }
  .cu-shell.hub-v3 .hub-new-button span, .hub-me-text, .hub-me-chevron { display: none; }
  .cu-shell.hub-v3 .cu-top-actions .hub-me { height: 42px; padding: 2px; }
  .cu-shell.hub-v3 .hub-me .cu-avatar { width: 36px; height: 36px; font-size: 12.5px; }
  .cu-shell.hub-v3 .hub-theme { display: none !important; }
  .cu-shell.hub-v3 .cu-main { padding: 16px 14px calc(92px + env(safe-area-inset-bottom)); }
  .cu-shell.hub-v3 .cu-bottom {
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); position: fixed; left: 0; right: 0; bottom: 0; z-index: 70;
    background: var(--cu-top); border-top: 1px solid var(--cu-border); padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
    box-shadow: 0 -6px 20px rgba(15, 27, 51, .06);
  }
  .cu-shell.hub-v3 .cu-bottom-item { color: var(--cu-muted); background: none; min-height: 56px; font-size: 11px; font-weight: 650; }
  .cu-shell.hub-v3 .cu-bottom-item.is-active { color: #2563eb; background: none; }
  html[data-theme=dark] .cu-shell.hub-v3 .cu-bottom-item.is-active { color: #7aa7ff; }
}
@media (max-width: 380px) {
  .hub-top-brand span:last-child { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cu-shell.hub-v3 .cu-sidebar, .hub-nav, .hub-chevron { transition: none; }
}
`;
