# Supabase Setup Draft

This is a planning artifact for the future backend. The current ApplyFirst prototype does not require Supabase to run.

## Migration

The draft schema lives at:

```bash
supabase/migrations/001_monitoring_foundation.sql
```

It creates the first durable version of:

- `programs`
- `official_sources`
- `page_snapshots`
- `source_checks`
- `alert_candidates`
- `saved_programs`
- `alert_preferences`

## Seed Data

Generate backend-ready seed JSON from the current prototype data:

```bash
npm run monitor:seed
```

Write a local generated file for inspection:

```bash
npm run monitor:seed:write
```

The generated file is intentionally gitignored:

```bash
data/monitoring-seed.generated.json
```

Generate SQL upserts for the first import:

```bash
npm run monitor:seed:sql
```

Write the SQL locally:

```bash
npm run monitor:seed:sql:write
```

The generated SQL is intentionally gitignored:

```bash
supabase/seed.generated.sql
```

## Import Plan

When a Supabase project exists:

1. Run the migration.
2. Generate `data/monitoring-seed.generated.json`.
3. Generate `supabase/seed.generated.sql`.
4. Review the generated SQL.
5. Run the seed SQL to upsert `programs` and `official_sources`.
6. Keep `page_snapshots`, `source_checks`, and `alert_candidates` empty until scheduled monitoring exists.

## Security Notes

The migration includes public read access for `programs` and enabled `official_sources`.

Maintainer write policies are intentionally not defined yet. They should wait until the app has a clear admin role model.

User-owned tables, `saved_programs` and `alert_preferences`, are scoped to `auth.uid()`.
