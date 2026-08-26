-- Large demo-only seed: 200 items in each public Lost & Found category.
-- Rows are identified by deterministic DEMO-LF identifiers and are safe to rerun.
WITH categories AS (
  SELECT * FROM (VALUES
    ('Phone', 'Smartphone', 'Black smartphone with a clear case. Owner should verify the lock screen and remembered details.', 'DEMO-PHONE-', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80'),
    ('Bag', 'Backpack', 'Everyday backpack with distinctive stitching and a front pocket. Contents are withheld for safe matching.', 'DEMO-BAG-', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80'),
    ('Documents', 'Documents', 'Document folder containing official papers. Personal identification details are withheld.', 'DEMO-DOCS-', 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80'),
    ('Wallet', 'Wallet', 'Leather wallet with cards inside. Contents and personal details are withheld for safe matching.', 'DEMO-WALLET-', 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=80'),
    ('Keys', 'Keys', 'Key ring with several keys and a distinctive tag. Exact access details are withheld.', 'DEMO-KEYS-', 'https://images.unsplash.com/photo-1583001809873-a128495da465?auto=format&fit=crop&w=900&q=80'),
    ('Other', 'Eyeglasses', 'Eyeglasses in a protective case. Owner should verify the frame and case details.', 'DEMO-OTHER-', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80')
  ) AS value(category, item_type, description, identifier_prefix, photo_url)
), districts AS (
  SELECT * FROM (VALUES
    ('Kampala', 'Central Police Station'),
    ('Wakiso', 'Kira Police Station'),
    ('Jinja', 'Jinja Road Police Station'),
    ('Mbarara', 'Mbarara Central Police Station'),
    ('Gulu', 'Gulu Central Police Station'),
    ('Mbale', 'Mbale Central Police Station'),
    ('Mukono', 'Mukono Police Station'),
    ('Masaka', 'Masaka Central Police Station'),
    ('Lira', 'Lira City Police Station'),
    ('Entebbe', 'Entebbe Police Station')
  ) AS value(district, station)
), demo_rows AS (
  SELECT
    category.item_type,
    category.description || ' Demo reference ' || lpad(sequence.number::text, 3, '0') || '.' AS description,
    district.district,
    district.station || ', ' || district.district AS location_text,
    category.identifier_prefix || lpad(sequence.number::text, 3, '0') AS identifier,
    category.photo_url,
    'found' AS kind,
    'found' AS status,
    (now() - ((sequence.number % 45) || ' days')::interval) AS created_at
  FROM categories category
  CROSS JOIN generate_series(1, 200) AS sequence(number)
  JOIN LATERAL (
    SELECT district, station
    FROM districts
    OFFSET ((sequence.number - 1) % 10)
    LIMIT 1
  ) district ON true
)
INSERT INTO public.lost_found_items (
  item_type,
  description,
  district,
  location_text,
  identifier,
  photo_url,
  kind,
  status,
  created_at,
  updated_at
)
SELECT item_type, description, district, location_text, identifier, photo_url, kind, status, created_at, created_at
FROM demo_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lost_found_items existing
  WHERE existing.identifier = demo_rows.identifier
);
