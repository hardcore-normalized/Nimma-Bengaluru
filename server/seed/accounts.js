// The single administrator account. The admin sees and manages reports from all
// 369 wards. Change this password after the demo (Official portal → Change password).
export const DEMO_ACCOUNTS = [
  {
    username: 'admin',
    password: 'Admin@2026',
    name: 'Portal Administrator',
    designation: 'System Administrator',
    role: 'admin',
    department: 'WARD',
    areas: [],
    canViewSensitive: true,
    email: 'admin@nimmabengaluru.demo',
  },
];

// Ward-officer demo accounts from the earlier multi-official version. They are
// removed on start-up so that only the administrator can sign in.
export const RETIRED_ACCOUNTS = ['ravi.central', 'priya.east', 'arjun.south'];
