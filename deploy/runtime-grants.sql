-- Run as the migration owner, after migrations, via psql in a protected session.
-- runtime_role is an operator-supplied psql identifier variable, not a password.
-- Create the non-owner LOGIN role and provision its password through the host's
-- protected credential workflow before these grants; never put passwords here.
ALTER ROLE :"runtime_role" NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE, TEMPORARY ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON
 products, orders, customers, customer_sessions, admin_sessions,
 rate_limit_counters, account_recovery_tokens, admin_totp_used TO :"runtime_role";
ALTER ROLE :"runtime_role" SET search_path TO public;
ALTER ROLE :"runtime_role" SET statement_timeout TO '20s';
-- No owner membership, CREATE, TRUNCATE, role management, or grants on future
-- tables. Review and add explicit DML grants when migrations add a new table.
