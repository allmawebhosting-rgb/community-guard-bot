-- Demo-only seed data for the public Lost & Found experience.
-- Every row is marked with a DEMO identifier so it can be removed safely.
INSERT INTO public.lost_found_items (
  item_type,
  description,
  district,
  location_text,
  identifier,
  photo_url,
  kind,
  status
)
SELECT *
FROM (
  VALUES
    (
      'Smartphone',
      'Black phone with a slim case. Owner may recognise the lock-screen sticker.',
      'Kampala',
      'Central Police Station, Kampala',
      'DEMO-LF-0951',
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Leather wallet',
      'Brown leather wallet containing cards. Contents are withheld for safe matching.',
      'Wakiso',
      'Kira Police Station, Wakiso',
      'DEMO-LF-4428',
      'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Backpack',
      'Navy backpack with a stitched grey panel and a small side key loop.',
      'Mbarara',
      'Mbarara Central Police Station',
      'DEMO-LF-7814',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Documents',
      'Clear document folder with an official card inside. Personal numbers are masked.',
      'Jinja',
      'Jinja Road Police Station',
      'DEMO-LF-2367',
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Keys',
      'Three keys on a red fabric loop with a small silver tag.',
      'Entebbe',
      'Entebbe Police Station',
      'DEMO-LF-6093',
      'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Tablet',
      'Silver tablet in a dark folio cover. Serial details are withheld for verification.',
      'Gulu',
      'Gulu Central Police Station',
      'DEMO-LF-3186',
      'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    )
) AS demo(item_type, description, district, location_text, identifier, photo_url, kind, status)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lost_found_items existing
  WHERE existing.identifier = demo.identifier
);
