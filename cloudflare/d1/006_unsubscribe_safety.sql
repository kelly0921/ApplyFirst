alter table watch_requests add column unsubscribe_token text;
alter table watch_requests add column unsubscribed_at text;
alter table watch_requests add column unsubscribe_reason text;

create unique index if not exists idx_watch_requests_unsubscribe_token
  on watch_requests(unsubscribe_token)
  where unsubscribe_token is not null and unsubscribe_token != '';

create index if not exists idx_watch_requests_unsubscribed_at
  on watch_requests(unsubscribed_at);
