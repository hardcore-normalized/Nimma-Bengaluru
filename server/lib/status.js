// Report status lifecycle (Figure 5.3 of the project report).
export const STATUS = {
  SUBMITTED: { label: 'Submitted', publicLabel: 'Received – awaiting review', closed: false },
  UNDER_REVIEW: { label: 'Under review', publicLabel: 'Under review', closed: false },
  NEEDS_CORRECTION: { label: 'Needs correction', publicLabel: 'More information needed from you', closed: false },
  RESUBMITTED: { label: 'Resubmitted', publicLabel: 'Information updated – under review', closed: false },
  ASSIGNED: { label: 'Assigned', publicLabel: 'Assigned to the department', closed: false },
  IN_PROGRESS: { label: 'In progress', publicLabel: 'Work in progress', closed: false },
  AWAITING_VERIFICATION: { label: 'Awaiting verification', publicLabel: 'Work done – being verified', closed: false },
  RESOLVED: { label: 'Resolved', publicLabel: 'Resolved', closed: true },
  REOPENED: { label: 'Reopened', publicLabel: 'Reopened', closed: false },
  REFERRED: { label: 'Referred', publicLabel: 'Referred to the responsible authority', closed: true },
  DUPLICATE: { label: 'Duplicate', publicLabel: 'Closed – already reported', closed: true },
  REJECTED: { label: 'Rejected', publicLabel: 'Closed – not actionable', closed: true },
  SPAM: { label: 'Fake / misuse', publicLabel: 'Closed – rejected as misuse', closed: true },
};

export const STATUS_CODES = Object.keys(STATUS);
export const OPEN_STATUSES = STATUS_CODES.filter((s) => !STATUS[s].closed);
export const CLOSED_STATUSES = STATUS_CODES.filter((s) => STATUS[s].closed);

// Allowed transitions an official can make. (RESUBMITTED is only set by the citizen.)
export const TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW', 'ASSIGNED', 'NEEDS_CORRECTION', 'REFERRED', 'DUPLICATE', 'REJECTED', 'SPAM'],
  UNDER_REVIEW: ['ASSIGNED', 'NEEDS_CORRECTION', 'REFERRED', 'DUPLICATE', 'REJECTED', 'SPAM'],
  NEEDS_CORRECTION: ['UNDER_REVIEW', 'REJECTED', 'SPAM'],
  RESUBMITTED: ['UNDER_REVIEW', 'ASSIGNED', 'NEEDS_CORRECTION', 'REFERRED', 'DUPLICATE', 'REJECTED', 'SPAM'],
  ASSIGNED: ['IN_PROGRESS', 'UNDER_REVIEW', 'REFERRED'],
  IN_PROGRESS: ['AWAITING_VERIFICATION', 'ASSIGNED'],
  AWAITING_VERIFICATION: ['RESOLVED', 'IN_PROGRESS'],
  RESOLVED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'ASSIGNED'],
  REFERRED: ['REOPENED', 'UNDER_REVIEW'],
  DUPLICATE: ['UNDER_REVIEW'],
  REJECTED: ['UNDER_REVIEW'],
  SPAM: [], // reversing a misuse decision is an admin-only action (see routes)
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

// Statuses that need a written reason
export const REASON_REQUIRED = new Set(['NEEDS_CORRECTION', 'REFERRED', 'DUPLICATE', 'REJECTED', 'SPAM', 'REOPENED', 'IN_PROGRESS', 'RESOLVED']);
