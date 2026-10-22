/** People and positions: clearer typography and touch targets without changing roster data. */
export const staffExperienceCss = String.raw`
.staff-experience{max-width:1570px;margin:0 auto;gap:19px}
.staff-experience .page-header h1{font-size:clamp(23px,3vw,32px);letter-spacing:-.035em}
.staff-experience .metric-grid--four{gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}
.staff-experience .metric-card{border-radius:17px;padding:18px;min-width:0;box-shadow:var(--shadow)}
.staff-experience .section-card{border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);background:var(--surface);min-width:0;overflow:hidden}
.staff-experience .section-card__header{padding:20px 20px 15px;min-height:0}
.staff-experience .section-card__header h2{font-size:17px;font-weight:750;letter-spacing:-.025em;color:var(--text)}
.staff-experience .section-card__header p{font-size:12.5px;line-height:1.5;color:var(--muted-strong)}
.staff-experience .personnel-directory-grid{grid-template-columns:minmax(0,1.35fr) minmax(310px,1fr);gap:15px}
.staff-experience .org-position-list{gap:10px}
.staff-experience .org-position{padding:15px;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface-alt);min-width:0}
.staff-experience .org-position__icon{width:42px;height:42px;border-radius:12px;background:#e8f1ff;color:#2459bd}
.staff-experience .org-position__body{gap:6px;min-width:0}
.staff-experience .org-position__body strong{font-size:13.5px;line-height:1.45;color:var(--text);overflow-wrap:anywhere}
.staff-experience .org-position__body span{font-size:12px;line-height:1.5;color:var(--muted-strong)}
.staff-experience .org-position__body small{font-size:11px;color:var(--muted-strong)}
.staff-experience .org-position__body em{font-size:11px}
.staff-experience .org-position--acting{border-color:#e4ca94;background:#fffaf0}
.staff-experience .org-position--vacant{border-color:#ebc7cb;background:#fff8f9}
html[data-theme=dark] .staff-experience .org-position--acting{background:#3c3022;border-color:#746143}
html[data-theme=dark] .staff-experience .org-position--vacant{background:#392833;border-color:#6f3c50}
html[data-theme=dark] .staff-experience .org-position__icon{background:#28476c;color:#b0cfff}
.staff-experience .org-edit select,.staff-experience .member-edit select,.staff-experience .member-edit input{min-height:43px;border:1px solid var(--border);background:var(--surface);border-radius:10px;font-size:14px;padding:8px 11px}
.staff-experience .org-change,.staff-experience .member-edit__save,.staff-experience .member-edit__cancel{min-height:40px;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:750}
.staff-experience .org-status{font-size:11px}
.staff-search{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:7px 0 15px}
.staff-search label{flex-basis:100%;font-size:12px;font-weight:750;color:var(--muted-strong)}
.staff-search input{flex:1 1 190px;min-height:45px;border:1px solid var(--border);border-radius:11px;padding:10px 13px;background:var(--surface-alt);color:var(--text);font-size:15px}
.staff-search>span{color:var(--muted-strong);font-size:12px}
.staff-search-empty{margin:0;padding:16px;color:var(--muted-strong);font-size:13px;line-height:1.5}
.staff-experience .personnel-member-list article{display:grid;grid-template-columns:42px minmax(0,1fr) auto auto;min-height:71px;gap:9px;padding:12px 0;align-items:center}
.staff-experience .member-avatar{width:42px;height:42px;display:grid;place-items:center;font-size:13px;border-radius:13px}
.staff-experience .personnel-member-list strong{font-size:13px;line-height:1.45;color:var(--text);overflow-wrap:anywhere}
.staff-experience .personnel-member-list span{font-size:11.5px;line-height:1.5}
.staff-experience .personnel-member-list small{font-size:11px}
.staff-experience .personnel-state{font-size:10.5px}
.staff-experience .committee-list article{padding:14px 0}
.staff-experience .staff-area-row{gap:12px;min-height:75px}
.staff-experience .staff-area-row>div:first-child strong{font-size:13px}
.staff-experience .staff-area-row>div:first-child span{font-size:11.5px;line-height:1.5}
.staff-experience .staff-area-row__owners>em{font-size:12px}
.staff-experience .member-workload-list article{min-height:77px;gap:12px}
.staff-experience .member-workload-list strong{font-size:13px}
.staff-experience .member-workload-list span{font-size:11.5px}
.staff-experience .member-workload-list small{font-size:11px}
.staff-experience .staff-assignment-form label{font-size:13px}
.staff-experience .staff-assignment-form input,.staff-experience .staff-assignment-form select{min-height:44px;font-size:15px}
.staff-experience :where(button,input,select):focus-visible{outline:3px solid #548df0;outline-offset:2px}
@media(max-width:1250px){.staff-experience .personnel-directory-grid{grid-template-columns:1fr}}
@media(max-width:1000px){.staff-experience .metric-grid--four{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){
 .staff-experience .metric-grid--four{gap:8px}
 .staff-experience .metric-card{padding:12px;border-radius:13px}
 .staff-experience .section-card{border-radius:14px}
 .staff-experience .section-card__header{padding:16px 13px 12px}
 .staff-experience .org-position{padding:11px;grid-template-columns:37px minmax(0,1fr);gap:8px}
 .staff-experience .org-position__icon{width:37px;height:37px}
 .staff-experience .org-position>.org-change,.staff-experience .org-position>.org-status{grid-column:2;justify-self:start}
 .staff-experience .personnel-member-list article{grid-template-columns:37px minmax(0,1fr) auto;gap:8px}
 .staff-experience .member-avatar{width:37px;height:37px}
 .staff-experience .personnel-member-list .personnel-state{grid-column:2/-1;justify-self:start}
 .staff-experience .staff-area-row{grid-template-columns:1fr}
 .staff-experience .staff-area-row__owners{justify-content:flex-start}
}
`;
