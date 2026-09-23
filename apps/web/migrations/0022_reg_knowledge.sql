-- What the squadron's documents actually say, kept so they only have to be read once.
--
-- Reading a regulation with a small model takes minutes. Doing that again every time somebody asks a
-- question would be absurd, and trusting the model's own memory of CAP regulations is worse: general
-- models state form numbers and deadlines confidently and wrongly. So the text is kept here, and a
-- question is answered from the squadron's own documents, with the passage it came from.
CREATE TABLE IF NOT EXISTS reg_chunks (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  web_view_link TEXT,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reg_chunks_document ON reg_chunks(drive_file_id, ordinal);

-- Full text search over those passages. D1 carries SQLite's FTS5, so finding the relevant paragraph is a
-- query rather than another trip through the model.
CREATE VIRTUAL TABLE IF NOT EXISTS reg_search USING fts5(
  chunk_id UNINDEXED,
  document_name,
  text
);
