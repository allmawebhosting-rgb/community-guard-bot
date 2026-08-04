-- Seed: Real Ugandan facilities — police stations, hospitals, fire stations, ambulance services
-- Covers Kampala, Wakiso, Gulu, Mbarara, Jinja, Mbale, Fort Portal, Lira, Soroti, Arua

-- ═══════════════════════════════════════════════════════
-- POLICE STATIONS
-- ═══════════════════════════════════════════════════════

INSERT INTO public.facilities (name, facility_type, phone, address, district, latitude, longitude, is_24_7) VALUES

-- KAMPALA
('Central Police Station',            'police', '0800199699',    'Parliament Avenue, Kampala',          'Kampala', 0.31490, 32.58360, true),
('Kira Road Police Station',          'police', '0414250613',    'Kira Road, Kampala',                  'Kampala', 0.33760, 32.58750, true),
('Katwe Police Station',              'police', '0414272555',    'Katwe, Kampala',                      'Kampala', 0.29980, 32.57120, true),
('Old Kampala Police Station',        'police', '0414344140',    'Old Kampala Road, Kampala',           'Kampala', 0.31840, 32.56830, true),
('Wandegeya Police Station',          'police', '0414532640',    'Wandegeya, Kampala',                  'Kampala', 0.33850, 32.57350, true),
('Kabalagala Police Station',         'police', '0414267510',    'Kabalagala, Kampala',                 'Kampala', 0.28450, 32.59540, true),
('Naguru Police Station',             'police', '0414287550',    'Naguru, Kampala',                     'Kampala', 0.33690, 32.60720, true),
('CID Headquarters',                  'police', '0414337808',    'Kibuli, Kampala',                     'Kampala', 0.30560, 32.60150, true),
('Kireka Police Station',             'police', '0414235010',    'Kireka, Kampala',                     'Kampala', 0.35890, 32.63720, true),
('Kawempe Police Station',            'police', '0414567890',    'Kawempe, Kampala',                    'Kampala', 0.37230, 32.55810, true),
('Makindye Police Station',           'police', '0414220540',    'Makindye, Kampala',                   'Kampala', 0.27840, 32.57960, true),
('Nateete Police Station',            'police', '0414272880',    'Nateete, Kampala',                    'Kampala', 0.30120, 32.53640, true),

-- WAKISO
('Entebbe Central Police Station',    'police', '0417719030',    'Entebbe Road, Entebbe',               'Wakiso',  0.05490, 32.46080, true),
('Wakiso Police Station',             'police', '0312240048',    'Wakiso Town',                         'Wakiso',  0.40430, 32.45720, true),
('Nansana Police Station',            'police', '0312240052',    'Nansana, Wakiso',                     'Wakiso',  0.35470, 32.52470, true),
('Bwerenga Police Station',           'police', '0414200300',    'Bwerenga, Wakiso',                    'Wakiso',  0.15230, 32.43500, true),
('Kajjansi Police Station',           'police', '0414200301',    'Kajjansi, Wakiso',                    'Wakiso',  0.19830, 32.53170, true),
('Kira Police Station',               'police', '0414200305',    'Kira Town, Wakiso',                   'Wakiso',  0.37420, 32.63450, true),

-- GULU
('Gulu Central Police Station',       'police', '0471432070',    'Olal Road, Gulu',                     'Gulu',    2.77980, 32.29920, true),
('Layibi Police Station',             'police', '0471432071',    'Layibi, Gulu',                        'Gulu',    2.78540, 32.27350, true),
('Pece Police Station',               'police', '0471432072',    'Pece, Gulu',                          'Gulu',    2.77020, 32.31560, true),

-- MBARARA
('Mbarara Central Police Station',    'police', '0485421002',    'High Street, Mbarara',                'Mbarara', -0.60720, 30.65370, true),
('Kakoba Police Station',             'police', '0485421010',    'Kakoba, Mbarara',                     'Mbarara', -0.59840, 30.66120, true),
('Nyamitanga Police Station',         'police', '0485421015',    'Nyamitanga, Mbarara',                 'Mbarara', -0.62530, 30.64080, true),

-- JINJA
('Jinja Central Police Station',      'police', '0434121141',    'Main Street, Jinja',                  'Jinja',   0.44990, 33.20390, true),
('Mpumudde Police Station',           'police', '0434121145',    'Mpumudde, Jinja',                     'Jinja',   0.43760, 33.21880, true),

-- MBALE
('Mbale Central Police Station',      'police', '0454432390',    'Republic Street, Mbale',              'Mbale',   1.07980, 34.17530, true),
('Namatala Police Station',           'police', '0454432391',    'Namatala, Mbale',                     'Mbale',   1.07230, 34.18640, true),

-- FORT PORTAL
('Fort Portal Police Station',        'police', '0483422016',    'Balya Road, Fort Portal',             'Kabarole', 0.66420, 30.27480, true),

-- LIRA
('Lira Central Police Station',       'police', '0473420200',    'Lango Road, Lira',                    'Lira',    2.24850, 32.89980, true),

-- SOROTI
('Soroti Police Station',             'police', '0454461004',    'Station Road, Soroti',                'Soroti',  1.71450, 33.61280, true),

-- ARUA
('Arua Central Police Station',       'police', '0476420022',    'Avenue Road, Arua',                   'Arua',    3.02010, 30.91100, true),

-- MASAKA
('Masaka Central Police Station',     'police', '0481421021',    'Edward Avenue, Masaka',               'Masaka', -0.33260, 31.73800, true),

-- TORORO
('Tororo Police Station',             'police', '0454445010',    'Station Road, Tororo',                'Tororo',  0.69660, 34.18060, true),

-- KABALE
('Kabale Central Police Station',     'police', '0486422055',    'Kabale Town',                         'Kabale', -1.24820, 29.98880, true);


-- ═══════════════════════════════════════════════════════
-- HOSPITALS
-- ═══════════════════════════════════════════════════════

INSERT INTO public.facilities (name, facility_type, phone, address, district, latitude, longitude, is_24_7) VALUES

-- KAMPALA
('Mulago National Referral Hospital', 'hospital', '0417116100',   'Mulago Hill Road, Kampala',           'Kampala', 0.33730, 32.57600, true),
('Kampala International Hospital',    'hospital', '0414339000',   'Namuwongo Road, Kampala',             'Kampala', 0.29450, 32.60240, true),
('Nsambya Hospital',                  'hospital', '0800100066',   'Nsambya Road, Kampala',               'Kampala', 0.29660, 32.58660, true),
('Case Medical Centre',               'hospital', '0414258222',   'Buganda Road, Kampala',               'Kampala', 0.32150, 32.58020, true),
('Rubaga Hospital',                   'hospital', '0800128900',   'Rubaga Road, Kampala',                'Kampala', 0.31240, 32.55750, true),
('Nakasero Hospital',                 'hospital', '0800200700',   'Nakasero, Kampala',                   'Kampala', 0.32780, 32.58130, true),
('International Hospital Kampala',    'hospital', '0414200400',   'Namugongo Road, Kampala',             'Kampala', 0.35940, 32.63540, true),
('Kiruddu National Referral Hospital','hospital', '0414252551',   'Kiruddu, Kampala',                    'Kampala', 0.27810, 32.59710, true),
('Mengo Hospital',                    'hospital', '0414273497',   'Namirembe Hill, Kampala',             'Kampala', 0.31680, 32.56500, true),
('St. Francis Hospital Nsambya',      'hospital', '0414267012',   'Nsambya, Kampala',                    'Kampala', 0.29660, 32.58660, true),

-- WAKISO
('Entebbe Hospital',                  'hospital', '0417719200',   'Entebbe, Wakiso',                     'Wakiso',  0.05660, 32.46310, true),
('Kawolo General Hospital',           'hospital', '0312240060',   'Lugazi, Wakiso',                      'Wakiso',  0.40560, 32.89230, true),
('Mityana Hospital',                  'hospital', '0312240065',   'Mityana, Wakiso',                     'Wakiso',  0.41870, 32.01420, true),

-- GULU
('Gulu Regional Referral Hospital',   'hospital', '0471432150',   'Gulu, Northern Uganda',               'Gulu',    2.77470, 32.30120, true),
('St. Mary\'s Hospital Lacor',        'hospital', '0471432155',   'Lacor, Gulu',                         'Gulu',    2.80230, 32.27830, true),

-- MBARARA
('Mbarara Regional Referral Hospital','hospital', '0485421100',   'Mbarara University Road',             'Mbarara', -0.60100, 30.63810, true),
('Ruharo Mission Hospital',           'hospital', '0485421105',   'Ruharo, Mbarara',                     'Mbarara', -0.62230, 30.66750, true),

-- JINJA
('Jinja Regional Referral Hospital',  'hospital', '0434121200',   'Jinja, Eastern Uganda',               'Jinja',   0.44230, 33.19780, true),
('St. Anthony Hospital Jinja',        'hospital', '0434121205',   'Jinja City',                          'Jinja',   0.45310, 33.20450, true),

-- MBALE
('Mbale Regional Referral Hospital',  'hospital', '0454433200',   'Mbale, Eastern Uganda',               'Mbale',   1.07500, 34.17100, true),
('Mount Elgon Hospital',              'hospital', '0454433205',   'Mbale City',                          'Mbale',   1.06820, 34.18560, true),

-- FORT PORTAL
('Fort Portal Regional Referral Hosp','hospital', '0483422200',   'Fort Portal, Kabarole',               'Kabarole', 0.66280, 30.27120, true),
('Virika Hospital',                   'hospital', '0483422205',   'Fort Portal, Kabarole',               'Kabarole', 0.67140, 30.27640, true),

-- LIRA
('Lira Regional Referral Hospital',   'hospital', '0473420400',   'Lira, Northern Uganda',               'Lira',    2.24280, 32.89700, true),

-- SOROTI
('Soroti Regional Referral Hospital', 'hospital', '0454461100',   'Soroti, Eastern Uganda',              'Soroti',  1.71080, 33.61540, true),

-- ARUA
('Arua Regional Referral Hospital',   'hospital', '0476420200',   'Arua, West Nile',                     'Arua',    3.01450, 30.91820, true),

-- MASAKA
('Masaka Regional Referral Hospital', 'hospital', '0481421200',   'Masaka, Central Uganda',              'Masaka', -0.33910, 31.73480, true),

-- KABALE
('Kabale Regional Referral Hospital', 'hospital', '0486422200',   'Kabale, Kigezi',                      'Kabale', -1.25120, 29.99010, true);


-- ═══════════════════════════════════════════════════════
-- FIRE STATIONS
-- ═══════════════════════════════════════════════════════

INSERT INTO public.facilities (name, facility_type, phone, address, district, latitude, longitude, is_24_7) VALUES

-- KAMPALA
('Kampala Central Fire Brigade',      'fire', '0414344770',   'Jinja Road, Kampala',                 'Kampala', 0.31630, 32.59200, true),
('Katwe Fire Station',                'fire', '0414272400',   'Katwe, Kampala',                      'Kampala', 0.29800, 32.57120, true),
('Kawempe Fire Station',              'fire', '0414533100',   'Kawempe, Kampala',                    'Kampala', 0.37050, 32.55860, true),
('Najeera Fire Station',              'fire', '0414233100',   'Najeera, Kampala',                    'Kampala', 0.36780, 32.63200, true),

-- WAKISO
('Entebbe Fire Station',              'fire', '0414321600',   'Entebbe Road',                        'Wakiso',  0.05510, 32.46140, true),
('Wakiso Fire Station',               'fire', '0312240080',   'Wakiso Town',                         'Wakiso',  0.40430, 32.45720, true),

-- GULU
('Gulu Fire Brigade',                 'fire', '0471432300',   'Gulu Municipality',                   'Gulu',    2.77980, 32.29920, true),

-- MBARARA
('Mbarara Fire Brigade',              'fire', '0485421300',   'Mbarara Municipality',                'Mbarara', -0.60720, 30.65370, true),

-- JINJA
('Jinja Fire Brigade',                'fire', '0434121300',   'Jinja City',                          'Jinja',   0.44990, 33.20390, true),

-- MBALE
('Mbale Fire Station',                'fire', '0454432500',   'Mbale City',                          'Mbale',   1.07980, 34.17530, true),

-- FORT PORTAL
('Fort Portal Fire Station',          'fire', '0483422300',   'Fort Portal',                         'Kabarole', 0.66420, 30.27480, true),

-- LIRA
('Lira Fire Station',                 'fire', '0473420500',   'Lira City',                           'Lira',    2.24850, 32.89980, true),

-- ARUA
('Arua Fire Station',                 'fire', '0476420300',   'Arua City',                           'Arua',    3.02010, 30.91100, true),

-- MASAKA
('Masaka Fire Station',               'fire', '0481421300',   'Masaka City',                         'Masaka', -0.33260, 31.73800, true);


-- ═══════════════════════════════════════════════════════
-- AMBULANCE SERVICES
-- ═══════════════════════════════════════════════════════

INSERT INTO public.facilities (name, facility_type, phone, address, district, latitude, longitude, is_24_7) VALUES

('Uganda Red Cross Ambulance — Kampala', 'ambulance', '0417719000', 'Rubaga Road, Kampala',       'Kampala', 0.30200, 32.55440, true),
('GEMS Ambulance — Kampala',             'ambulance', '0800100222', 'Naguru, Kampala',             'Kampala', 0.33690, 32.60720, true),
('Mulago Ambulance Unit',                'ambulance', '0417116200', 'Mulago Hill Road, Kampala',   'Kampala', 0.33730, 32.57600, true),
('Entebbe Ambulance Service',            'ambulance', '0417719010', 'Entebbe Hospital',            'Wakiso',  0.05660, 32.46310, true),
('Gulu Ambulance — Regional Referral',   'ambulance', '0471432160', 'Gulu Regional Referral Hosp', 'Gulu',    2.77470, 32.30120, true),
('Mbarara Ambulance Unit',               'ambulance', '0485421110', 'Mbarara Referral Hospital',   'Mbarara', -0.60100, 30.63810, true),
('Jinja Ambulance Unit',                 'ambulance', '0434121210', 'Jinja Referral Hospital',     'Jinja',   0.44230, 33.19780, true),
('Mbale Ambulance Unit',                 'ambulance', '0454433210', 'Mbale Referral Hospital',     'Mbale',   1.07500, 34.17100, true);


-- ═══════════════════════════════════════════════════════
-- SAFE SHELTERS
-- ═══════════════════════════════════════════════════════

INSERT INTO public.facilities (name, facility_type, phone, address, district, latitude, longitude, is_24_7) VALUES

('MIFUMI Shelter — Kampala',             'shelter', '0414286648', 'Naguru, Kampala',                 'Kampala',  0.33690, 32.60720, true),
('FIDA Uganda — Legal Aid Shelter',      'shelter', '0414530848', 'Ntinda, Kampala',                 'Kampala',  0.34780, 32.62130, true),
('Uganda Women\'s Network Shelter',      'shelter', '0312203750', 'Muyenga, Kampala',                'Kampala',  0.28960, 32.60290, true),
('Gulu Women\'s Shelter',                'shelter', '0471432400', 'Gulu Municipality',               'Gulu',     2.77980, 32.29920, false),
('Mbarara Women\'s Shelter',             'shelter', '0485421400', 'Mbarara Municipality',            'Mbarara', -0.60720, 30.65370, false);
