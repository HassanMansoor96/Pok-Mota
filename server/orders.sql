CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY,
 reference varchar(30) NOT NULL UNIQUE,
 idempotency_key uuid NOT NULL UNIQUE,
 request_hash varchar(64) NOT NULL,
 customer jsonb NOT NULL,
 fulfilment varchar(12) NOT NULL CHECK (fulfilment IN ('collection','delivery')),
 items jsonb NOT NULL,
 subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
 delivery_cents integer NOT NULL CHECK (delivery_cents >= 0),
 total_cents integer NOT NULL CHECK (total_cents = subtotal_cents + delivery_cents),
 status varchar(24) NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','fulfilled','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
