-- 003_homepage_settings.sql
-- Creates the homepage_settings table used by the admin "Página Inicial" tab.
-- Run in Supabase → SQL Editor.
--
-- Safe to run multiple times (IF NOT EXISTS + ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS homepage_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 text UNIQUE NOT NULL,
  collections_enabled boolean DEFAULT true,
  featured_enabled    boolean DEFAULT true,
  collections_title   text DEFAULT 'Coleções',
  featured_title      text DEFAULT 'Destaques',
  collections_order   uuid[] DEFAULT '{}',
  featured_order      uuid[] DEFAULT '{}',
  updated_at          timestamptz DEFAULT now()
);

-- Seed the default row
INSERT INTO homepage_settings (key)
VALUES ('home')
ON CONFLICT (key) DO NOTHING;

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_homepage_settings_updated_at'
  ) THEN
    CREATE TRIGGER trg_homepage_settings_updated_at
      BEFORE UPDATE ON homepage_settings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
