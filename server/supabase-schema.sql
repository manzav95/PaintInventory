-- Run this once in Supabase: SQL Editor → New query → paste and Run.
-- Creates tables matching your app. Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  "lastScanned" TEXT,
  "lastScannedBy" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  "minQuantity" INTEGER DEFAULT NULL
);

-- Add minQuantity to existing items table if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'minQuantity') THEN
    ALTER TABLE items ADD COLUMN "minQuantity" INTEGER DEFAULT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('next_id', '1')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES ('min_quantity', '30')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  "itemId" TEXT,
  "userName" TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL
);
