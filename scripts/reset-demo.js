// Seed demo accounts and sample reports. Existing non-demo data is preserved.
// To replace sample data only, run: npm run reset-demo
import { connectDatabase, closeDatabase, dbInfo } from '../server/db.js';
import { config } from '../server/env.js';
import { seedAll, wipeDemoData } from '../server/seed/seed.js';

const reset = process.argv.includes('--reset');
try {
  await connectDatabase();
  if (reset) {
    console.log('  > Removing only records marked as demo data...');
    await wipeDemoData();
  }
  const result = await seedAll({ demo: config.seedDemoData });
  console.log(`  ✓ ${dbInfo.label}`);
  console.log(`  ✓ Created ${result.accounts} missing demo account(s)`);
  if (result.data?.skipped) console.log('  · Sample reports were skipped because data already exists or SEED_DEMO_DATA is disabled.');
  else console.log(`  ✓ Loaded ${result.data.reports} sample reports from ${result.data.reporters} sample reporters`);
} catch (error) {
  console.error('  ✗ Could not seed demo data:', error?.message || error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
