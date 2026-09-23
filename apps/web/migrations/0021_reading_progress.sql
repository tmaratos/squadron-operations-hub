-- Reading a regulation with a small model on squadron hardware takes minutes, which is longer than any
-- browser will wait. The work therefore runs on after the request returns, and this marks a document that
-- is being read right now, so the page can say so instead of looking stuck.
ALTER TABLE reg_documents ADD COLUMN reading_since TEXT;
