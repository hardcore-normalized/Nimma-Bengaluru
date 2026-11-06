// Departments / agencies that a report can be routed to.
// These are routing suggestions for the prototype. In a real deployment the
// mapping must be confirmed by the agencies themselves (see report, Appendix A).
export const DEPARTMENTS = [
  { code: 'ROADS', name: 'Road Infrastructure (City Corporation Engineering)', short: 'Roads' },
  { code: 'ELECTRICAL', name: 'Electrical – Streetlights (City Corporation)', short: 'Streetlights' },
  { code: 'SWM', name: 'Bengaluru Solid Waste Management Ltd (BSWML)', short: 'BSWML' },
  { code: 'SWD', name: 'Storm Water Drains (GBA)', short: 'Storm Water Drains' },
  { code: 'BWSSB', name: 'BWSSB – Water Supply & Sewerage', short: 'BWSSB' },
  { code: 'BESCOM', name: 'BESCOM – Electricity Supply', short: 'BESCOM' },
  { code: 'FOREST', name: 'Forest Cell – Trees (GBA)', short: 'Forest Cell' },
  { code: 'VET', name: 'Animal Husbandry & Veterinary (GBA)', short: 'Veterinary' },
  { code: 'HEALTH', name: 'Public Health (City Corporation)', short: 'Health' },
  { code: 'TOWNPLAN', name: 'Town Planning (City Corporation)', short: 'Town Planning' },
  { code: 'ADVT', name: 'Advertisement Cell (GBA)', short: 'Advertisement' },
  { code: 'LAKES', name: 'Lakes Division (GBA)', short: 'Lakes' },
  { code: 'HORTI', name: 'Horticulture – Parks (GBA)', short: 'Parks' },
  { code: 'TRAFFIC', name: 'Bengaluru Traffic Police', short: 'Traffic Police' },
  { code: 'REVENUE', name: 'Revenue & Encroachment Removal (City Corporation)', short: 'Encroachment' },
  { code: 'VIGILANCE', name: 'Vigilance Cell (referral to Karnataka Lokayukta)', short: 'Vigilance' },
  { code: 'WARD', name: 'Ward Office (General)', short: 'Ward Office' },
];

export const DEPARTMENT_BY_CODE = Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d]));
