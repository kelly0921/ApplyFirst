create index if not exists idx_beta_product_events_created_workspace
  on beta_product_events(created_at desc, workspace_id);
