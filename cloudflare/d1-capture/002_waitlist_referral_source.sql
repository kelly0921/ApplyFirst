-- Self-reported referral attribution is independent of technical capture source.
-- Existing submissions remain unknown rather than receiving inferred attribution.
ALTER TABLE waitlist_requests ADD COLUMN referral_source TEXT;

CREATE INDEX IF NOT EXISTS idx_waitlist_requests_referral_source
ON waitlist_requests (referral_source);
