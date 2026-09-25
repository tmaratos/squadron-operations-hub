-- Following a task you are not doing.
--
-- Plenty of work matters to somebody who is not carrying it: the commander on a finance deadline, the AE
-- officer on an event their cadets are going to. Until now the only way to hear about a task was to be
-- assigned it, which meant people took work they were not doing in order to stay informed - and then the
-- task looked owned when it was not.
CREATE TABLE IF NOT EXISTS item_watchers (
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, user_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS item_watchers_user ON item_watchers(user_id);
