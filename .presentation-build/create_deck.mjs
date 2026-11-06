import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT = '/Users/gurupreeth/Projects/Nimma Bengaluru';
const BUILD = path.join(ROOT, '.presentation-build');
const OUTPUT = path.join(ROOT, 'output', 'pptx');
const PHOTO = path.join(BUILD, 'assets', 'road-damage.jpg');
const W = 1280;
const H = 720;
const C = {
  bg: '#050505',
  surface: '#101010',
  surface2: '#171717',
  text: '#F5F5F5',
  muted: '#B3B3B3',
  soft: '#777777',
  line: '#333333',
  white: '#FFFFFF',
  black: '#050505',
};
const FONT = 'Arial';

await fs.mkdir(BUILD, { recursive: true });
await fs.mkdir(OUTPUT, { recursive: true });

const presentation = Presentation.create({ slideSize: { width: W, height: H } });
const photoBytes = new Uint8Array(await fs.readFile(PHOTO));

function addText(slide, value, position, options = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    name: options.name,
    position,
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
    text: value,
  });
  shape.text.style = {
    typeface: FONT,
    fontSize: options.size ?? 22,
    bold: options.bold ?? false,
    color: options.color ?? C.text,
    alignment: options.align ?? 'left',
    verticalAlignment: options.valign ?? 'top',
    autoFit: 'shrinkText',
    wrap: 'square',
    insets: 0,
  };
  return shape;
}

function rect(slide, x, y, w, h, fill = C.line, line = 'none', radius = 0) {
  return slide.shapes.add({
    geometry: radius ? 'roundRect' : 'rect',
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: 'solid', fill: line, width: line === 'none' ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function line(slide, x1, y1, x2, y2, color = C.line, thickness = 1) {
  if (Math.abs(y2 - y1) < 1) return rect(slide, x1, y1, x2 - x1, thickness, color);
  if (Math.abs(x2 - x1) < 1) return rect(slide, x1, y1, thickness, y2 - y1, color);
  return slide.shapes.add({
    geometry: 'line',
    position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 },
    fill: 'none',
    line: { style: 'solid', fill: color, width: thickness },
  });
}

function numberMark(slide, number, x, y, diameter = 42) {
  const circle = slide.shapes.add({
    geometry: 'ellipse',
    position: { left: x, top: y, width: diameter, height: diameter },
    fill: C.white,
    line: { style: 'solid', fill: C.white, width: 1 },
    text: String(number),
  });
  circle.text.style = {
    typeface: FONT,
    fontSize: 18,
    bold: true,
    color: C.black,
    alignment: 'center',
    verticalAlignment: 'middle',
    autoFit: 'shrinkText',
    insets: 0,
  };
  return circle;
}

function addBase(title, page, subtitle = '') {
  const slide = presentation.slides.add({ background: { fill: C.bg } });
  addText(slide, title, { left: 72, top: 52, width: 1136, height: 64 }, { size: 44, bold: true });
  if (subtitle) addText(slide, subtitle, { left: 74, top: 124, width: 1090, height: 42 }, { size: 21, color: C.muted });
  rect(slide, 72, 671, 1136, 1, C.line);
  addText(slide, `${String(page).padStart(2, '0')} / 10`, { left: 1122, top: 681, width: 86, height: 22 }, { size: 15, color: C.soft, align: 'right' });
  return slide;
}

function note(slide, paragraphs) {
  slide.speakerNotes.text = paragraphs;
}

// 1. Cover
{
  const slide = presentation.slides.add({ background: { fill: C.bg } });
  rect(slide, 72, 86, 5, 548, C.white);
  addText(slide, 'NIMMA', { left: 110, top: 180, width: 735, height: 82 }, { size: 72, bold: true });
  addText(slide, 'BENGALURU', { left: 110, top: 260, width: 800, height: 90 }, { size: 72, bold: true });
  addText(slide, 'A mobile-first civic issue reporting\nand official response prototype', { left: 114, top: 374, width: 650, height: 94 }, { size: 29, color: C.muted });
  rect(slide, 114, 512, 88, 2, C.white);
  addText(slide, 'CMR University\nB.Tech CSE, Data Science\nProject presentation for guide review', { left: 114, top: 536, width: 620, height: 78 }, { size: 19, color: C.muted });
  addText(slide, 'NOVEMBER 2026', { left: 1000, top: 650, width: 208, height: 22 }, { size: 14, color: C.soft, align: 'right' });
  note(slide, [
    'Introduce Nimma Bengaluru as a mobile-first web prototype for collecting structured civic issue reports and supporting authorised official follow-up.',
    'This is an academic project presentation from CMR University. It is not an official Government of Karnataka or Greater Bengaluru Authority service.',
    'Source: Nihal Final Report, title page and abstract.'
  ]);
}

// 2. Problem context
{
  const slide = addBase('A useful civic report needs clear evidence', 2, 'The issue is local. The first report should make its location and condition easy to understand.');
  addText(slide, 'A report should answer three practical questions.', { left: 74, top: 190, width: 475, height: 68 }, { size: 29, bold: true });
  const items = [
    ['WHERE', 'A map pin and a readable place description'],
    ['WHAT', 'A category and a concise description'],
    ['EVIDENCE', 'A recent photo or video from the location'],
  ];
  items.forEach(([label, detail], i) => {
    const y = 286 + i * 82;
    addText(slide, label, { left: 75, top: y, width: 135, height: 23 }, { size: 15, bold: true, color: C.soft });
    addText(slide, detail, { left: 75, top: y + 26, width: 470, height: 42 }, { size: 21, color: C.text });
  });
  slide.images.add({
    blob: photoBytes,
    contentType: 'image/jpeg',
    alt: 'Representative road-damage photo included in the project report',
    fit: 'cover',
    geometry: 'roundRect',
    borderRadius: 16,
    position: { left: 635, top: 190, width: 573, height: 368 },
  });
  addText(slide, 'Representative road-damage photo from the project report', { left: 635, top: 574, width: 573, height: 24 }, { size: 15, color: C.soft });
  addText(slide, 'Existing grievance channels remain the official routes. This prototype explores a guided intake and traceable review workflow that could complement them.', { left: 74, top: 565, width: 500, height: 72 }, { size: 18, color: C.muted });
  note(slide, [
    'The report describes common local problems such as damaged roads, streetlights, blocked drains and unsafe construction. The central design issue is how to capture enough location and evidence for a reviewer to understand a submission.',
    'Position Nimma Bengaluru as a complementary academic prototype. The report notes that formal grievance channels already exist, including GBA/SAHAAYA 2.0 and Karnataka Janaspandana. Do not imply that those channels are absent or that this project replaces them.',
    'Image source: Nihal Final Report, printed page 1, Figure 1.1 (PDF page 8). Other context: report pages 1 and 5–6. References listed in the report: https://gba.karnataka.gov.in/ ; https://site.bbmp.gov.in/departmentwebsites/bbmpit/mobileapps.html ; https://negd.gov.in/isl/Directory/statedata/418'
  ]);
}

// 3. Goals and method
{
  const slide = addBase('Project goals and working method', 3, 'Design the report around what a resident can capture and what an authorised reviewer can act on.');
  const groups = [
    { title: 'Capture', text: 'Collect a category, description, incident pin and live media in a phone-friendly form.' },
    { title: 'Control access', text: 'Keep reporter details private and limit each official to their assigned wards.' },
    { title: 'Track', text: 'Give every report a reference and preserve a visible status history through resolution.' },
  ];
  groups.forEach((g, i) => {
    const x = 74 + i * 384;
    addText(slide, `0${i + 1}`, { left: x, top: 210, width: 54, height: 45 }, { size: 29, bold: true, color: C.soft });
    rect(slide, x, 267, 310, 1, C.line);
    addText(slide, g.title, { left: x, top: 289, width: 310, height: 38 }, { size: 27, bold: true });
    addText(slide, g.text, { left: x, top: 339, width: 310, height: 118 }, { size: 21, color: C.muted });
  });
  addText(slide, 'Development method', { left: 74, top: 505, width: 240, height: 28 }, { size: 16, bold: true, color: C.soft });
  const method = ['Stakeholders', 'Requirements', 'Workflow design', 'Implementation', 'Verification'];
  method.forEach((label, i) => {
    const x = 74 + i * 224;
    addText(slide, label, { left: x, top: 547, width: 192, height: 42 }, { size: 18, color: C.text });
    if (i < method.length - 1) rect(slide, x + 192, 556, 20, 1, C.soft);
  });
  note(slide, [
    'The project objectives in the report focus on no-account public intake, evidence and location capture, official role permissions, a reference number, status history and privacy controls.',
    'The report proposes an iterative method: analyse roles and needs, define requirements, design user journeys and data, implement the two portals, then verify them. The current slides distinguish the working prototype from the unexecuted formal test plan.',
    'Source: Nihal Final Report, printed pages 1–2 and 7–8.'
  ]);
}

// 4. Citizen journey
{
  const slide = addBase('Citizen report journey', 4, 'The phone form guides a resident from first contact to a trackable reference.');
  const steps = [
    ['Contact', 'Name and\nself-reported phone'],
    ['Issue', 'Choose a civic\nissue category'],
    ['Capture', 'Take a live\nphoto or video'],
    ['Locate', 'Confirm the GPS\npin on the map'],
    ['Describe', 'Add details\nand severity'],
    ['Submit', 'Review, accept\ndeclaration, get reference'],
  ];
  const x0 = 74;
  const slot = 188;
  const gap = 12;
  const cy = 282;
  rect(slide, x0 + 42, cy + 20, (slot + gap) * 5 - 15, 1, C.line);
  steps.forEach(([title, body], i) => {
    const x = x0 + i * (slot + gap);
    numberMark(slide, i + 1, x, cy, 42);
    addText(slide, title, { left: x, top: cy + 68, width: slot - 4, height: 36 }, { size: 23, bold: true });
    addText(slide, body, { left: x, top: cy + 111, width: slot - 6, height: 72 }, { size: 18, color: C.muted });
  });
  rect(slide, 74, 523, 1134, 1, C.line);
  addText(slide, 'No citizen account or OTP', { left: 74, top: 550, width: 340, height: 30 }, { size: 20, bold: true });
  addText(slide, 'The contact number is self-reported and unverified. A unique reference lets the reporter return to the submission and track updates.', { left: 425, top: 547, width: 783, height: 60 }, { size: 19, color: C.muted });
  note(slide, [
    'Walk through the six public form stages. The current implementation asks for a name and phone number, but it does not send or verify an OTP. The camera and GPS flow is intended for a phone browser.',
    'After submission the system returns a unique reference number. A reporter can use that reference to check the status. Personal contact details are not presented in the public tracking view.',
    'Sources: current client/src/pages/public/Report.tsx and client/src/components/CitizenStartForm.tsx; Nihal Final Report, printed pages 7–8.'
  ]);
}

// 5. Official workflow
{
  const slide = addBase('Official review and area control', 5, 'The official portal keeps report access tied to a person’s assigned role and ward scope.');
  const stages = [
    { title: 'Review', text: 'Check category, location, description and supporting media.' },
    { title: 'Assign', text: 'Route an accepted report to the appropriate official or team.' },
    { title: 'Update', text: 'Record progress and keep earlier status events in the history.' },
    { title: 'Close or reopen', text: 'Add a resolution note and evidence, or return the case to action.' },
  ];
  stages.forEach((s, i) => {
    const x = 74 + i * 287;
    numberMark(slide, i + 1, x, 222, 40);
    addText(slide, s.title, { left: x, top: 284, width: 250, height: 38 }, { size: 24, bold: true });
    addText(slide, s.text, { left: x, top: 334, width: 250, height: 100 }, { size: 19, color: C.muted });
    if (i < stages.length - 1) rect(slide, x + 45, 241, 206, 1, C.line);
  });
  rect(slide, 74, 480, 1134, 1, C.line);
  addText(slide, 'Area administration', { left: 74, top: 511, width: 285, height: 34 }, { size: 21, bold: true });
  addText(slide, 'An owner/admin creates official accounts and assigns permitted wards. Server checks enforce that scope on protected requests.', { left: 370, top: 509, width: 820, height: 65 }, { size: 20, color: C.muted });
  note(slide, [
    'Explain that an official queue is not a citywide public feed. The API applies role and area scope when it returns reports and when an official opens a specific report.',
    'The owner/admin can create an official account and assign wards and optional issue categories. Status history and audit records provide a reviewable record of changes.',
    'Sources: current server/lib/auth.js, server/routes/official.js, server/models/Official.js and client/src/pages/official/admin/Officials.tsx; Nihal Final Report, printed pages 13–18.'
  ]);
}

// 6. Architecture
{
  const slide = addBase('System architecture in the current prototype', 6, 'A browser client and one Node server connect the public and official workflows to MongoDB.');
  const y = 229;
  const h = 154;
  const boxes = [
    { x: 74, w: 315, title: 'Browser client', body: 'React + TypeScript\nCitizen and official portals\nLeaflet with OpenStreetMap' },
    { x: 478, w: 325, title: 'Application server', body: 'Node.js + Express\nValidation, authentication\nArea checks and report workflow' },
    { x: 893, w: 315, title: 'Data storage', body: 'MongoDB Atlas with Mongoose\nReport and account records\nGridFS stores photo/video media' },
  ];
  boxes.forEach((b) => {
    rect(slide, b.x, y, b.w, h, C.surface, C.line, 14);
    addText(slide, b.title, { left: b.x + 22, top: y + 22, width: b.w - 44, height: 32 }, { size: 23, bold: true });
    addText(slide, b.body, { left: b.x + 22, top: y + 69, width: b.w - 44, height: 70 }, { size: 18, color: C.muted });
  });
  rect(slide, 389, y + 75, 89, 2, C.white);
  rect(slide, 803, y + 75, 90, 2, C.white);
  addText(slide, 'HTTPS from a phone on the same Wi-Fi', { left: 74, top: 421, width: 375, height: 29 }, { size: 18, color: C.muted });
  addText(slide, 'OpenStreetMap tiles show map context; the app stores the selected issue coordinates.', { left: 478, top: 421, width: 730, height: 29 }, { size: 18, color: C.muted });
  rect(slide, 74, 490, 1134, 1, C.line);
  addText(slide, 'Implementation note', { left: 74, top: 520, width: 235, height: 28 }, { size: 16, bold: true, color: C.soft });
  addText(slide, 'The report proposes PostgreSQL. The current code uses MongoDB and Mongoose, with GridFS for media.', { left: 310, top: 516, width: 875, height: 52 }, { size: 19, color: C.text });
  note(slide, [
    'Describe the architecture as implemented. Vite builds the React/TypeScript browser client, and the Node/Express server serves it along with the API. MongoDB Atlas stores the application data; the project can also use a built-in local MongoDB for a demo. The media helper stores files in MongoDB GridFS.',
    'Location selection uses Leaflet with OpenStreetMap tiles. On a phone the locally hosted app is opened over HTTPS while the phone and computer share a Wi-Fi network.',
    'Important report-to-code difference: chapter 4 and chapter 5 of the report name PostgreSQL and object storage. The current repository instead uses MongoDB/Mongoose and GridFS. Update the final report so it matches the implementation.',
    'Sources: current package.json, server/db.js, server/app.js, server/lib/media.js, client/src/components/MapView.tsx; Nihal Final Report, printed pages 11–14.'
  ]);
}

// 7. Misuse controls and privacy
{
  const slide = addBase('Misuse controls and privacy boundaries', 7, 'Automated checks flag patterns for review. They do not establish a person’s identity or guilt.');
  addText(slide, 'Signals considered', { left: 74, top: 206, width: 470, height: 38 }, { size: 25, bold: true });
  addText(slide, 'Repeated submissions from a phone or area\nSimilar media used on multiple reports\nLocation distance or photo metadata mismatch\nUnusually fast forms and other abuse signals', { left: 74, top: 264, width: 480, height: 182 }, { size: 21, color: C.muted });
  rect(slide, 607, 202, 1, 250, C.line);
  addText(slide, 'How reviewers should use them', { left: 658, top: 206, width: 520, height: 38 }, { size: 25, bold: true });
  addText(slide, 'Phone details are self-reported and unverified. Device, network and location signals can be inaccurate or shared. A flag supports human review; any restriction or referral requires a recorded decision under the responsible institution’s process.', { left: 658, top: 264, width: 518, height: 220 }, { size: 21, color: C.muted });
  addText(slide, 'Private by design', { left: 74, top: 519, width: 170, height: 28 }, { size: 16, bold: true, color: C.soft });
  addText(slide, 'Reporter contact and original media stay out of public report views.', { left: 246, top: 516, width: 933, height: 40 }, { size: 20, color: C.text });
  note(slide, [
    'Explain that anti-abuse signals include submission bursts, repeated nearby reports, reused or old media, GPS distance and mismatches, device/network reuse and form timing. These are risk indicators, not proof.',
    'This distinction is important because the citizen phone number is not verified after the OTP flow was removed. Reports can be mistaken or malicious, but device and network information cannot reliably identify a person or prove intent. Human reviewers make any recorded restriction or referral decision.',
    'Sources: current server/lib/risk.js, server/models/Reporter.js, server/routes/public.js, client/src/pages/public/About.tsx and client/src/pages/official/Evidence.tsx; Nihal Final Report, printed pages 4 and 22–23.'
  ]);
}

// 8. Issue coverage
{
  const slide = addBase('Bengaluru issue coverage', 8, 'The current category catalogue covers everyday road, sanitation, drainage and public-safety reports.');
  const columns = [
    { x: 74, title: 'Roads and walking', lines: ['Potholes and damaged roads', 'Unrestored road cuts', 'Broken or blocked footpaths', 'Unsafe speed breakers'] },
    { x: 462, title: 'Water and sanitation', lines: ['Garbage dumping or missed collection', 'Construction debris and street cleaning', 'Waterlogging, blocked drains and sewage', 'Open manholes and water-supply issues'] },
    { x: 850, title: 'Public space and safety', lines: ['Broken streetlights and exposed wires', 'Fallen trees and park issues', 'Stray dogs and traffic signals', 'Unsafe construction and encroachment'] },
  ];
  columns.forEach((c, i) => {
    addText(slide, c.title, { left: c.x, top: 219, width: 330, height: 40 }, { size: 23, bold: true });
    rect(slide, c.x, 273, 326, 1, C.line);
    c.lines.forEach((item, j) => addText(slide, item, { left: c.x, top: 299 + j * 61, width: 326, height: 48 }, { size: 19, color: C.muted }));
    if (i < 2) rect(slide, c.x + 350, 218, 1, 350, C.line);
  });
  addText(slide, 'Examples from the app’s current issue catalogue. No complaint-volume percentages are claimed here.', { left: 74, top: 590, width: 1000, height: 30 }, { size: 17, color: C.soft });
  note(slide, [
    'These examples are category labels from the current app. The catalogue includes roads, footpaths, waste, flooding and drains, water supply, streetlights, trees, parks, traffic and public safety, buildings and other issues.',
    'The project report and code mention Bengaluru complaint categories, but this presentation does not claim volume estimates or rankings. Sensitive allegations have restricted handling and should not be blended into the public civic issue list.',
    'Sources: current server/data/categories.js and client/src/pages/public/Home.tsx; Nihal Final Report, printed pages 1 and 5–6.'
  ]);
}

// 9. Prototype status and boundaries
{
  const slide = addBase('What the prototype can show today', 9, 'A working local demonstration is different from an authorised public service.');
  addText(slide, 'Implemented in the app', { left: 74, top: 205, width: 500, height: 38 }, { size: 25, bold: true });
  addText(slide, 'Mobile report flow with camera and GPS\nReference-based tracking and status history\nAuthenticated official portal with ward scope\nAdmin account and area assignment\nEnglish-only monochrome interface', { left: 74, top: 263, width: 495, height: 220 }, { size: 20, color: C.muted });
  rect(slide, 607, 201, 1, 299, C.line);
  addText(slide, 'Not yet established', { left: 658, top: 205, width: 520, height: 38 }, { size: 25, bold: true });
  addText(slide, 'Government integration or agency partnership\nA field pilot or representative usability study\nProduction response-time commitments\nCompleted results for the report’s test matrix', { left: 658, top: 263, width: 518, height: 190 }, { size: 20, color: C.muted });
  addText(slide, 'The citizen-facing Issues Map has been removed. The report pin and authorised official maps remain.', { left: 74, top: 535, width: 1100, height: 43 }, { size: 19, color: C.text });
  note(slide, [
    'The current code supports the citizen report and tracking flows, official login and area-scoped case work, admin account/area management and report location maps. The public Issues Map was removed at the user’s request.',
    'The report itself marks every listed test case “Not executed” and says no live government integration, official partnership, field deployment or measured performance is claimed. A build and TypeScript check were completed for the current code, but these do not replace workflow, security or usability evaluation.',
    'Sources: current client and server implementation; Nihal Final Report, printed pages 20–23.'
  ]);
}

// 10. Next steps
{
  const slide = addBase('Validation and next steps', 10, 'The next milestone is a supervised prototype evaluation with a clear scope and recorded results.');
  const actions = [
    { n: '01', title: 'Test the full flow', text: 'Run citizen submissions and status tracking on desktop and phone.' },
    { n: '02', title: 'Check permissions', text: 'Verify officials cannot read reports outside their assigned wards.' },
    { n: '03', title: 'Review privacy', text: 'Agree on evidence access, retention and correction procedures.' },
    { n: '04', title: 'Plan a small pilot', text: 'Get institutional approval before any public agency integration.' },
  ];
  actions.forEach((a, i) => {
    const x = 74 + i * 287;
    addText(slide, a.n, { left: x, top: 216, width: 55, height: 45 }, { size: 28, bold: true, color: C.soft });
    rect(slide, x, 274, 248, 1, C.line);
    addText(slide, a.title, { left: x, top: 297, width: 250, height: 62 }, { size: 23, bold: true });
    addText(slide, a.text, { left: x, top: 370, width: 250, height: 115 }, { size: 19, color: C.muted });
  });
  rect(slide, 74, 523, 1134, 1, C.line);
  addText(slide, 'Suggested discussion', { left: 74, top: 551, width: 250, height: 28 }, { size: 16, bold: true, color: C.soft });
  addText(slide, 'Which ward and low-risk issue categories should the first supervised demo cover?', { left: 332, top: 547, width: 844, height: 40 }, { size: 21, color: C.text });
  note(slide, [
    'Close by asking the guide to help select a safe, manageable evaluation scope. A useful pilot should test form completion, valid location/media, duplicate flags, time to first review and whether reporters understand the status labels.',
    'The report recommends testing with representative residents and reviewers, completing legal/security review, and obtaining written permission before integration. Keep sensitive allegation intake and public claims out of scope until a competent institution approves the process.',
    'Sources: Nihal Final Report, printed pages 20–23 and appendix pages 25–27.'
  ]);
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, '0')}`;
  await writeBlob(path.join(BUILD, `${stem}.png`), await presentation.export({ slide, format: 'png', scale: 1 }));
}
await writeBlob(path.join(BUILD, 'montage.webp'), await presentation.export({ format: 'webp', montage: true }));
const candidate = path.join(BUILD, 'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
console.log(JSON.stringify({ slideCount: presentation.slides.items.length, candidate, renders: BUILD }));
