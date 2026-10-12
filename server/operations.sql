CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash varchar(64) PRIMARY KEY,
 csrf_token varchar(64) NOT NULL,
 credential_version varchar(64) NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limit_counters (
 bucket varchar(50) NOT NULL,
 key_hash varchar(64) NOT NULL,
 hits integer NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(bucket,key_hash)
);
CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limit_counters(expires_at);
CREATE TABLE IF NOT EXISTS account_recovery_tokens (
 token_hash varchar(64) PRIMARY KEY,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_checked_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider_status varchar(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason varchar(32);
CREATE INDEX IF NOT EXISTS pending_orders_age ON orders(created_at) WHERE status='pending_payment';
CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_erased_at timestamptz;
CREATE TABLE IF NOT EXISTS admin_totp_used (
 credential_version varchar(64) NOT NULL,
 time_step bigint NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(credential_version,time_step)
);
