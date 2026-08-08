-- Starter Uganda Police stations for officer onboarding.
-- The name guard keeps this migration safe to run more than once.

INSERT INTO public.police_stations (
  name,
  code,
  district,
  region,
  coverage_area,
  phone
)
SELECT
  seed.name,
  seed.code,
  seed.district,
  seed.region,
  seed.coverage_area,
  seed.phone
FROM (
  VALUES
    (
      'Central Police Station Kampala',
      'CPS-KLA',
      'Kampala',
      'Central',
      'Kampala Central Division',
      '0800199399'
    ),
    (
      'Jinja Road Police Station',
      'JINJA-RD',
      'Kampala',
      'Central',
      'Nakawa Division',
      '0800199399'
    ),
    (
      'Kawempe Police Station',
      'KAWEMPE',
      'Kampala',
      'Central',
      'Kawempe Division',
      '0800199399'
    ),
    (
      'Katwe Police Station',
      'KATWE',
      'Kampala',
      'Central',
      'Makindye Division',
      '0800199399'
    ),
    (
      'Entebbe Police Station',
      'ENTEBBE',
      'Wakiso',
      'Central',
      'Entebbe Municipality',
      '0800199399'
    ),
    (
      'Mukono Police Station',
      'MUKONO',
      'Mukono',
      'Central',
      'Mukono Municipality',
      '0800199399'
    ),
    (
      'Jinja Central Police Station',
      'JINJA-CPS',
      'Jinja',
      'Eastern',
      'Jinja City',
      '0800199399'
    ),
    (
      'Mbale Central Police Station',
      'MBALE-CPS',
      'Mbale',
      'Eastern',
      'Mbale City',
      '0800199399'
    ),
    (
      'Gulu Central Police Station',
      'GULU-CPS',
      'Gulu',
      'Northern',
      'Gulu City',
      '0800199399'
    ),
    (
      'Lira Police Station',
      'LIRA',
      'Lira',
      'Northern',
      'Lira City',
      '0800199399'
    ),
    (
      'Mbarara Central Police Station',
      'MBARARA-CPS',
      'Mbarara',
      'Western',
      'Mbarara City',
      '0800199399'
    ),
    (
      'Fort Portal Police Station',
      'FORT-PORTAL',
      'Kabarole',
      'Western',
      'Fort Portal City',
      '0800199399'
    )
) AS seed(name, code, district, region, coverage_area, phone)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.police_stations existing
  WHERE existing.name = seed.name
);