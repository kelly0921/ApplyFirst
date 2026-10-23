-- Optional context is only collected for Friend/classmate and Other referrals.
ALTER TABLE waitlist_requests ADD COLUMN referral_detail TEXT;
