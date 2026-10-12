ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar(16) NOT NULL DEFAULT 'eft' CHECK (payment_method IN ('eft','payfast','paystack','stripe'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_checkout jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_transaction varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_transaction ON orders(payment_method,payment_transaction) WHERE payment_transaction IS NOT NULL;
