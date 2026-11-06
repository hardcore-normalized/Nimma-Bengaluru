// Bengaluru civic issue categories.
// Chosen from what Bengaluru residents actually complain about most:
//  - BBMP grievance data, Jan–Jun 2025 (OpenCity analysis of ~1.27 lakh complaints):
//    streetlights ~31%, solid waste ~30% (garbage dumps 12.7%, garbage vehicle
//    delays 9.6%, sweeping 2.9%), then roads, veterinary (stray dogs), forest (trees).
//  - Recurring city issues in 2025–26 news: potholes (High Court monitoring),
//    garbage black spots, waterlogging & blocked storm drains, open manholes,
//    footpath encroachment ("Safe Footpath" drive, 2026), construction debris,
//    stray dogs, lake pollution, illegal flex banners.
// slaDays = target days to resolve (prototype values, configurable later).

export const CATEGORY_GROUPS = [
  { code: 'roads', name: 'Roads & Footpaths' },
  { code: 'waste', name: 'Garbage & Sanitation' },
  { code: 'water', name: 'Water, Drains & Flooding' },
  { code: 'power', name: 'Streetlights & Power' },
  { code: 'green', name: 'Trees, Parks & Lakes' },
  { code: 'safety', name: 'Traffic & Public Safety' },
  { code: 'buildings', name: 'Buildings & Encroachment' },
  { code: 'governance', name: 'Corruption (confidential)' },
  { code: 'other', name: 'Other' },
];

export const CATEGORIES = [
  // Roads & footpaths
  { code: 'POTHOLE', group: 'roads', name: 'Pothole / damaged road', emoji: '🕳️', dept: 'ROADS', slaDays: 7, severity: 'high', popular: true,
    hint: 'Show the full pothole with a vehicle, footwear or kerb in the frame for size.' },
  { code: 'ROAD_CUT', group: 'roads', name: 'Road dug up and not restored', emoji: '🚧', dept: 'ROADS', slaDays: 10, severity: 'medium',
    hint: 'Capture the trench / cut and any board showing which agency dug it.' },
  { code: 'FOOTPATH', group: 'roads', name: 'Broken or encroached footpath', emoji: '🚶', dept: 'REVENUE', slaDays: 7, severity: 'medium', popular: true,
    hint: 'Show the blocked or broken stretch of footpath clearly.' },
  { code: 'SPEED_BREAKER', group: 'roads', name: 'Unmarked / dangerous speed breaker', emoji: '⚠️', dept: 'ROADS', slaDays: 10, severity: 'medium' },

  // Garbage & sanitation
  { code: 'GARBAGE_DUMP', group: 'waste', name: 'Garbage black spot / dumping', emoji: '🗑️', dept: 'SWM', slaDays: 2, severity: 'medium', popular: true,
    hint: 'Capture the whole pile and a landmark nearby.' },
  { code: 'GARBAGE_NOT_COLLECTED', group: 'waste', name: 'Garbage not collected from homes', emoji: '🚛', dept: 'SWM', slaDays: 1, severity: 'medium' },
  { code: 'SWEEPING', group: 'waste', name: 'Street not swept', emoji: '🧹', dept: 'SWM', slaDays: 2, severity: 'low' },
  { code: 'DEBRIS', group: 'waste', name: 'Construction debris dumped', emoji: '🧱', dept: 'SWM', slaDays: 5, severity: 'medium' },
  { code: 'GARBAGE_BURNING', group: 'waste', name: 'Garbage burning', emoji: '🔥', dept: 'SWM', slaDays: 1, severity: 'high' },
  { code: 'DEAD_ANIMAL', group: 'waste', name: 'Dead animal on road', emoji: '🐾', dept: 'VET', slaDays: 1, severity: 'medium' },
  { code: 'PUBLIC_TOILET', group: 'waste', name: 'Public toilet dirty / not working', emoji: '🚻', dept: 'HEALTH', slaDays: 3, severity: 'low' },

  // Water, drains & flooding
  { code: 'WATERLOGGING', group: 'water', name: 'Waterlogging / flooding', emoji: '🌊', dept: 'SWD', slaDays: 1, severity: 'high', popular: true,
    hint: 'Show how deep the water is (against a kerb, wheel or leg) and the road name board if visible.' },
  { code: 'DRAIN_BLOCKED', group: 'water', name: 'Blocked storm-water drain', emoji: '🚰', dept: 'SWD', slaDays: 3, severity: 'medium' },
  { code: 'SEWAGE_OVERFLOW', group: 'water', name: 'Sewage overflow', emoji: '🤢', dept: 'BWSSB', slaDays: 2, severity: 'high', popular: true },
  { code: 'OPEN_MANHOLE', group: 'water', name: 'Open / broken manhole or drain cover', emoji: '⭕', dept: 'BWSSB', slaDays: 1, severity: 'critical', popular: true,
    hint: 'Danger to life – keep a safe distance while taking the photo.' },
  { code: 'WATER_SUPPLY', group: 'water', name: 'No water supply / pipeline leak', emoji: '💧', dept: 'BWSSB', slaDays: 2, severity: 'high', popular: true },
  { code: 'STAGNANT_WATER', group: 'water', name: 'Stagnant water / mosquito breeding', emoji: '🦟', dept: 'HEALTH', slaDays: 3, severity: 'medium' },

  // Streetlights & power
  { code: 'STREETLIGHT', group: 'power', name: 'Streetlight not working', emoji: '💡', dept: 'ELECTRICAL', slaDays: 3, severity: 'medium', popular: true,
    hint: 'Capture the pole number plate if it is visible.' },
  { code: 'LIVE_WIRES', group: 'power', name: 'Dangling / exposed electric wires', emoji: '⚡', dept: 'BESCOM', slaDays: 1, severity: 'critical',
    hint: 'Do not go near the wires. Take the photo from a safe distance.' },

  // Trees, parks & lakes
  { code: 'TREE_HAZARD', group: 'green', name: 'Fallen / dangerous tree or branch', emoji: '🌳', dept: 'FOREST', slaDays: 1, severity: 'high', popular: true },
  { code: 'TREE_FELLING', group: 'green', name: 'Illegal tree cutting', emoji: '🪓', dept: 'FOREST', slaDays: 2, severity: 'medium' },
  { code: 'LAKE', group: 'green', name: 'Lake pollution / encroachment', emoji: '🏞️', dept: 'LAKES', slaDays: 15, severity: 'medium' },
  { code: 'PARK', group: 'green', name: 'Park / playground not maintained', emoji: '🛝', dept: 'HORTI', slaDays: 7, severity: 'low' },

  // Traffic & public safety
  { code: 'STRAY_DOGS', group: 'safety', name: 'Stray dog menace', emoji: '🐕', dept: 'VET', slaDays: 5, severity: 'medium', popular: true },
  { code: 'TRAFFIC_SIGNAL', group: 'safety', name: 'Traffic signal not working', emoji: '🚦', dept: 'TRAFFIC', slaDays: 1, severity: 'high' },
  { code: 'ILLEGAL_PARKING', group: 'safety', name: 'Illegal / footpath parking', emoji: '🅿️', dept: 'TRAFFIC', slaDays: 2, severity: 'low' },

  // Buildings & encroachment
  { code: 'ILLEGAL_CONSTRUCTION', group: 'buildings', name: 'Illegal / unsafe construction', emoji: '🏗️', dept: 'TOWNPLAN', slaDays: 15, severity: 'medium' },
  { code: 'HOARDING', group: 'buildings', name: 'Illegal hoarding / flex banner', emoji: '🪧', dept: 'ADVT', slaDays: 3, severity: 'low' },
  { code: 'ENCROACHMENT', group: 'buildings', name: 'Encroachment of public land', emoji: '🚫', dept: 'REVENUE', slaDays: 15, severity: 'medium' },

  // Sensitive – restricted handling (only admin / vigilance-authorised officials can see these)
  { code: 'BRIBERY', group: 'governance', name: 'Bribery / misuse of authority', emoji: '🔒', dept: 'VIGILANCE', slaDays: 30, severity: 'high', sensitive: true,
    hint: 'This report stays confidential. It is never shown publicly and area officials cannot see it.' },

  // Other
  { code: 'OTHER', group: 'other', name: 'Other civic issue', emoji: '📝', dept: 'WARD', slaDays: 7, severity: 'low' },
];

export const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((c) => [c.code, c]));
