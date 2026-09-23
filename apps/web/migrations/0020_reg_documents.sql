-- Which squadron documents the Hub has read, and what came of it.
--
-- Kept so a document is not read twice for nothing, so a file that changed gets read again, and so a
-- member can see why a duty exists - the document, when it was read, and what it produced.
CREATE TABLE IF NOT EXISTS reg_documents (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT,
  web_view_link TEXT,
  -- Drive's own modified time when it was last read, so an edited regulation is read afresh.
  modified_time TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'READ', 'FAILED', 'SKIPPED')),
  characters INTEGER NOT NULL DEFAULT 0,
  duties_found INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reg_documents_status ON reg_documents(status, created_at DESC);
