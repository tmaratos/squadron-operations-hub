-- Watching a whole group of channels rather than one at a time.
--
-- The squadron's senior member channels sit together under one Discord category, and naming them
-- individually would mean a channel added next month is silently not read - which is the worst kind of
-- gap, because nothing looks wrong.
--
-- A watched category is stored as itself, and expanded to whatever is inside it at the moment of reading.
ALTER TABLE discord_channels ADD COLUMN kind TEXT NOT NULL DEFAULT 'CHANNEL';
ALTER TABLE discord_channels ADD COLUMN parent_id TEXT;
