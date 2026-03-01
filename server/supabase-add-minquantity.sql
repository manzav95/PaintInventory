-- Run this in Supabase if you get "column minquantity does not exist".
-- Supabase Dashboard → SQL Editor → New query → paste this → Run.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'minQuantity'
  ) THEN
    ALTER TABLE items ADD COLUMN "minQuantity" INTEGER DEFAULT NULL;
  END IF;
END $$;
