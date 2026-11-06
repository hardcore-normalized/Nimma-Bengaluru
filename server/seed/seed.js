// Creates the demo official accounts (always) and realistic demo reports (only
// when the database has no reports yet and SEED_DEMO_DATA=true).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Official, Report, Reporter, Device, Block, AuditLog, Setting } from '../models/index.js';
import { CATEGORY_BY_CODE } from '../data/categories.js';
import { WARD_BY_CODE, findWard } from '../lib/wards.js';
import { saveFile, sha256 } from '../lib/media.js';
import { newReference } from '../lib/refno.js';
import { DEMO_ACCOUNTS, RETIRED_ACCOUNTS } from './accounts.js';
import { demoSvg } from './demoImages.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;

export async function ensureAccounts() {
  // Only one account exists in this version: the administrator.
  await Official.deleteMany({ username: { $in: RETIRED_ACCOUNTS } });
  let created = 0;
  for (const a of DEMO_ACCOUNTS) {
    if (await Official.exists({ username: a.username })) continue;
    // Never recreate the demo admin if a real admin already exists
    if (a.role === 'admin' && (await Official.exists({ role: 'admin' }))) continue;
    await Official.create({
      name: a.name,
      username: a.username,
      email: a.email,
      designation: a.designation,
      department: a.department,
      role: a.role,
      areas: a.areas,
      canViewSensitive: Boolean(a.canViewSensitive),
      passwordHash: await bcrypt.hash(a.password, 10),
      isDemo: true,
    });
    created++;
  }
  return created;
}

// ---------------------------------------------------------------- demo citizens
const PEOPLE = {
  ananya: { phone: '9000010001', name: 'Ananya Rao', locality: 'Indiranagar' },
  irfan: { phone: '9000010002', name: 'Mohammed Irfan', locality: 'Shivajinagar' },
  lakshmi: { phone: '9000010003', name: 'Lakshmi Narayan', locality: 'Whitefield' },
  karthik: { phone: '9000010004', name: 'Karthik S', locality: 'Marathahalli' },
  deepa: { phone: '9000010005', name: 'Deepa Hegde', locality: 'Jayanagar 4th Block' },
  suresh: { phone: '9000010006', name: 'Suresh Babu', locality: 'HSR Layout' },
  fathima: { phone: '9000010007', name: 'Fathima Begum', locality: 'Bellandur' },
  vikram: { phone: '9000010008', name: 'Vikram Reddy', locality: 'Domlur' },
  meena: { phone: '9000010009', name: 'Meena Kumari', locality: 'Hebbal' },
  arun: { phone: '9000010010', name: 'Arun Prakash', locality: 'Rajajinagar' },
  // misuse cases
  rahul: { phone: '9000020001', name: 'Rahul M', locality: 'Marathahalli' },
  rakesh: { phone: '9000020002', name: 'Rakesh K', locality: 'Ejipura' },
  ramesh: { phone: '9000020003', name: 'Ramesh Kumar', locality: 'Ejipura' },
  raju: { phone: '9000020004', name: 'Raju', locality: 'Koramangala' },
};

// Each demo citizen gets their own phone. Story for the misuse demo: Rakesh was
// auto-blocked (number + phone). He then bought two new SIMs ("Ramesh", "Raju") and
// used them on one new phone from the same home network, re-using an old photo.
const SHARED_DEVICE = crypto.randomUUID();
const HOME_IP = '49.207.52.18';
const IPS = ['49.207.52.18', '106.51.74.203', '157.45.112.9', '117.192.33.140', '49.36.218.77', '223.186.41.5', '27.61.140.92', '103.211.17.64'];

// ---------------------------------------------------------------- demo reports
// by, ward, cat, days ago, status, description, landmark, extras
const R = (by, ward, cat, days, status, desc, landmark, extra = {}) => ({ by, ward, cat, days, status, desc, landmark, ...extra });

const SPECS = [
  // ---- Central
  R('ananya', 'C-015', 'FOOTPATH', 9, 'IN_PROGRESS', 'Footpath on 100 Feet Road is completely blocked by shop displays and parked two-wheelers. Pedestrians including school children are forced to walk on the main road.', '100 Feet Road, near Indiranagar metro station', { supporters: ['vikram', 'irfan'] }),
  R('vikram', 'C-022', 'POTHOLE', 14, 'RESOLVED', 'Deep pothole on the Domlur flyover service road. Two-wheelers are skidding here every evening and water collects in it after rain.', 'Domlur flyover service road, towards Old Airport Road', { severity: 'high' }),
  R('irfan', 'C-005', 'SEWAGE_OVERFLOW', 2, 'ASSIGNED', 'Sewage is overflowing from a manhole near the market for two days. The smell is unbearable and the water is entering shops.', 'Russell Market back lane, Shivajinagar', { severity: 'high' }),
  R('irfan', 'C-005', 'HOARDING', 6, 'RESOLVED', 'Illegal flex banners tied to the streetlight poles at the junction are blocking the view of the traffic signal.', 'Shivajinagar bus stand junction'),
  R('ananya', 'C-015', 'GARBAGE_DUMP', 1, 'SUBMITTED', 'Garbage black spot has come up again behind the bus stop. Bags of waste are being dumped at night and dogs are spreading it on the road.', 'Behind BDA complex bus stop, Indiranagar'),
  R('vikram', 'C-019', 'STREETLIGHT', 3, 'UNDER_REVIEW', 'Four streetlights in a row are not working on this stretch for a week. The road is very dark and unsafe for women walking home after 8 pm.', 'Jeevan Bhima Nagar main road, near the park'),
  R('ananya', 'C-008', 'TREE_HAZARD', 4, 'AWAITING_VERIFICATION', 'A large dry branch of the rain tree is hanging over the footpath and the road. It can fall on vehicles any time.', 'Halasuru lake road, opposite the temple', { severity: 'high', hazard: true }),
  R('irfan', 'C-004', 'WATERLOGGING', 18, 'RESOLVED', 'Knee-deep water stagnates under the bridge after every rain. Vehicles are breaking down and autos refuse to come here.', 'Sampangirama Nagar underpass', { severity: 'high' }),
  R('vikram', 'C-031', 'STRAY_DOGS', 7, 'NEEDS_CORRECTION', 'Dogs are chasing bikers.', 'Shanthinagar', { correction: 'Please share the exact street / cross and the time when the dogs are most active, and add a photo of the spot.' }),
  R('irfan', 'C-005', 'OTHER', 11, 'REFERRED', 'Metro construction barricades have narrowed the road and there is no proper diversion board for vehicles coming from the cantonment side.', 'Near Shivajinagar metro work site', { referred: 'Metro work zones are managed by BMRCL. Forwarded to BMRCL public relations cell for barricade and signage correction.' }),
  R('ananya', 'C-015', 'ILLEGAL_PARKING', 5, 'REJECTED', 'Cars parked on the road.', '12th Main, Indiranagar', { rejected: 'No violation visible – the vehicles in the photo are parked in a marked pay-and-park bay.' }),
  R('vikram', 'C-025', 'LIVE_WIRES', 0.3, 'SUBMITTED', 'Electric cable is hanging very low from the pole after yesterday’s wind and touches the compound wall. Children play here.', 'Ashok Nagar, near the corporation school', { severity: 'critical', hazard: true }),

  // ---- East / Mahadevapura
  R('fathima', 'E-047', 'WATERLOGGING', 1.5, 'IN_PROGRESS', 'Outer Ring Road service lane floods even after a short rain. The storm water drain is choked with plastic and construction waste.', 'ORR service road near Bellandur flyover', { severity: 'high', supporters: ['karthik', 'lakshmi'] }),
  R('fathima', 'E-047', 'LAKE', 20, 'ASSIGNED', 'White froth and sewage smell from Bellandur lake near the bridge again. Untreated water is entering from the drain on the east side.', 'Bellandur lake bridge, Yemalur side', {}),
  R('lakshmi', 'E-038', 'POTHOLE', 3, 'ASSIGNED', 'Series of potholes on ITPL Main Road near the signal. Buses are swerving suddenly to avoid them – very dangerous at night.', 'ITPL Main Road, near Whitefield TTMC', { severity: 'high', supporters: ['karthik'] }),
  R('karthik', 'E-045', 'GARBAGE_DUMP', 8, 'RESOLVED', 'Garbage is dumped every day at the corner of the vacant site. It is now spilling onto the road and blocking the drain.', 'Marathahalli, behind the bridge, Kalamandir road', { supporters: ['rahul'] }),
  R('lakshmi', 'E-040', 'WATER_SUPPLY', 2.5, 'UNDER_REVIEW', 'No Cauvery water supply in our street for 4 days. Tanker charges have doubled. Pipeline near the junction appears damaged.', 'Varthur main road, near Varthur Kodi', { severity: 'high' }),
  R('karthik', 'E-029', 'STREETLIGHT', 12, 'RESOLVED', 'Streetlights not working on the entire stretch from the railway gate to the bus stop.', 'Hoodi circle to Hoodi railway gate'),
  R('lakshmi', 'E-031', 'DEBRIS', 6, 'DUPLICATE', 'Construction debris dumped on the roadside near the lake bund.', 'Kadugodi, lake bund road'),
  R('karthik', 'E-031', 'DEBRIS', 7, 'ASSIGNED', 'Truck loads of construction debris dumped along the lake bund road at night. It is blocking half the road and the storm drain.', 'Kadugodi lake bund road, near the temple', { original: true }),
  R('fathima', 'E-048', 'OPEN_MANHOLE', 0.5, 'SUBMITTED', 'Manhole cover is broken and the hole is open on the footpath. Someone will fall in, especially at night.', 'Panathur main road, near the railway underpass', { severity: 'critical', hazard: true }),
  R('karthik', 'E-037', 'GARBAGE_BURNING', 4, 'IN_PROGRESS', 'Garbage is being burnt every morning at the empty plot – thick smoke enters the apartments.', 'Kundalahalli, near the lake road', {}),
  R('rahul', 'E-045', 'POTHOLE', 26, 'SPAM', 'Big pothole near the bridge, very dangerous!!', 'Marathahalli bridge', { spam: 'Photo is an internet image of a pothole from another city; the road at the pinned spot was resurfaced last month (verified on site).' }),
  R('rahul', 'E-045', 'GARBAGE_DUMP', 21, 'SPAM', 'Garbage everywhere near my house, nobody cleans', 'Marathahalli', { spam: 'Same photo already submitted in another report; no garbage found at the pinned location on inspection.' }),
  R('rahul', 'E-038', 'ILLEGAL_CONSTRUCTION', 0.2, 'SUBMITTED', 'Illegal building construction going on without any permission next to my house, take action immediately against the owner', 'Whitefield main road', { highRisk: 'rahul' }),

  // ---- South
  R('suresh', 'S-072', 'POTHOLE', 5, 'IN_PROGRESS', 'Huge crater after BWSSB pipeline work was not restored properly. Two accidents this week.', '27th Main Road, HSR Layout Sector 1', { severity: 'high', supporters: ['deepa', 'vikram', 'lakshmi'] }),
  R('suresh', 'S-072', 'STREETLIGHT', 2, 'ASSIGNED', 'Streetlights near the park are off for 10 days. Chain snatching incident happened last week.', 'HSR Layout Sector 2, near the BDA park'),
  R('deepa', 'S-011', 'GARBAGE_NOT_COLLECTED', 1, 'UNDER_REVIEW', 'Door-to-door garbage collection vehicle has not come to our cross for 3 days. Waste is piling up outside houses.', 'Jayanagar 4th Block East, 30th Cross'),
  R('deepa', 'S-014', 'FOOTPATH', 15, 'RESOLVED', 'Footpath slabs are broken and an open drain is exposed. Elderly people walking to the temple have fallen.', 'J.P Nagar 2nd Phase, near the temple', {}),
  R('suresh', 'S-063', 'TRAFFIC_SIGNAL', 0.8, 'SUBMITTED', 'Traffic signal at the junction is blinking yellow since morning. Total chaos during office hours.', 'Hosur Road – Bommanahalli junction', { severity: 'high' }),
  R('deepa', 'S-008', 'STAGNANT_WATER', 9, 'RESOLVED', 'Stagnant water in the vacant site is breeding mosquitoes. Two dengue cases in our road.', 'Tilak Nagar, 3rd Cross'),
  R('suresh', 'S-057', 'STRAY_DOGS', 3, 'UNDER_REVIEW', 'A pack of 8–10 dogs near the bus stop chases two-wheelers at night. A child was bitten last week.', 'Hulimavu main road bus stop'),
  R('rakesh', 'S-026', 'GARBAGE_DUMP', 25, 'SPAM', 'garbage garbage garbage near ejipura signal', 'Ejipura signal', { spam: 'Duplicate fake complaint – the same photo was used in 3 earlier reports from different numbers.' }),
  R('rakesh', 'S-026', 'POTHOLE', 22, 'SPAM', 'Road is very bad', 'Ejipura', { spam: 'Location pinned 6 km away from where the reporter was standing; photo not of this road.' }),
  R('rakesh', 'S-024', 'ILLEGAL_CONSTRUCTION', 19, 'SPAM', 'My neighbour is doing illegal construction, demolish it', 'Adugodi', { spam: 'Inspection found a sanctioned building plan on site. Complaint appears to be a personal dispute.' }),
  R('ramesh', 'S-026', 'GARBAGE_DUMP', 6, 'UNDER_REVIEW', 'Garbage dumped near Ejipura signal and nobody is clearing it for weeks.', 'Ejipura signal', { sockPuppet: true }),
  R('raju', 'S-021', 'POTHOLE', 0.15, 'SUBMITTED', 'Road very bad near the junction please do something fast', 'Chikka Adugodi', { sockPuppet: true }),

  // ---- North / West
  R('meena', 'N-056', 'WATERLOGGING', 2, 'UNDER_REVIEW', 'Hebbal flyover loop gets flooded every evening rain; vehicles stall in the water.', 'Hebbal flyover, Esteem Mall side loop', { severity: 'high' }),
  R('arun', 'W-063', 'GARBAGE_DUMP', 4, 'ASSIGNED', 'Garbage black spot next to the playground. Waste is burnt at night too.', 'Rajajinagar 2nd Block, near the playground'),
  R('arun', 'W-053', 'TREE_FELLING', 1, 'SUBMITTED', 'Two old trees are being cut without any permission board or notice on 8th Cross.', 'Malleshwaram 8th Cross', {}),
  R('meena', 'N-053', 'POTHOLE', 10, 'RESOLVED', 'Series of potholes on the main road near the bus depot.', 'R.T Nagar main road, near the bus depot'),
  R('arun', 'W-063', 'BRIBERY', 3, 'UNDER_REVIEW', 'An official at the ward office asked for money to process my khata transfer application. I have the date and time of the conversation.', 'Ward office', { sensitive: true }),
];


function jitterPoint(code, seed) {
  const w = WARD_BY_CODE[code];
  const [lat, lng] = w.center;
  for (let i = 0; i < 12; i++) {
    const a = (seed * 9301 + i * 49297) % 233280;
    const dLat = ((a / 233280) - 0.5) * 0.004;
    const dLng = ((((a * 7) % 233280) / 233280) - 0.5) * 0.004;
    const p = { lat: lat + dLat, lng: lng + dLng };
    if (findWard(p.lat, p.lng)?.code === code) return p;
  }
  return { lat, lng };
}

function steps(spec, officer, createdAt) {
  const cat = CATEGORY_BY_CODE[spec.cat];
  const by = { actorType: 'official', actorId: officer._id, actorName: officer.name, public: true };
  const h = [{ from: null, to: 'SUBMITTED', reason: 'Report submitted by citizen', actorType: 'citizen', actorName: PEOPLE[spec.by].name, at: createdAt, public: true }];
  let t = createdAt.getTime();
  const now = Date.now() - 20 * 60000;
  const next = (hrs) => new Date((t = Math.min(now, t + hrs * HOUR)));
  const fields = {};
  const path = {
    SUBMITTED: [],
    UNDER_REVIEW: ['UNDER_REVIEW'],
    NEEDS_CORRECTION: ['UNDER_REVIEW', 'NEEDS_CORRECTION'],
    ASSIGNED: ['UNDER_REVIEW', 'ASSIGNED'],
    IN_PROGRESS: ['UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS'],
    AWAITING_VERIFICATION: ['UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION'],
    RESOLVED: ['UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'RESOLVED'],
    DUPLICATE: ['UNDER_REVIEW', 'DUPLICATE'],
    SPAM: ['UNDER_REVIEW', 'SPAM'],
    REJECTED: ['UNDER_REVIEW', 'REJECTED'],
    REFERRED: ['UNDER_REVIEW', 'REFERRED'],
  }[spec.status];
  const span = Math.max(1, (now - t) / HOUR);
  const gap = Math.max(0.5, Math.min(30, span / (path.length + 1)));
  let prev = 'SUBMITTED';
  for (const to of path) {
    const at = next(gap * (0.6 + ((to.length * 7) % 5) / 10));
    let reason = '';
    if (to === 'UNDER_REVIEW') reason = 'Opened for review';
    if (to === 'ASSIGNED') {
      const dept = cat.dept;
      fields.assignment = { department: dept, team: dept === 'SWM' ? 'Ward garbage auto team' : dept === 'BWSSB' ? 'BWSSB sub-division maintenance gang' : 'Ward field team', dueAt: new Date(createdAt.getTime() + cat.slaDays * DAY), by: officer._id, byName: officer.name, at };
      fields.assignments = [fields.assignment];
      reason = `Assigned to ${dept} – ${fields.assignment.team}`;
    }
    if (to === 'IN_PROGRESS') reason = 'Field team has started work at the site';
    if (to === 'AWAITING_VERIFICATION') reason = 'Work completed by the field team, after photo uploaded – pending verification';
    if (to === 'RESOLVED') {
      reason = 'Verified on site. Issue fixed.';
      fields.resolution = { note: reason, at, by: officer._id, byName: officer.name };
      fields.closedAt = at;
    }
    if (to === 'NEEDS_CORRECTION') {
      reason = spec.correction;
      fields.correctionRequest = { message: spec.correction, byName: officer.name, at };
    }
    if (to === 'REFERRED') {
      reason = spec.referred;
      fields.closedAt = at;
    }
    if (to === 'REJECTED') {
      reason = spec.rejected;
      fields.closedAt = at;
    }
    if (to === 'SPAM') {
      reason = spec.spam;
      fields.spam = { reason, by: officer._id, byName: officer.name, at };
      fields.closedAt = at;
    }
    if (to === 'DUPLICATE') {
      reason = 'Same issue already reported nearby – merged with the original report';
      fields.closedAt = at;
    }
    h.push({ from: prev, to, reason, ...by, at });
    prev = to;
  }
  return { history: h, fields };
}

const RISK = {
  normal: { score: 0, level: 'low', signals: [] },
  rahulPending: {
    score: 100,
    level: 'high',
    signals: [
      { code: 'PRIOR_STRIKES', weight: 40, label: 'Reporter already has 2 misuse strike(s)' },
      { code: 'FAR_FROM_ISSUE', weight: 30, label: 'Reporter was 4.8 km away from the reported spot' },
      { code: 'OLD_PHOTO', weight: 25, label: 'Photo 1 was taken 9 days before submission' },
      { code: 'TOO_FAST', weight: 15, label: 'Report completed in 14 seconds (bot-like)' },
    ],
  },
  sockPuppet: {
    score: 64,
    level: 'high',
    signals: [
      { code: 'REUSED_PHOTO', weight: 40, label: 'Photo is almost identical to one in an earlier fake report (different reporter)' },
      { code: 'MULTI_NUMBER_DEVICE', weight: 12, label: 'This phone has been used with 2 different mobile numbers' },
      { code: 'IP_OF_MISUSER', weight: 12, label: 'Same network (IP 49.207.52.18) was used by 1 reporter(s) caught for misuse' },
    ],
  },
  spamOld: {
    score: 55,
    level: 'high',
    signals: [
      { code: 'FAR_FROM_ISSUE', weight: 30, label: 'Reporter was 6.1 km away from the reported spot' },
      { code: 'GIBBERISH_TEXT', weight: 15, label: 'Description looks meaningless (same words repeated)' },
      { code: 'NO_EXIF_TIME', weight: 10, label: 'Photo 1 has no camera timestamp (EXIF)' },
    ],
  },
  vague: { score: 15, level: 'low', signals: [{ code: 'TOO_FAST', weight: 15, label: 'Report completed in 19 seconds (bot-like)' }] },
};

export async function seedDemoData() {
  if ((await Report.estimatedDocumentCount()) > 0) return { skipped: true };
  const officials = Object.fromEntries((await Official.find({ username: { $in: DEMO_ACCOUNTS.map((a) => a.username) } })).map((o) => [o.username, o]));
  const admin = officials.admin || (await Official.findOne({ role: 'admin' }));
  if (!admin) return { skipped: true };

  // Citizens + devices
  const reporters = {};
  const deviceOf = {};
  let ipI = 0;
  for (const [key, p] of Object.entries(PEOPLE)) {
    const shared = ['ramesh', 'raju'].includes(key);
    const deviceId = shared ? SHARED_DEVICE : crypto.randomUUID();
    const fpHash = crypto.createHash('sha256').update(shared ? 'shared-fp' : key).digest('hex').slice(0, 32);
    const ip = ['rakesh', 'ramesh', 'raju'].includes(key) ? HOME_IP : IPS[ipI++ % IPS.length];
    const first = new Date(Date.now() - (shared ? 27 : 28) * DAY);
    deviceOf[key] = { deviceId, fpHash, ip };
    const ua = shared || key === 'rakesh'
      ? 'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
      : key.length % 2
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
    deviceOf[key].ua = ua;
    reporters[key] = await Reporter.create({
      phone: p.phone,
      name: p.name,
      names: [p.name],
      locality: p.locality,
      localities: [p.locality],
      devices: [{ deviceId, fpHash, ua, platform: ua.includes('iPhone') ? 'iPhone' : 'Linux armv8l', firstSeen: first, lastSeen: new Date() }],
      ips: [{ ip, firstSeen: first, lastSeen: new Date(), count: 3 }],
      contactClaims: [{ at: first, ip, deviceId, ua, name: p.name }],
      firstSeenAt: first,
      lastSeenAt: new Date(),
      isDemo: true,
    });
  }
  // Devices collection (the shared phone has 3 numbers)
  const byDevice = {};
  for (const [key, d] of Object.entries(deviceOf)) {
    (byDevice[d.deviceId] ||= { ...d, phones: [] }).phones.push({ phone: PEOPLE[key].phone, reporter: reporters[key]._id, firstSeen: new Date(Date.now() - 25 * DAY), lastSeen: new Date() });
  }
  for (const d of Object.values(byDevice)) {
    await Device.create({
      deviceId: d.deviceId,
      fpHash: d.fpHash,
      uas: [d.ua],
      phones: d.phones,
      ips: [{ ip: d.ip, firstSeen: new Date(Date.now() - 25 * DAY), lastSeen: new Date(), count: 5 }],
      firstSeen: new Date(Date.now() - 28 * DAY),
      lastSeen: new Date(),
      fp: { platform: d.ua.includes('iPhone') ? 'iPhone' : 'Linux armv8l', tz: 'Asia/Calcutta', screen: d.ua.includes('iPhone') ? '390x844@3' : '393x873@2.75', cores: 8, touch: 5 },
      isDemo: true,
    });
  }

  // Reports
  const created = [];
  let seed = 1;
  for (const spec of SPECS) {
    const cat = CATEGORY_BY_CODE[spec.cat];
    const ward = WARD_BY_CODE[spec.ward];
    const officer = admin;
    const person = PEOPLE[spec.by];
    const reporter = reporters[spec.by];
    const dev = deviceOf[spec.by];
    const pt = jitterPoint(spec.ward, seed++ * 17);
    const createdAt = new Date(Date.now() - spec.days * DAY);
    const ref = newReference();
    const { history, fields } = steps(spec, officer, createdAt);

    const media = [];
    const svg = Buffer.from(demoSvg({ group: cat.group, emoji: cat.emoji, title: cat.name, subtitle: spec.landmark, lat: pt.lat, lng: pt.lng, ward: `${ward.name} (${ward.code})`, when: createdAt }));
    const fileId = await saveFile(svg, { filename: `${ref}-1`, contentType: 'image/svg+xml', metadata: { ref, role: 'evidence', demo: true } });
    const reusedPhash = spec.by === 'rakesh' || spec.sockPuppet ? 'c3c3e1f0f0e1c387' : undefined;
    media.push({ fileId, kind: 'image', mime: 'image/svg+xml', size: svg.length, sha256: sha256(svg), phash: reusedPhash, role: 'evidence', captureMethod: spec.by === 'rahul' || spec.by === 'rakesh' ? 'native' : 'live', capturedAt: createdAt, gps: { lat: pt.lat, lng: pt.lng, accuracy: 9 }, width: 1200, height: 900, uploadedBy: 'citizen', uploadedAt: createdAt });
    if (['RESOLVED', 'AWAITING_VERIFICATION'].includes(spec.status)) {
      const at = fields.resolution?.at || history[history.length - 1].at;
      const after = Buffer.from(demoSvg({ group: cat.group, emoji: cat.emoji, title: cat.name, subtitle: spec.landmark, lat: pt.lat, lng: pt.lng, ward: `${ward.name} (${ward.code})`, when: at, after: true }));
      const afterId = await saveFile(after, { filename: `${ref}-after`, contentType: 'image/svg+xml', metadata: { ref, role: 'resolution', demo: true } });
      media.push({ fileId: afterId, kind: 'image', mime: 'image/svg+xml', size: after.length, sha256: sha256(after), role: 'resolution', captureMethod: 'official', uploadedBy: officer.name, uploadedAt: at, width: 1200, height: 900 });
    }

    let risk = RISK.normal;
    let devLoc = { lat: pt.lat + 0.0002, lng: pt.lng - 0.0001, accuracy: 12, at: createdAt };
    let distance = 25;
    let duration = 95000 + ((seed * 7919) % 120000);
    if (spec.highRisk === 'rahul') {
      risk = RISK.rahulPending;
      devLoc = { lat: pt.lat + 0.031, lng: pt.lng - 0.028, accuracy: 35, at: createdAt };
      distance = 4800;
      duration = 14000;
    } else if (spec.sockPuppet) {
      risk = RISK.sockPuppet;
    } else if (spec.status === 'SPAM') {
      risk = RISK.spamOld;
      devLoc = { lat: pt.lat + 0.04, lng: pt.lng + 0.03, accuracy: 60, at: createdAt };
      distance = 6100;
      duration = 17000;
    } else if (spec.status === 'NEEDS_CORRECTION' || spec.status === 'REJECTED') {
      risk = RISK.vague;
      duration = 19000;
    }

    const doc = await Report.create({
      ref,
      category: cat.code,
      group: cat.group,
      description: spec.desc,
      severity: spec.severity || cat.severity,
      hazard: Boolean(spec.hazard),
      location: { type: 'Point', coordinates: [pt.lng, pt.lat] },
      locationAccuracy: 9,
      locationSource: 'gps',
      landmark: spec.landmark,
      area: ward.code,
      areaName: ward.name,
      corporation: ward.corporation,
      zone: ward.zone,
      reporter: reporter._id,
      reporterSnapshot: { name: person.name, phone: person.phone, locality: person.locality },
      client: {
        deviceId: dev.deviceId,
        fpHash: dev.fpHash,
        ip: dev.ip,
        ua: dev.ua,
        platform: dev.ua.includes('iPhone') ? 'iPhone' : 'Linux armv8l',
        screen: dev.ua.includes('iPhone') ? '390x844@3' : '393x873@2.75',
        tz: 'Asia/Calcutta',
        lang: 'en-IN',
        deviceLocation: devLoc,
        distanceToIssueM: distance,
        formDurationMs: duration,
        startedAt: new Date(createdAt.getTime() - duration),
      },
      media,
      status: spec.status,
      history,
      sensitive: Boolean(spec.sensitive || cat.sensitive),
      risk,
      supporters: (spec.supporters || []).map((k) => ({ reporter: reporters[k]._id, at: new Date(createdAt.getTime() + 3 * HOUR) })),
      supportCount: (spec.supporters || []).length,
      slaDueAt: new Date(createdAt.getTime() + cat.slaDays * DAY),
      isDemo: true,
      ...fields,
      createdAt,
      updatedAt: history[history.length - 1].at,
    });
    created.push({ doc, spec, reporter });
  }

  // Link duplicates and stats
  const original = created.find((c) => c.spec.original);
  for (const c of created) {
    if (c.spec.status === 'DUPLICATE' && original) {
      c.doc.duplicateOf = original.doc.ref;
      await c.doc.save();
    }
  }
  const rahulPending = created.find((c) => c.spec.highRisk === 'rahul');
  if (rahulPending) {
    rahulPending.doc.possibleDuplicates = [];
    rahulPending.doc.history.push({ from: 'SUBMITTED', to: 'SUBMITTED', reason: `Flagged by automatic misuse checks (risk score ${RISK.rahulPending.score}/100)`, actorType: 'system', actorName: 'System', at: rahulPending.doc.createdAt, public: false });
    await rahulPending.doc.save();
  }
  for (const [key, reporter] of Object.entries(reporters)) {
    const mine = created.filter((c) => c.spec.by === key);
    reporter.stats.reports = mine.length;
    reporter.stats.resolved = mine.filter((c) => c.spec.status === 'RESOLVED').length;
    reporter.stats.rejected = mine.filter((c) => c.spec.status === 'REJECTED').length;
    reporter.stats.duplicates = mine.filter((c) => c.spec.status === 'DUPLICATE').length;
    const spam = mine.filter((c) => c.spec.status === 'SPAM');
    reporter.stats.spam = spam.length;
    reporter.strikes = spam.map((c) => ({ report: c.doc._id, ref: c.doc.ref, reason: c.spec.spam, by: c.doc.spam?.by, byName: c.doc.spam?.byName, at: c.doc.spam?.at }));
    await reporter.save();
  }

  // Rakesh reached 3 strikes → automatic 30-day block on his number, phone and browser.
  const rakesh = reporters.rakesh;
  const lastStrike = rakesh.strikes[rakesh.strikes.length - 1];
  for (const t of [
    { type: 'phone', value: rakesh.phone },
    { type: 'device', value: deviceOf.rakesh.deviceId },
    { type: 'fingerprint', value: deviceOf.rakesh.fpHash },
  ]) {
    await Block.create({ ...t, reason: '3 misuse strikes (automatic block)', reporter: rakesh._id, relatedRef: lastStrike?.ref, until: new Date(Date.now() + 11 * DAY), auto: true, byName: 'System (automatic)', isDemo: true, createdAt: new Date(Date.now() - 19 * DAY) });
  }

  // An audit entry so the log is not empty in the demo
  await AuditLog.create({ at: new Date(Date.now() - 19 * DAY), actorType: 'system', actorName: 'System', actorRole: 'system', action: 'REPORTER_AUTO_BLOCKED', targetType: 'reporter', targetId: String(rakesh._id), targetRef: lastStrike?.ref, details: { strikes: 3, demo: true } });

  return { reports: created.length, reporters: Object.keys(reporters).length };
}

export async function seedAll({ demo = true } = {}) {
  const accounts = await ensureAccounts();
  // once the admin removed the demo data (e.g. to free space), don't bring it back
  const removed = await Setting.exists({ _id: 'demo-removed' });
  const data = demo && !removed ? await seedDemoData() : { skipped: true };
  return { accounts, data };
}

export async function wipeDemoData() {
  const demoReports = await Report.find({ isDemo: true }, { media: 1 }).lean();
  const { deleteFile } = await import('../lib/media.js');
  for (const r of demoReports) for (const m of r.media || []) await deleteFile(m.fileId);
  await Report.deleteMany({ isDemo: true });
  await Reporter.deleteMany({ isDemo: true });
  await Device.deleteMany({ isDemo: true });
  await Block.deleteMany({ isDemo: true });
  await AuditLog.deleteMany({ 'details.demo': true });
}
