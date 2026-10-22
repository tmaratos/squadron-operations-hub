/**
 * TN-170 Operations — responsive experience v1.
 * Kept separate from the legacy shell styles so the original implementation
 * can be compared or rolled back without touching operational features.
 * No Air Force insignia or third-party institutional logos are used here.
 */
export const operationsExperienceCss = String.raw`
.cu-shell {
  --cu-bg: #f5f7fb;
  --cu-side: #fff;
  --cu-rail: #f7f9fc;
  --cu-top: #fff;
  --cu-border: #e3e8f1;
  --cu-text: #172640;
  --cu-muted: #596b84;
  --cu-hover: #eef3fb;
  --cu-active: #e7efff;
  --cu-accent: #285cc8;
  --background: #f5f7fb;
  --background-soft: #eef3fa;
  --surface: #fff;
  --surface-alt: #f7f9fc;
  --surface-high: #edf3fb;
  --border: #e3e8f1;
  --border-soft: #e7ecf4;
  --text: #172640;
  --text-soft: #263a55;
  --muted: #596b84;
  --muted-strong: #42546d;
  --accent: #285cc8;
  --accent-strong: #204ba4;
  --shadow: 0 6px 28px rgba(25, 47, 82, .055);
  grid-template-columns: 292px minmax(0, 1fr);
  grid-template-rows: 68px minmax(0, 1fr);
}
html[data-theme=dark] .cu-shell {
  --cu-bg: #101b2b; --cu-side: #142237; --cu-rail: #142237;
  --cu-top: #111e31; --cu-border: #304058; --cu-text: #eef4fc;
  --cu-muted: #b0bfd2; --cu-hover: #213651; --cu-active: #264a75;
  --cu-accent: #85b2ff;
  --background: #101b2b; --background-soft: #16263b;
  --surface: #17283c; --surface-alt: #1c2f47; --surface-high: #233952;
  --border: #304058; --border-soft: #2c3d56;
  --text: #eef4fc; --text-soft: #d6e2f1;
  --muted: #b0bfd2; --muted-strong: #c7d5e8;
  --accent: #85b2ff; --accent-strong: #a5c8ff;
  --shadow: 0 6px 28px rgba(0, 0, 0, .20);
}
.cu-shell .cu-topbar {
  padding: 0 22px; gap: 18px; min-width: 0;
  background: var(--cu-top); border-bottom: 1px solid var(--cu-border);
}
.cu-shell .cu-brand { gap: 12px; padding-right: 18px; border-right: 1px solid var(--cu-border); }
.cu-brand-mark {
  width: 40px; height: 40px; flex: none; display: grid; place-items: center;
  border-radius: 12px; background: #e8f0ff; color: #224eaa;
  font-size: 15px; letter-spacing: -.05em; font-weight: 850;
  border: 1px solid #c6d9ff;
}
html[data-theme=dark] .cu-brand-mark { background: #274a77; color: #eef5ff; border-color: #3c689e; }
.cu-shell .cu-brand-text { display: grid; gap: 2px; }
.cu-shell .cu-brand-text strong { font-size: 14px; letter-spacing: -.02em; }
.cu-shell .cu-brand-text small { font-size: 11px; }
.cu-shell .cu-ws-avatar { background: #e2ebf9; color: #244c9d; border-radius: 9px; }
.cu-shell .cu-ws-button { min-height: 40px; padding: 6px 8px; font-weight: 600; }
.cu-shell .cu-search {
  max-width: 520px; height: 42px; border-radius: 12px;
  background: var(--cu-bg); border: 1px solid var(--cu-border); margin-left: auto;
}
.cu-shell .cu-top-actions { gap: 8px; }
.cu-shell .cu-top-actions button, .cu-shell .cu-top-actions a {
  width: 40px; height: 40px; border-radius: 11px; color: var(--cu-muted);
}
.cu-shell .cu-avatar, .cu-bottom-avatar { background: #2b5fc3; color: #fff; }
.cu-shell .cu-rail { display: none; }
.cu-shell .cu-sidebar {
  overflow: hidden; min-width: 0;
  background: var(--cu-side); border-right: 1px solid var(--cu-border);
}
.cu-shell .cu-sidebar-head {
  display: flex; padding: 21px 20px 14px; border-bottom: 0;
}
.cu-shell .cu-sidebar-head h2 { font-size: 17px; letter-spacing: -.025em; }
.cu-shell .cu-sidebar-body { padding: 0 14px 30px; }
.cu-side-label {
  margin: 15px 8px 8px; font-size: 10px; font-weight: 800;
  letter-spacing: .12em; text-transform: uppercase; color: var(--cu-muted);
}
.cu-shortcuts { display: grid; gap: 3px; }
.cu-shortcut {
  display: flex; align-items: center; gap: 12px; min-height: 43px;
  padding: 10px 11px; border-radius: 11px; font-size: 14px;
  font-weight: 620; color: var(--cu-text); text-decoration: none;
}
.cu-shortcut svg { color: var(--cu-muted); flex: none; }
.cu-shortcut:hover, .cu-shortcut.is-active { background: var(--cu-active); }
.cu-shortcut.is-active, .cu-shortcut.is-active svg { color: var(--cu-accent); }
.cu-section-list {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px;
  padding: 3px 0 7px;
}
.cu-section-short {
  display: flex; gap: 7px; align-items: center; min-width: 0;
  padding: 10px 8px; min-height: 45px; border-radius: 11px;
  color: var(--cu-muted); background: transparent;
  border: 1px solid transparent; font: inherit; font-size: 12px;
  font-weight: 650; text-align: left; cursor: pointer;
}
.cu-section-short svg { flex: none; }
.cu-section-short span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cu-section-short:hover { background: var(--cu-hover); }
.cu-section-short.is-active {
  background: var(--cu-active); color: var(--cu-accent); border-color: var(--cu-border);
}
.cu-current-section { margin-top: 12px; padding-top: 13px; border-top: 1px solid var(--cu-border); }
.cu-current-section-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 0 8px 6px; color: var(--cu-text);
  font-size: 13px; font-weight: 750;
}
.cu-current-section-head a { text-decoration: none; color: var(--cu-accent); font-size: 12px; font-weight: 650; }
.cu-shell .cu-blurb { margin: 0 8px 12px; font-size: 12px; line-height: 1.45; }
.cu-shell .cu-link {
  min-height: 39px; padding: 8px 10px; border-radius: 10px;
  font-size: 13px; color: var(--cu-text);
}
.cu-shell .cu-link.is-active { color: var(--cu-accent); }
.cu-shell .cu-nav-text small { font-size: 11px; }
.cu-shell .cu-section-head button { font-size: 12px; }
.cu-shell .cu-new { width: 32px; height: 32px; border-radius: 10px; }
.cu-shell .cu-main { padding: 28px clamp(20px, 3vw, 48px) 55px; }
.cu-shell .cu-crumbs { font-size: 13px; margin-bottom: 19px; }
.cu-shell .cu-crumbs a:hover { color: var(--cu-accent); }
.cu-shell .cu-me-menu, .cu-shell .cu-menu { border-radius: 15px; }
.cu-shell :where(a,button,input,select,textarea):focus-visible {
  outline: 3px solid #4d8af8; outline-offset: 2px;
}
.cu-shell :where(button,a) { -webkit-tap-highlight-color: transparent; }
.cu-shell .cu-bottom { display: none; }
/* Authenticated pages share the same visual language; existing actions remain intact. */
.cu-shell .page-header h1 { color: var(--cu-text); letter-spacing: -.035em; }
.cu-shell .home-card, .cu-shell .section-card, .cu-shell .metric-card {
  border-radius: 18px; background: var(--surface);
  border-color: var(--cu-border); box-shadow: var(--shadow);
}
.cu-shell .welcome-hero {
  min-height: 0; border-radius: 19px;
  background: linear-gradient(120deg, #15355f 0%, #244f86 58%, #2e648e 100%);
  box-shadow: 0 10px 32px rgba(20, 54, 94, .14);
}
.cu-shell .welcome-hero::after { opacity: .16; }
.cu-shell .welcome-hero__shade { background: linear-gradient(90deg, rgba(7,28,55,.35), transparent); }
.cu-shell .welcome-hero__content { padding: 26px 28px; }
.cu-shell .welcome-hero h1 { font-size: clamp(23px,2.2vw,31px); }
.cu-shell .welcome-hero p { font-size: 14px; line-height: 1.5; }
.cu-shell .hero-metrics { gap: 11px; }
.cu-shell .hero-metrics article {
  border-radius: 14px; padding: 14px 15px; min-width: 0; min-height: 90px;
  background: rgba(255,255,255,.96); color: #162942;
}
.cu-shell .hero-metrics strong { color: #162942; }
.cu-shell .hero-metrics small { color: #405673; }
.cu-shell .home-task-row { min-height: 55px; }
.cu-shell .home-task-list .home-task-link { border-radius: 9px; }
/* No hidden desktop-only features: all tools stay reachable in the drawer. */
@media (max-width: 900px) {
  .cu-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 62px minmax(0, 1fr); height: 100dvh;
  }
  .cu-shell .cu-topbar { padding: 0 12px; gap: 9px; }
  .cu-shell .cu-mobile {
    display: grid; place-items: center; min-width: 42px;
    min-height: 42px; border-radius: 11px;
  }
  .cu-shell .cu-brand { padding: 0; border: none; }
  .cu-shell .cu-brand-mark { width: 34px; height: 34px; border-radius: 10px; font-size: 13px; }
  .cu-shell .cu-brand-text { display: none; }
  .cu-shell .cu-ws-button strong { display: none; }
  .cu-shell .cu-ws-button { padding: 4px; }
  .cu-shell .cu-search { flex: 1 1 auto; min-width: 38px; height: 40px; max-width: none; }
  .cu-shell .cu-top-actions { gap: 2px; }
  .cu-shell .cu-top-actions button, .cu-shell .cu-top-actions a { width: 36px; height: 40px; }
  .cu-shell .cu-sidebar {
    display: flex; position: fixed; top: 0; bottom: 0; left: 0;
    width: min(370px, 92vw); z-index: 90; padding-bottom: env(safe-area-inset-bottom);
    box-shadow: 20px 0 60px rgba(10,25,48,.18);
    transform: translateX(-105%); transition: transform .2s ease;
  }
  .cu-shell .cu-sidebar.is-open { transform: translateX(0); }
  .cu-shell .cu-backdrop { display: block; }
  .cu-shell .cu-sidebar-head { padding: 24px 18px 12px; }
  .cu-shell .cu-sidebar-body { padding: 0 16px 32px; }
  .cu-shell .cu-link { min-height: 46px; font-size: 14px; }
  .cu-shell .cu-section-short { min-height: 49px; font-size: 13px; }
  .cu-shell .cu-main {
    max-width: 100vw; min-width: 0; padding: 18px 14px calc(92px + env(safe-area-inset-bottom));
  }
  .cu-shell .cu-bottom {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 70;
    display: grid; grid-template-columns: repeat(5,minmax(0,1fr));
    gap: 2px; background: var(--cu-side); border-top: 1px solid var(--cu-border);
    padding: 5px 5px calc(5px + env(safe-area-inset-bottom));
  }
  .cu-shell .cu-bottom-item {
    display: flex; align-items: center; justify-content: center; flex-direction: column;
    gap: 4px; min-height: 59px; min-width: 0; padding: 7px 1px;
    border-radius: 11px; font-size: 11px; font-weight: 700;
    color: var(--cu-muted); text-decoration: none;
  }
  .cu-shell .cu-bottom-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cu-shell .cu-bottom-item.is-active { color: var(--cu-accent); background: var(--cu-active); }
  .cu-shell .welcome-hero__content { padding: 20px 16px; }
  .cu-shell .hero-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
  .cu-shell .hero-metrics article { min-height: 85px; padding: 12px 10px; gap: 7px; }
}
@media (max-width: 420px) {
  .cu-shell .cu-topbar { padding: 0 6px; gap: 4px; }
  .cu-shell .cu-brand-mark { width: 30px; height: 30px; font-size: 12px; }
  .cu-shell .cu-ws-button { padding: 1px; }
  .cu-shell .cu-search { height: 38px; }
  .cu-shell .cu-main { padding-left: 12px; padding-right: 12px; }
  .cu-shell .cu-bottom-item { font-size: 10px; }
  .cu-shell .hero-metrics article { padding: 10px 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .cu-shell .cu-sidebar { transition: none; }
}
`;
