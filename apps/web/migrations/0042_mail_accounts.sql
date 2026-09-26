-- More than one Gmail account per member.
--
-- People keep squadron business in more than one mailbox. A senior member has a CAP address and the
-- personal one everybody actually emails them on; somebody running an activity has a third for it. Reading
-- only the account they happened to sign in with means the Hub sees part of the picture and says nothing
-- about the rest, which is worse than not looking - it looks like there is nothing there.
--
-- Deliberately separate from the account they sign in with. That one proves who they are and reaches the
-- squadron Drive, and nothing here touches it: these are read-only mail connections, added and removed
-- freely, and losing one cannot lock anybody out of anything.
CREATE TABLE IF NOT EXISTS user_mail_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- The address, shown so somebody can tell their three accounts apart.
  email TEXT NOT NULL,
  -- Google's own id for the account, which is what makes "the same account twice" detectable even when
  -- somebody has changed the address on it.
  google_subject TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT NOT NULL,
  scopes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, google_subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_mail_accounts_user ON user_mail_accounts(user_id);
