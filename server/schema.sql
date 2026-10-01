CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY,
 name varchar(160) NOT NULL,
 set_name varchar(120) NOT NULL,
 card_number varchar(60) NOT NULL DEFAULT '',
 category varchar(12) NOT NULL CHECK (category IN ('single','sealed')),
 rarity varchar(100) NOT NULL DEFAULT '',
 condition varchar(80) NOT NULL DEFAULT '',
 price_cents integer NOT NULL CHECK (price_cents >= 0),
 stock integer NOT NULL CHECK (stock >= 0),
 theme varchar(16) NOT NULL DEFAULT 'mint',
 art varchar(12) NOT NULL DEFAULT '✦',
 tag varchar(50) NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 image_url text NOT NULL DEFAULT '',
 is_published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published,created_at DESC);
