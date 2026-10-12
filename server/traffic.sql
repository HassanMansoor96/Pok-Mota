-- Additive visitor analytics storage. No customer or inventory data is changed.
CREATE TABLE IF NOT EXISTS site_page_views (
 id uuid PRIMARY KEY,
 session_hash varchar(64) NOT NULL,
 path varchar(80) NOT NULL,
 referrer varchar(253) NOT NULL DEFAULT '',
 device varchar(10) NOT NULL CHECK (device IN ('mobile','tablet','desktop')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_page_views_created ON site_page_views(created_at);
CREATE INDEX IF NOT EXISTS site_page_views_session ON site_page_views(session_hash,created_at);
-- Extend the existing restricted application roles to this analytics table only.
DO $$
DECLARE app_role text;
BEGIN
 FOR app_role IN SELECT rolname FROM pg_roles
  WHERE rolname ~ '^pm_runtime_[0-9a-f]{12}$'
   AND has_table_privilege(oid,'public.products','SELECT')
 LOOP
  EXECUTE format('GRANT SELECT, INSERT, DELETE ON public.site_page_views TO %I',app_role);
 END LOOP;
END $$;
