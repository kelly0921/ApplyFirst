alter table beta_invitations add column recipient_email_hash text;

create index if not exists idx_beta_invitations_recipient_email
  on beta_invitations(recipient_email_hash, status);
