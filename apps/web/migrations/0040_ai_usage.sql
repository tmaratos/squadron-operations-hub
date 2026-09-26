-- What the squadron has spent on Workers AI today, in audio seconds.
--
-- Cloudflare gives every account 10,000 Neurons a day at no charge, and Whisper costs 41.14 Neurons per
-- audio minute - about 243 minutes a day, which is four hours of dictation across the whole squadron and
-- far more than it will ever use. Past that, a Free plan refuses and a Paid plan bills.
--
-- Neither is acceptable as a surprise, so the Hub counts what it uses and stops well short on its own.
-- "It is free" is then a property of the code rather than a hope about how much people talk.
CREATE TABLE IF NOT EXISTS ai_usage (
  -- One row per UTC day, because that is when Cloudflare's allowance resets.
  day TEXT PRIMARY KEY,
  audio_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
