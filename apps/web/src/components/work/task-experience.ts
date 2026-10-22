/** Consistent task view across desktop and touch devices. */
export const taskExperienceCss = String.raw`
.mt{display:grid;gap:20px;max-width:1580px;margin:0 auto}
.mt-tabs{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:15px;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}
.mt-tab{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;min-height:42px;border:1px solid var(--border);border-radius:11px;background:var(--surface-alt);color:var(--text);font-weight:700;font-size:13.5px}
.mt-tab:hover{border-color:var(--accent)}
.mt-tab.is-on{background:#2459bd;border-color:#2459bd;color:white}
.mt-search{margin-left:auto;max-width:350px;min-height:43px;border-radius:11px;background:var(--surface-alt);border:1px solid var(--border);font-size:15px}
.mt-group{min-width:0}
.mt-group h2{display:flex;gap:10px;align-items:center;margin:0 0 11px;color:var(--muted-strong);font-size:12px;letter-spacing:.07em;text-transform:uppercase}
.mt-group ul{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);overflow:visible}
.mt-group li{display:flex;align-items:center;gap:0;min-height:68px;padding:0 14px 0 0;border-radius:13px}
.mt-group li+li{border-top:1px solid var(--border-soft)}
.mt-group li.is-picked{background:var(--surface-high)}
.mt-pick{height:19px;width:19px;margin-left:18px;accent-color:#2459bd;cursor:pointer}
.mt-group a{display:flex;align-items:center;min-width:0;flex:1;gap:14px;padding:15px 16px;color:var(--text);border-radius:12px;text-decoration:none}
.mt-group a:hover{background:var(--surface-alt)}
.mt-title{min-width:0;flex:1;overflow-wrap:anywhere;color:var(--text);font-size:14px;line-height:1.5;font-weight:700}
.mt-meta{display:flex;align-items:center;gap:13px;flex:0 0 auto;min-width:0;color:var(--muted-strong);font-size:12px;line-height:1.5}
.mt-when{font-weight:700;white-space:nowrap}
.mt-when.is-late{color:#b52b42}
.mt-list{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.mt-controls{display:flex;gap:5px;align-items:center;flex:none}
.mt-bar{position:sticky;top:8px;z-index:16;display:flex;gap:11px;flex-wrap:wrap;align-items:center;padding:12px 14px;border-radius:13px;background:#214f9d;color:white}
.mt-bar select{min-height:42px;font-size:14px}
.mt-go{min-height:42px;background:white;color:#18468f}
.mt-clear{min-height:42px}
.mt-filter{margin:0;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--surface-high);font-size:13px}
.mt-filter a{font-weight:700;color:var(--accent)}
.mt-empty{padding:26px;border:1px solid var(--border);background:var(--surface);border-radius:16px;color:var(--muted-strong);line-height:1.55}
.mt-note{background:var(--surface-high);color:var(--text);border:1px solid var(--border);padding:12px 15px}
html[data-theme=dark] .mt-group ul{background:var(--surface);border-color:var(--border)}
html[data-theme=dark] .mt-tab.is-on{background:#346cbb;border-color:#346cbb}
@media(max-width:1000px){.mt-group a{flex-direction:column;align-items:flex-start;gap:5px}.mt-meta{flex-wrap:wrap}.mt-list{max-width:none}}
@media(max-width:760px){
 .mt{gap:16px}.mt-tabs{padding:10px;gap:7px;border-radius:14px}
 .mt-tab{flex:1;justify-content:center;min-width:0;min-height:44px;padding:7px 6px;font-size:12px}
 .mt-tab .mt-n{padding:1px 5px;font-size:10px}
 .mt-search{flex:1 1 100%;max-width:none;margin-left:0;min-height:45px}
 .mt-group ul{border-radius:14px}
 .mt-group li{display:grid;grid-template-columns:36px minmax(0,1fr);padding:12px 12px 12px 5px;gap:0}
 .mt-pick{grid-column:1;grid-row:1;margin-left:8px;height:20px;width:20px}
 .mt-group a{grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:7px;align-items:flex-start;padding:0 4px 10px}
 .mt-title{font-size:14px;font-weight:700;width:100%;line-height:1.45}
 .mt-meta{display:flex;flex-wrap:wrap;gap:5px 10px;font-size:12px}
 .mt-controls{grid-column:2;display:flex;align-items:center;justify-content:flex-start;min-width:0;padding:7px 4px 0;border-top:1px solid var(--border-soft)}
 .mt-bar{top:6px}
}
@media(prefers-reduced-motion:reduce){.mt-group a,.mt-tab{scroll-behavior:auto}}
`;
