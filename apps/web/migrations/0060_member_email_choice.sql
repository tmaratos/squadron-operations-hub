-- A member's own answer, which beats the squadron's.
--
-- The squadron-wide switch turns email off for everybody at once, which is what was asked for when members
-- complained. But it was a ceiling: with it off, a member who actually wanted the daily summary could not
-- have it, and there was no way to say so. One person's complaint became everybody's setting.
--
-- So the squadron setting becomes the default rather than the limit, and a member may answer for themselves:
--
--   FOLLOW  do whatever the squadron is doing. What everybody starts on.
--   ALWAYS  email me, even when the squadron has switched it off.
--   NEVER   do not email me, even when the squadron has it on.
--
-- The existing column is kept and kept in step, because it is read in several places including the notifier
-- worker, and a second source of truth that disagreed would be worse than the limitation it replaced.
ALTER TABLE notification_prefs ADD COLUMN email_choice TEXT NOT NULL DEFAULT 'FOLLOW'
  CHECK (email_choice IN ('FOLLOW', 'ALWAYS', 'NEVER'));

-- Somebody who had already turned their email off said NEVER, and meant it. Everybody else was on the default
-- rather than having chosen, so they follow the squadron - which on the day this runs means no change at all.
UPDATE notification_prefs SET email_choice = 'NEVER' WHERE email_enabled = 0;
