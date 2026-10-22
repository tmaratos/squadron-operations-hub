/**
 * TN-170 home experience.
 * Pure visual layer; real dashboard data and task actions stay in their original modules.
 */
export const dashboardExperienceCss = String.raw`
.ops-home{display:grid;gap:23px;max-width:1580px;margin:auto;padding-bottom:20px}
.ops-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
.ops-eyebrow{margin:0 0 7px!important;font-weight:800;font-size:11px!important;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)!important}
.ops-intro h1{font-size:clamp(25px,3vw,35px)!important;letter-spacing:-.035em;margin:0!important;color:var(--text)}
.ops-intro p{margin:9px 0 0;line-height:1.5;color:var(--muted-strong);font-size:14px}
.ops-intro-actions{display:flex;gap:9px;flex-wrap:wrap}
.ops-action{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:43px;padding:10px 15px;border:1px solid var(--border);border-radius:12px;background:var(--surface);font-size:13px;font-weight:700;color:var(--text);text-decoration:none}
.ops-action:hover{border-color:var(--accent);color:var(--accent)}
.ops-action--primary{background:#2459bd;border-color:#2459bd;color:#fff}
.ops-action--primary:hover{background:#17489f;color:#fff}
.ops-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.ops-kpi{min-width:0;display:flex;align-items:center;gap:15px;text-decoration:none;padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text);box-shadow:var(--shadow);transition:transform .12s ease,border-color .12s ease}
.ops-kpi:hover{transform:translateY(-2px);border-color:var(--accent)}
.ops-kpi-icon{display:grid;place-items:center;width:44px;height:44px;flex:none;border-radius:13px;color:#2560c5;background:#eaf1ff}
.ops-kpi--amber .ops-kpi-icon{color:#a8660e;background:#fff3dd}
.ops-kpi--red .ops-kpi-icon{color:#be3549;background:#fff0f1}
.ops-kpi--mint .ops-kpi-icon{color:#14765c;background:#e7f8f1}
.ops-kpi-copy{display:grid;gap:5px;min-width:0}
.ops-kpi-value{font-size:28px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.045em}
.ops-kpi-label{font-size:12.5px;line-height:1.35;color:var(--muted-strong);font-weight:650}
.ops-body{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:16px;align-items:start}
.ops-main-col,.ops-side-col{display:grid;gap:16px;min-width:0}
.ops-panel{border:1px solid var(--border);border-radius:19px;background:var(--surface);box-shadow:var(--shadow);min-width:0;overflow:hidden}
.ops-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:21px 22px 16px}
.ops-panel-head h2{margin:0!important;color:var(--text);font-size:17px!important;letter-spacing:-.015em}
.ops-panel-head p{margin:6px 0 0;color:var(--muted-strong);font-size:13px;line-height:1.5}
.ops-panel-head a{color:var(--accent);font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}
.ops-tasks{list-style:none;margin:0;padding:0 14px 14px}
.ops-task{display:flex;align-items:center;gap:12px;min-width:0;border-top:1px solid var(--border-soft);padding:10px 8px}
.ops-task-open{min-width:0;flex:1;display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--text);border-radius:9px;padding:6px 2px}
.ops-task-open:hover .ops-task-title{color:var(--accent)}
.ops-task-icon{display:grid;place-items:center;width:29px;height:29px;border-radius:10px;background:var(--surface-high);color:var(--accent);flex:none}
.ops-task-info{display:grid;gap:5px;min-width:0}
.ops-task-title{font-size:14px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
.ops-task-meta{font-size:12px;color:var(--muted-strong);line-height:1.4}
.ops-task-meta.is-late{color:#b7374a;font-weight:700}
.ops-inline{display:flex;align-items:center;gap:7px;flex:none}
.ops-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 18px 20px}
.ops-quick-link{min-height:66px;display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface-alt);text-decoration:none;color:var(--text);font-weight:650;font-size:13px}
.ops-quick-link svg{color:var(--accent);flex:none}
.ops-quick-link:hover{border-color:var(--accent);background:var(--surface-high)}
.ops-empty{margin:0;padding:5px 22px 25px;color:var(--muted-strong);line-height:1.55;font-size:13.5px}
.ops-footlink{display:flex;align-items:center;gap:8px;padding:14px 20px;border-top:1px solid var(--border-soft);font-size:13px;font-weight:700;text-decoration:none;color:var(--accent)}
.ops-footlink:hover{text-decoration:underline}
.ops-home .home-card{border-radius:18px}
html[data-theme=dark] .ops-kpi-icon{background:#263f60;color:#9fc7ff}
html[data-theme=dark] .ops-kpi--amber .ops-kpi-icon{background:#473922;color:#ffd28b}
html[data-theme=dark] .ops-kpi--red .ops-kpi-icon{background:#4c2938;color:#ff9aa5}
html[data-theme=dark] .ops-kpi--mint .ops-kpi-icon{background:#1b453c;color:#94e9c5}
@media(max-width:1200px){.ops-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ops-body{grid-template-columns:minmax(0,1fr) minmax(260px,.8fr)}}
@media(max-width:900px){.ops-body{grid-template-columns:1fr}.ops-intro-actions{width:100%}.ops-intro-actions .ops-action{flex:1}}
@media(max-width:600px){
  .ops-home{gap:15px}.ops-intro h1{font-size:26px!important}.ops-intro p{font-size:13px}
  .ops-intro-actions{gap:8px}.ops-intro-actions .ops-action{padding:9px 11px;font-size:12px}
  .ops-kpis{gap:9px}.ops-kpi{padding:12px;gap:9px;border-radius:14px;min-height:84px}
  .ops-kpi-icon{width:36px;height:36px;border-radius:10px}.ops-kpi-value{font-size:24px}.ops-kpi-label{font-size:11px}
  .ops-panel{border-radius:15px}.ops-panel-head{padding:17px 15px 14px}
  .ops-panel-head h2{font-size:16px!important}.ops-panel-head p{font-size:12px}
  .ops-tasks{padding:0 10px 10px}.ops-task{display:grid;grid-template-columns:minmax(0,1fr);gap:3px;padding:10px 6px}
  .ops-task-title{font-size:14px}.ops-inline{padding:0 0 0 43px;justify-content:flex-start}
  .ops-quick-grid{padding:0 13px 15px}.ops-quick-link{min-height:60px;padding:9px;font-size:12px;gap:8px}
}
@media(prefers-reduced-motion:reduce){.ops-kpi{transition:none}.ops-kpi:hover{transform:none}}
`;
