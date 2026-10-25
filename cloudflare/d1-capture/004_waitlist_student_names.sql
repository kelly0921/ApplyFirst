-- Names support personalized beta invitations without inferring identity from email addresses.
-- Historical submissions remain valid with NULL values.
ALTER TABLE waitlist_requests ADD COLUMN first_name TEXT;
ALTER TABLE waitlist_requests ADD COLUMN last_name TEXT;
ALTER TABLE waitlist_requests ADD COLUMN email_consent_at TEXT;
ALTER TABLE waitlist_requests ADD COLUMN email_consent_text TEXT;
