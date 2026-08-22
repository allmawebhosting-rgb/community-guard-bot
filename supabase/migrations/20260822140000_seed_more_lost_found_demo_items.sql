-- Additional demo-only Lost & Found items.
-- Identifiers make this seed safe to rerun without duplicates.
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
      'Handbag',
      'Small black handbag with a brass clasp and a patterned lining.',
      'Kampala',
      'Kampala Central Police Station',
      'DEMO-LF-8246',
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Smartphone',
      'Blue smartphone with a clear case and a small white mark near the camera.',
      'Mukono',
      'Mukono Police Station',
      'DEMO-LF-5172',
      'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'National documents',
      'Document wallet containing official papers. Personal identification details are withheld.',
      'Masaka',
      'Masaka Central Police Station',
      'DEMO-LF-6405',
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Travel bag',
      'Compact grey travel bag with a red luggage tag and two front pockets.',
      'Fort Portal',
      'Fort Portal Police Station',
      'DEMO-LF-2938',
      'https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Key ring',
      'Four keys on a blue ring with a small wooden bead.',
      'Wakiso',
      'Kakiri Police Post, Wakiso',
      'DEMO-LF-9061',
      'https://images.unsplash.com/photo-1583001809873-a128495da465?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Wristwatch',
      'Silver wristwatch with a dark face and a brown leather strap.',
      'Mbale',
      'Mbale Central Police Station',
      'DEMO-LF-1749',
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Laptop',
      'Dark laptop sleeve containing a compact laptop. Serial details are withheld for verification.',
      'Kabarole',
      'Kabarole Police Station',
      'DEMO-LF-3620',
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    ),
    (
      'Eyeglasses',
      'Black rectangular eyeglasses in a navy hard case.',
      'Lira',
      'Lira City Police Station',
      'DEMO-LF-7584',
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80',
      'found',
      'found'
    )
) AS demo(item_type, description, district, location_text, identifier, photo_url, kind, status)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lost_found_items existing
  WHERE existing.identifier = demo.identifier
);
