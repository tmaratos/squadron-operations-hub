/** Document browser presentation; existing Google Drive API remains unchanged. */
export const documentExperienceCss = String.raw`
.dx{display:grid;gap:17px;min-width:0}
.dx .drive-browser{min-height:360px}
.dx .drive-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:18px;border-bottom:1px solid var(--border-soft);background:var(--surface);border-radius:17px 17px 0 0}
.dx .drive-breadcrumbs{display:flex;align-items:center;gap:5px;flex:1 1 100%;overflow-x:auto;min-height:38px}
.dx .drive-breadcrumbs button{font-size:13px;font-weight:650;min-height:38px;padding:8px 10px;border-radius:10px;color:var(--text);white-space:nowrap}
.dx .drive-breadcrumbs button:hover{background:var(--surface-high);color:var(--accent)}
.dx .drive-breadcrumbs button:last-child{font-weight:800;color:var(--accent)}
.dx .drive-search{flex:1 1 270px;max-width:none;width:auto;height:46px;background:var(--surface-alt);border-radius:11px;padding:0 12px;color:var(--muted-strong)}
.dx .drive-search input{height:44px;width:100%;font-size:15px;color:var(--text);outline:none}
.dx .drive-toolbar .button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:11px;min-height:45px;padding:0 15px;font-size:13px;font-weight:750;white-space:nowrap}
.dx .drive-toolbar .button--primary{background:#2559bd;border-color:#2559bd;color:#fff}
.dx .drive-toolbar .button--secondary{background:var(--surface-alt);border-color:var(--border);color:var(--text)}
.dx .drive-toolbar .icon-button{width:44px;height:44px;border-radius:11px;border:1px solid var(--border)}
.dx .drive-toolbar .icon-button:hover{background:var(--surface-high);color:var(--accent)}
.dx .drive-file-list{display:grid;gap:0;padding:5px 17px 19px}
.dx .drive-file-list article{display:flex;align-items:center;gap:12px;min-height:77px;padding:11px 3px;border-bottom:1px solid var(--border-soft);min-width:0}
.dx .drive-file-main{display:flex;align-items:center;gap:14px;flex:1;min-width:0;padding:6px 3px;text-align:left;color:var(--text);border-radius:11px}
.dx .drive-file-main:hover{background:var(--surface-high)}
.dx .drive-file-main >span:nth-child(2){display:grid;gap:6px;min-width:0}
.dx .drive-file-main strong{font-size:14px;font-weight:750;line-height:1.4;color:var(--text);white-space:normal;overflow-wrap:anywhere;text-overflow:clip}
.dx .drive-file-main small{font-size:12px;line-height:1.45;color:var(--muted-strong)}
.dx .drive-file-icon{width:45px;height:45px;flex:none;border-radius:13px;color:#2459bd;background:#eaf1ff}
html[data-theme=dark] .dx .drive-file-icon{color:#a8c9ff;background:#254263}
.dx .drive-file-actions{display:flex;align-items:center;justify-content:flex-end;gap:3px;flex-wrap:wrap;flex:none}
.dx .drive-file-actions .icon-button{display:flex;align-items:center;gap:6px;padding:8px 9px;min-height:40px;width:auto;color:var(--muted-strong);border:1px solid transparent;border-radius:9px;font-size:12px;font-weight:650;text-decoration:none}
.dx .drive-file-actions .icon-button:hover{background:var(--surface-high);color:var(--accent);border-color:var(--border)}
.dx .drive-file-actions .dx-delete:hover{color:#bd2d46;border-color:#e6a5ad}
.dx .drive-loading{font-size:14px}
.dx .drive-not-configured{min-height:280px;padding:30px 20px;gap:12px}
.dx .drive-not-configured h2{font-size:19px}
.dx .drive-not-configured p{font-size:13px}
.dx .inline-notice{margin:14px 17px 0;font-size:13px;background:var(--surface-high);border-color:var(--border);color:var(--text);line-height:1.5}
.dx-form{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--surface-alt)}
.dx-form label{font-size:13px;font-weight:700;color:var(--text)}
.dx-form input{flex:1 1 220px;min-width:0;min-height:42px;font-size:16px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
.dx-form button{min-height:42px;border-radius:10px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:var(--surface)}
.dx-form button[type=submit]{background:#2459bd;border-color:#2459bd;color:white}
.dx-rename{display:flex;align-items:center;gap:7px;flex:1;min-width:0;flex-wrap:wrap}
.dx-rename input{flex:1 1 160px;min-width:0;min-height:43px;font-size:16px;border:1px solid var(--border);padding:8px;border-radius:9px;background:var(--surface)}
.dx-rename button{border:1px solid var(--border);border-radius:9px;min-height:40px;padding:8px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;background:var(--surface-alt);color:var(--text)}
.dx-rename button[type=submit]{background:#2459bd;color:#fff;border-color:#2459bd}
.dx-subtitle{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px 8px;color:var(--muted-strong);font-size:12px;font-weight:600}
.dx-subtitle strong{color:var(--text);font-size:13px}
.dx :where(a,button,input):focus-visible{outline:3px solid #4c8bf8;outline-offset:2px}
@media(max-width:950px){.dx .drive-file-list article{align-items:flex-start;flex-wrap:wrap}.dx .drive-file-actions{margin-left:58px;justify-content:flex-start}}
@media(max-width:650px){
 .dx .drive-toolbar{padding:12px;gap:8px}.dx .drive-search{flex-basis:calc(100% - 54px);order:1}
 .dx .drive-toolbar .icon-button{order:2}.dx .drive-toolbar .button{flex:1;order:3;min-height:45px;padding:8px;font-size:12px}
 .dx .drive-file-list{padding:4px 12px 15px}
 .dx .drive-file-list article{padding:13px 2px;gap:5px}
 .dx .drive-file-main{flex-basis:100%;gap:10px}.dx .drive-file-icon{width:40px;height:40px}
 .dx .drive-file-main strong{font-size:14px}.dx .drive-file-main small{font-size:11.5px}
 .dx .drive-file-actions{margin-left:44px;gap:2px}
 .dx .drive-file-actions .icon-button{min-height:42px;padding:7px;font-size:11px}
 .dx .drive-file-actions .icon-button svg{width:14px;height:14px}
 .dx .drive-breadcrumbs{order:0}.dx .drive-breadcrumbs button{font-size:12px}
 .dx-subtitle{padding:13px 12px 7px}
 .dx-form{padding:12px}.dx-form label{flex-basis:100%}
}
`;
