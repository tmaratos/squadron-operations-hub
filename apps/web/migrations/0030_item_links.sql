-- One task's bearing on another.
--
-- The squadron already writes these by hand, in capitals, inside task titles: "COMMAND DECISION - FY2027
-- finance committee ... (BLOCKS CAPF 172, 15 Sep)", and two events on 17 Oct that each say in their own
-- name that they conflict with the other. A title is a bad place for a fact about two things, because
-- nothing can check it, nothing updates when one of them moves, and the second one is usually forgotten.
--
-- BLOCKS is directional: from_item must be finished before to_item can be. RELATES is not - it is for
-- things that bear on each other, like two activities competing for the same Saturday.
CREATE TABLE IF NOT EXISTS item_links (
  id TEXT PRIMARY KEY,
  from_item_id TEXT NOT NULL,
  to_item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('BLOCKS', 'RELATES')),
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (to_item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- The same link is not recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS item_links_once ON item_links(from_item_id, to_item_id, kind);
CREATE INDEX IF NOT EXISTS item_links_to ON item_links(to_item_id);
