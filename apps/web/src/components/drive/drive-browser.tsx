"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, File, FileSpreadsheet, FileText, Folder, FolderPlus, Pencil, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import type { DriveFile } from "@/lib/drive/types";

const FOLDER_MIME = "application/vnd.google-apps.folder";

interface FolderLevel {
  id?: string;
  name: string;
}

export function DriveBrowser({ readOnly = false }: { readOnly?: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [needsGoogle, setNeedsGoogle] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderStack, setFolderStack] = useState<FolderLevel[]>([{ name: "TN 170 Command" }]);
  const [search, setSearch] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentFolder = folderStack[folderStack.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const params = new URLSearchParams();
    if (currentFolder.id) params.set("parentId", currentFolder.id);
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/drive/files?${params}`);
    const result = (await response.json()) as { configured?: boolean; needsGoogle?: boolean; files?: DriveFile[]; message?: string };
    if (!response.ok) setMessage(result.message ?? "Drive could not be loaded.");
    setConfigured(result.configured ?? true);
    setNeedsGoogle(Boolean(result.needsGoogle));
    setFiles(result.files ?? []);
    setLoading(false);
  }, [currentFolder.id, search]);

  useEffect(() => { void load(); }, [load]);

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => Number(b.mimeType === FOLDER_MIME) - Number(a.mimeType === FOLDER_MIME) || a.name.localeCompare(b.name)),
    [files]
  );

  async function createFolder(name: string) {
    if (!name.trim()) return;
    const response = await fetch("/api/drive/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "folder", name, parentId: currentFolder.id })
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) setMessage(result.message ?? "Folder creation failed.");
    else { setFolderName(""); setCreatingFolder(false); await load(); }
  }

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    if (currentFolder.id) form.set("parentId", currentFolder.id);
    setMessage(`Uploading ${file.name}…`);
    const response = await fetch("/api/drive/files", { method: "POST", body: form });
    const result = (await response.json()) as { message?: string };
    setMessage(response.ok ? `${file.name} uploaded.` : result.message ?? "Upload failed.");
    if (response.ok) await load();
  }

  async function rename(file: DriveFile, name: string) {
    if (!name.trim() || name === file.name) { setRenamingId(null); return; }
    const response = await fetch(`/api/drive/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) setMessage(result.message ?? "Rename failed.");
    else { setRenamingId(null); setRenameValue(""); await load(); }
  }

  async function remove(file: DriveFile) {
    if (!confirm(`Move “${file.name}” to Google Drive trash?`)) return;
    const response = await fetch(`/api/drive/files/${file.id}`, { method: "DELETE" });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) setMessage(result.message ?? "Delete failed.");
    else await load();
  }

  if (needsGoogle) {
    // Members sign in with their own email, so the Drive comes from a Google account they attach - often a
    // personal Gmail the squadron Drive was shared with. One press, and Google asks which account.
    return (
      <div className="drive-not-configured drive-connect">
        <Folder size={36} />
        <h2>Connect your Google account to see the squadron files</h2>
        <p>The TN 170 Command Shared Drive opens with the Google account it was shared with - your CAP Google
          address or a personal Gmail. Connect it once and the files appear here.</p>
        <a className="button button--primary" href="/api/auth/google/connect?scope=drive">Connect Google</a>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="drive-not-configured">
        <Folder size={36} />
        <h2>Google Shared Drive is ready to connect</h2>
        <p>The app interface is built, but the service-account secrets and TN 170 Command Shared Drive ID have not been added to Cloudflare yet.</p>
      </div>
    );
  }

  return (
    <div className="drive-browser">
      <div className="drive-toolbar">
        <div className="drive-breadcrumbs">
          {folderStack.map((folder, index) => (
            <button key={`${folder.id ?? "root"}-${index}`} onClick={() => setFolderStack((levels) => levels.slice(0, index + 1))}>{folder.name}</button>
          ))}
        </div>
        <label className="drive-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this folder" /></label>
        <button className="icon-button" onClick={() => void load()} aria-label="Refresh Drive"><RefreshCw size={17} /></button>
        {!readOnly ? <>
          <button type="button" className="button button--secondary" aria-expanded={creatingFolder} onClick={() => setCreatingFolder((open) => !open)}><FolderPlus size={16} /> New folder</button>
          <button className="button button--primary" onClick={() => fileInput.current?.click()}><Upload size={16} /> Upload</button>
          <input ref={fileInput} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
        </> : null}
      </div>
      {creatingFolder && !readOnly ? (
        <form className="dx-form" onSubmit={(event) => { event.preventDefault(); void createFolder(folderName.trim()); }}>
          <label htmlFor="dx-new-folder">New folder name</label>
          <input id="dx-new-folder" autoFocus required maxLength={120} value={folderName} placeholder="Example: Aerospace Education"
            onChange={(event) => setFolderName(event.target.value)} />
          <button type="submit" disabled={!folderName.trim()}>Create folder</button>
          <button type="button" onClick={() => { setCreatingFolder(false); setFolderName(""); }}>Cancel</button>
        </form>
      ) : null}
      {message ? <div className="inline-notice" role="status">{message}</div> : null}
      {loading ? <div className="drive-loading" role="status">Loading squadron files…</div> : (
        <>
        <div className="dx-subtitle"><strong>{currentFolder.name}</strong><span>{sortedFiles.length} item{sortedFiles.length === 1 ? "" : "s"}</span></div>
        <div className="drive-file-list">
          {sortedFiles.length ? sortedFiles.map((file) => (
            <article key={file.id}>
              {renamingId === file.id ? (
                <form className="dx-rename" onSubmit={(event) => { event.preventDefault(); void rename(file, renameValue.trim()); }}>
                  <input aria-label={"New name for " + file.name} autoFocus required maxLength={250} value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)} />
                  <button type="submit" disabled={!renameValue.trim()}>Save name</button>
                  <button type="button" onClick={() => setRenamingId(null)}>Cancel</button>
                </form>
              ) : (
                <button type="button" className="drive-file-main"
                  onClick={() => file.mimeType === FOLDER_MIME
                    ? setFolderStack((levels) => [...levels, { id: file.id, name: file.name }])
                    : file.webViewLink ? window.open(file.webViewLink, "_blank", "noopener,noreferrer") : setMessage("This file has no browser link. Try Download instead.")}
                  aria-label={(file.mimeType === FOLDER_MIME ? "Open folder " : "Open file ") + file.name}>
                  <span className="drive-file-icon">{fileIcon(file)}</span>
                  <span><strong>{file.name}</strong><small>{file.mimeType === FOLDER_MIME ? "Folder" : fileTypeLabel(file.mimeType)} · {file.modifiedTime ? formatDate(file.modifiedTime) : "No modified date"}</small></span>
                </button>
              )}
              <div className="drive-file-actions">
                {file.mimeType !== FOLDER_MIME ? <a className="icon-button" href={`/api/drive/download/${file.id}`} aria-label={`Download ${file.name}`}><Download size={16} /><span>Download</span></a> : null}
                {file.webViewLink ? <a className="icon-button" href={file.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} in Google Drive`}><ExternalLink size={16} /><span>Open</span></a> : null}
                {!readOnly ? <>
                  <button type="button" className="icon-button" onClick={() => { setRenamingId(file.id); setRenameValue(file.name); }} aria-label={`Rename ${file.name}`}><Pencil size={16} /><span>Rename</span></button>
                  <button type="button" className="icon-button dx-delete" onClick={() => void remove(file)} aria-label={`Move ${file.name} to trash`}><Trash2 size={16} /><span>Trash</span></button>
                </> : null}
              </div>
            </article>
          )) : <div className="empty-state"><Folder size={26} /><strong>{search.trim() ? "No matching files" : "This folder is empty"}</strong><span>{search.trim() ? "Try another search in this folder." : readOnly ? "There are no files in this folder." : "Upload a file or create a folder to begin."}</span></div>}
        </div>
        </>
      )}
    </div>
  );
}

function fileIcon(file: DriveFile) {
  if (file.mimeType === FOLDER_MIME) return <Folder size={22} />;
  if (file.mimeType.includes("spreadsheet") || file.name.endsWith(".xlsx") || file.name.endsWith(".csv")) return <FileSpreadsheet size={22} />;
  if (file.mimeType.includes("document") || file.mimeType.includes("pdf") || file.name.endsWith(".docx")) return <FileText size={22} />;
  return <File size={22} />;
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("spreadsheet")) return "Spreadsheet";
  if (mimeType.includes("document")) return "Document";
  if (mimeType.includes("presentation")) return "Presentation";
  if (mimeType.startsWith("image/")) return "Image";
  return "File";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
