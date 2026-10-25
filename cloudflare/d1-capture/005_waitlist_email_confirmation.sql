-- Historical rows stay eligible without retroactive confirmation.
-- New public waitlist rows opt into confirmation explicitly through email_confirmation_required.
ALTER TABLE waitlist_requests ADD COLUMN email_confirmation_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist_requests ADD COLUMN email_confirmation_token_hash TEXT;
ALTER TABLE waitlist_requests ADD COLUMN email_confirmation_expires_at TEXT;
ALTER TABLE waitlist_requests ADD COLUMN email_confirmation_sent_at TEXT;
ALTER TABLE waitlist_requests ADD COLUMN email_confirmed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_confirmation_token_hash
ON waitlist_requests (email_confirmation_token_hash)
WHERE email_confirmation_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_confirmation_state
ON waitlist_requests (email_confirmation_required, email_confirmed_at);
