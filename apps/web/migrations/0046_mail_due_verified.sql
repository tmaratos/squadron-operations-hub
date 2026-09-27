-- Whether the date on a suggestion was found in the email's own words, or only asserted by the assistant.
--
-- It matters because of what the date is now allowed to do. A suggestion waits for somebody to read it, so a
-- date the model invented costs a moment of confusion. A date that creates a task and sets four reminders
-- without anybody pressing anything costs more than that, and a made-up one would be indistinguishable from
-- a real deadline by the time it reached the squadron.
--
-- So the date is checked against the message text, and only a date the email actually contains can create
-- work on its own. Existing rows default to 0 - unverified - because nothing checked them when they were
-- written, and assuming otherwise would be the same mistake.

ALTER TABLE mail_suggestions ADD COLUMN due_verified INTEGER NOT NULL DEFAULT 0;
