-- These columns now exist in 001_watch_foundation.sql for fresh databases.
-- Production databases that predate that baseline received them when this
-- migration was first applied, so only the idempotent indexes remain here.

create unique index if not exists idx_watch_requests_unsubscribe_token
  on watch_requests(unsubscribe_token)
  where unsubscribe_token is not null and unsubscribe_token != '';

create index if not exists idx_watch_requests_unsubscribed_at
  on watch_requests(unsubscribed_at);
