/**
 * TN-170 home - the October 2026 look.
 * Pure visual layer; real dashboard data and task actions stay in their original modules.
 */
export const dashboardExperienceCss = String.raw`
.hub-home{display:grid;gap:20px;max-width:1500px;margin:0 auto;padding-bottom:20px;
  --hub-donut-a:#2563eb;--hub-donut-b:#22c3a6}
.hub-home h1,.hub-home h2{margin:0}

.hub-hero{position:relative;overflow:hidden;min-height:190px;border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:20px;
  padding:30px clamp(22px,3vw,40px);color:#fff;background:#0d2148;box-shadow:0 10px 30px rgba(13,33,72,.18)}
.hub-hero-art{position:absolute;inset:0;width:100%;height:100%}
.hub-hero-copy,.hub-hero-side{position:relative}
.hub-hero-copy h1{font-size:clamp(26px,3.2vw,40px);font-weight:800;letter-spacing:-.03em;line-height:1.1;color:#fff}
.hub-hero-copy p{margin:10px 0 0;font-size:clamp(14px,1.3vw,17px);color:#dbe5f7;max-width:560px;line-height:1.45}
.hub-hero-side{display:grid;justify-items:end;gap:4px;text-align:right;color:#e8eefb}
.hub-hero-side strong{font-size:14px;font-weight:650}
.hub-hero-side span{font-size:13px;color:#cfdaf0}
.hub-hero-side em{margin-top:8px;font-size:13px;font-style:normal;color:#f4e7d6;max-width:220px}

.hub-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.hub-stat{display:flex;align-items:center;gap:16px;min-width:0;padding:20px;border:1px solid var(--border);border-radius:16px;background:var(--surface);
  color:var(--text);text-decoration:none;box-shadow:var(--shadow);transition:transform .12s ease,border-color .12s ease}
.hub-stat:hover{transform:translateY(-2px);border-color:#b9cdf3}
.hub-stat-icon{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center}
.hub-stat-copy{display:grid;gap:3px;min-width:0}
.hub-stat-copy strong{font-size:30px;line-height:1;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.hub-stat-copy span{font-size:14px;font-weight:600;color:var(--text-soft)}
.hub-stat-copy small{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hub-stat-copy small.is-bad{justify-self:start;color:#c2273d;background:#fdecef;padding:2px 8px;border-radius:999px;font-weight:650}
.hub-stat-copy small.is-good{color:#13804f;font-weight:600}

.hub-tone-red{color:#dc3545;background:#fdecee}
.hub-tone-blue{color:#2563eb;background:#e8f0ff}
.hub-tone-green{color:#16a34a;background:#e6f7ec}
.hub-tone-amber{color:#d97706;background:#fff4e0}
.hub-tone-indigo{color:#4f46e5;background:#eceafe}
.hub-tone-teal{color:#0d9488;background:#e2f6f3}
.hub-tone-violet{color:#7c3aed;background:#f1eafe}
html[data-theme=dark] .hub-tone-red{background:rgba(220,53,69,.18);color:#ff8a96}
html[data-theme=dark] .hub-tone-blue{background:rgba(37,99,235,.22);color:#8db4ff}
html[data-theme=dark] .hub-tone-green{background:rgba(22,163,74,.2);color:#6fdc98}
html[data-theme=dark] .hub-tone-amber{background:rgba(217,119,6,.2);color:#ffc067}
html[data-theme=dark] .hub-tone-indigo{background:rgba(79,70,229,.24);color:#a8a3ff}
html[data-theme=dark] .hub-tone-teal{background:rgba(13,148,136,.22);color:#5fe0d2}
html[data-theme=dark] .hub-tone-violet{background:rgba(124,58,237,.24);color:#c4a5ff}
html[data-theme=dark] .hub-stat-copy small.is-bad{background:rgba(220,53,69,.18);color:#ff8a96}

.hub-row{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1.1fr) minmax(260px,.8fr);gap:16px;align-items:start}
.hub-row--wide{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.hub-card{min-width:0;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.hub-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 10px}
.hub-card-head h2{font-size:17px;font-weight:750;letter-spacing:-.01em;color:var(--text)}
.hub-card-head a{display:inline-flex;align-items:center;gap:2px;font-size:13px;font-weight:650;color:var(--accent);text-decoration:none;white-space:nowrap}
.hub-card-head a:hover{text-decoration:underline}
.hub-empty{margin:0;padding:8px 20px 22px;font-size:13.5px;color:var(--muted);line-height:1.5}
.hub-empty a{color:var(--accent);font-weight:650}

.hub-tasks,.hub-events{list-style:none;margin:0;padding:0 10px 10px}
.hub-tasks li+li,.hub-events li+li{border-top:1px solid var(--border-soft)}
.hub-task{display:flex;align-items:center;gap:10px;min-width:0;padding:4px 0}
.hub-task-open{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;color:var(--text);text-decoration:none}
.hub-task-open:hover{background:var(--surface-high)}
.hub-task-dot{flex:none;width:20px;height:20px;border-radius:50%;border:2px solid #b8c4d6}
.hub-task-dot.is-late{border-color:#dc3545;background:radial-gradient(circle,#dc3545 0 4px,transparent 5px)}
.hub-task-copy{display:grid;gap:3px;min-width:0}
.hub-task-copy strong{font-size:14px;font-weight:620;line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.hub-task-copy span{font-size:12.5px;color:var(--muted)}
.hub-task-copy span.is-late{color:#c2273d;font-weight:600}
.hub-task-tools{flex:none;display:flex;align-items:center;gap:6px;padding-right:6px}

.hub-event{display:flex;align-items:center;gap:14px;min-width:0;padding:12px 10px;border-radius:10px;color:var(--text);text-decoration:none}
.hub-event:hover{background:var(--surface-high)}
.hub-date{flex:none;width:52px;height:56px;border-radius:12px;display:grid;place-content:center;text-align:center;background:#fdecee;border:1px solid #f9d4d9}
.hub-date small{font-size:11px;font-weight:800;letter-spacing:.06em;color:#dc3545;line-height:1}
.hub-date strong{font-size:22px;font-weight:800;line-height:1.1;color:var(--text)}
html[data-theme=dark] .hub-date{background:rgba(220,53,69,.12);border-color:rgba(220,53,69,.3)}
.hub-event-copy{flex:1;min-width:0;display:grid;gap:3px}
.hub-event-copy strong{font-size:14px;font-weight:620;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hub-event-copy span{font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hub-tag{flex:none;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;color:#2563eb;background:#e8f0ff}
html[data-theme=dark] .hub-tag{background:rgba(37,99,235,.22);color:#8db4ff}

.hub-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:6px 16px 18px}
.hub-action{display:grid;justify-items:center;align-content:center;gap:8px;min-height:96px;padding:12px 8px;border:1px solid var(--border);border-radius:12px;
  background:var(--surface);color:var(--text);font:inherit;font-size:13px;font-weight:620;text-align:center;text-decoration:none;cursor:pointer}
.hub-action:hover{border-color:#b9cdf3;background:var(--surface-alt)}
.hub-action-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center}

.hub-foot{display:flex;align-items:center;gap:8px;margin:0 10px 12px;padding:12px 10px;border-radius:10px;font-size:13.5px;font-weight:650;color:var(--accent);text-decoration:none;background:var(--surface-alt)}
.hub-foot:hover{background:var(--surface-high)}

.hub-snapshot{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:4px 20px 20px;flex-wrap:wrap}
.hub-snap-list{list-style:none;margin:0;padding:0;display:grid;gap:12px;min-width:0}
.hub-snap-list li{display:grid;grid-template-columns:36px auto;grid-template-rows:auto auto;column-gap:12px;align-items:center}
.hub-snap-icon{grid-row:1/3;width:36px;height:36px;border-radius:10px;display:grid;place-items:center}
.hub-snap-list strong{font-size:20px;font-weight:800;line-height:1.05}
.hub-snap-list span:last-child{font-size:12.5px;color:var(--muted)}
.hub-donut{margin:0;display:grid;justify-items:center;gap:12px}
.hub-donut-ring{position:relative;width:132px;height:132px}
.hub-donut-ring figcaption{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.hub-donut-ring strong{font-size:24px;font-weight:800;line-height:1}
.hub-donut-ring span{font-size:12px;color:var(--muted)}
.hub-legend{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:12.5px;color:var(--muted-strong)}
.hub-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px}
.hub-legend i.is-a{background:var(--hub-donut-a)}.hub-legend i.is-b{background:var(--hub-donut-b)}

@media (max-width:1280px){
  .hub-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .hub-card--actions{grid-column:1/-1}
  .hub-card--actions .hub-actions{grid-template-columns:repeat(6,minmax(0,1fr))}
}
@media (max-width:1100px){
  .hub-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:900px){
  .hub-home{gap:14px}
  .hub-hero{min-height:0;padding:20px 18px;border-radius:16px;flex-direction:column;align-items:flex-start;gap:8px}
  .hub-hero-copy h1{font-size:26px}
  .hub-hero-copy p{margin-top:6px;font-size:14px}
  .hub-hero-side{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px;text-align:left}
  .hub-hero-side strong,.hub-hero-side span{font-size:13px}
  .hub-hero-side span::before{content:"·";margin-right:8px;opacity:.7}
  .hub-hero-side em{display:none}
  .hub-row,.hub-row--wide{grid-template-columns:minmax(0,1fr)}
  .hub-card--actions .hub-actions{grid-template-columns:repeat(3,minmax(0,1fr))}
  .hub-task{flex-wrap:wrap}
  .hub-task-tools{padding:0 0 8px 42px}
}
/* A phone shows the four counts as small tiles - icon and number on one line, what it is under them, and at
   most one line of detail - so the first screen reaches the work itself rather than stopping at numbers. */
@media (max-width:700px){
  .hub-stats{gap:10px}
  .hub-stat{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;column-gap:10px;row-gap:4px;padding:12px 14px;border-radius:14px}
  .hub-stat-copy{display:contents}
  .hub-stat-icon{width:36px;height:36px}
  .hub-stat-icon svg{width:18px;height:18px}
  .hub-stat-copy strong{font-size:24px}
  .hub-stat-copy span{grid-column:1/-1;font-size:13px;line-height:1.3}
  .hub-stat-copy small{grid-column:1/-1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .hub-stat-copy small.is-bad{justify-self:start}
  .hub-card-head{padding:16px 16px 8px}
  .hub-tasks,.hub-events{padding:0 6px 6px}
  .hub-task-open{padding:10px 8px;gap:10px}
  .hub-task-copy strong{font-size:14.5px}
  /* The title gets the whole width; priority and owner sit under it rather than squeezing it. */
  .hub-task-open{flex:1 1 100%}
  .hub-task-tools{margin-top:-8px;padding:0 0 8px 40px;gap:8px}
  .hub-event{padding:10px 8px;gap:10px}
  .hub-date{width:46px;height:50px}
  .hub-date strong{font-size:19px}
  .hub-tag{display:none}
  .hub-snapshot{padding:4px 16px 16px}
}
@media (max-width:480px){
  .hub-card--actions .hub-actions{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hub-action{min-height:84px}
}
`;
