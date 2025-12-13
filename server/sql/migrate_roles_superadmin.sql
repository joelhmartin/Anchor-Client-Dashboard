-- One-time role migration:
-- - admin   -> superadmin
-- - editor  -> admin
--
-- Run once (after deploying code that understands superadmin/admin):
--   psql "$DATABASE_URL" -f server/sql/migrate_roles_superadmin.sql

BEGIN;

UPDATE users SET role = 'superadmin' WHERE role = 'admin';
UPDATE users SET role = 'admin' WHERE role = 'editor';

COMMIT;


