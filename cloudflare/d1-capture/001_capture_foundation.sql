CREATE TABLE IF NOT EXISTS waitlist_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'applyfirst-waitlist',
  email TEXT NOT NULL,
  class_year TEXT,
  interest TEXT,
  school TEXT,
  note TEXT,
  preference_summary TEXT,
  notification_mode TEXT,
  saved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contribution_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'applyfirst-contribution',
  type TEXT,
  name TEXT,
  url TEXT,
  track TEXT,
  program_id TEXT,
  issue_type TEXT,
  reason TEXT,
  note TEXT,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_requests_created_at
ON waitlist_requests (created_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_requests_email
ON waitlist_requests (email);

CREATE INDEX IF NOT EXISTS idx_contribution_requests_created_at
ON contribution_requests (created_at);

CREATE INDEX IF NOT EXISTS idx_contribution_requests_program_id
ON contribution_requests (program_id);
